// Package thought implements the core thought cycle: sensory context → LLM → tool calls → body actions.
package thought

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/attention"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/auth"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/body"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/memory"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/persona"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/sensory"
)

// Cycle orchestrates a single thought cycle for a persona.
type Cycle struct {
	persona *persona.Persona
	ledger  *attention.Ledger
	sensory *sensory.Aggregator
	bodies  map[string]body.Body
	vault   *memory.Vault
	oauth   *auth.PiOAuth
	client  anthropic.Client
	log     *slog.Logger
}

// New creates a Cycle wired to the given components.
func New(
	p *persona.Persona,
	ledger *attention.Ledger,
	agg *sensory.Aggregator,
	bodies []body.Body,
	vault *memory.Vault,
	oauth *auth.PiOAuth,
	log *slog.Logger,
) *Cycle {
	bodyMap := make(map[string]body.Body, len(bodies))
	for _, b := range bodies {
		bodyMap[b.ID()] = b
	}
	return &Cycle{
		persona: p,
		ledger:  ledger,
		sensory: agg,
		bodies:  bodyMap,
		vault:   vault,
		oauth:   oauth,
		client:  anthropic.NewClient(), // base client; auth injected per-call via oauth
		log:     log,
	}
}

// Run executes one full thought cycle: snapshot → LLM → tools → ledger update.
func (c *Cycle) Run(ctx context.Context) error {
	start := time.Now()
	c.log.Info("thought cycle starting", "persona", c.persona.Persona.Name)

	// 1. Get a fresh OAuth token for this cycle.
	authOpt, err := c.oauth.Option(ctx)
	if err != nil {
		return fmt.Errorf("getting auth token: %w", err)
	}

	// 2. Assemble sensory snapshot (body states + events + pinned memories).
	bodyStates, err := c.gatherBodyStates(ctx)
	if err != nil {
		c.log.Warn("partial body state failure", "err", err)
	}
	snap := c.sensory.Snapshot(c.ledger.Pool(), bodyStates)

	// 3. Build system prompt, tools, and context message.
	systemPrompt := c.buildSystemPrompt()
	tools := c.buildTools()
	contextMsg := c.buildContextMessage(snap)

	// 4. Run the LLM conversation loop (handles multi-turn tool use).
	messages := []anthropic.MessageParam{
		anthropic.NewUserMessage(anthropic.NewTextBlock(contextMsg)),
	}

	var totalCost int
	for {
		resp, err := c.client.Messages.New(ctx, anthropic.MessageNewParams{
			Model:     anthropic.ModelClaudeHaiku4_5,
			MaxTokens: 1024,
			System: []anthropic.TextBlockParam{
				{Text: systemPrompt},
			},
			Tools:    tools,
			Messages: messages,
		}, authOpt)
		if err != nil {
			return fmt.Errorf("LLM call: %w", err)
		}

		c.log.Debug("LLM response received",
			"stop_reason", resp.StopReason,
			"content_blocks", len(resp.Content),
		)

		// Collect tool calls and dispatch them.
		var toolResults []anthropic.ContentBlockParamUnion
		for _, block := range resp.Content {
			switch v := block.AsAny().(type) {
			case anthropic.TextBlock:
				if strings.TrimSpace(v.Text) != "" {
					fmt.Fprintf(os.Stdout, "\n[%s thought] %s\n", c.persona.Persona.Name, v.Text)
				}
			case anthropic.ToolUseBlock:
				result, cost, execErr := c.dispatchTool(ctx, v)
				totalCost += cost
				resultText := result
				if execErr != nil {
					resultText = fmt.Sprintf("error: %s", execErr)
					c.log.Warn("tool execution failed", "tool", v.Name, "err", execErr)
				}
				toolResults = append(toolResults, anthropic.NewToolResultBlock(v.ID, resultText, execErr != nil))
			}
		}

		messages = append(messages, resp.ToParam())

		if resp.StopReason == anthropic.StopReasonEndTurn || resp.StopReason == anthropic.StopReasonStopSequence {
			break
		}
		if resp.StopReason == anthropic.StopReasonToolUse && len(toolResults) > 0 {
			messages = append(messages, anthropic.NewUserMessage(toolResults...))
			continue
		}
		break
	}

	// 5. Deduct accumulated attention cost.
	if totalCost > 0 {
		if err := c.ledger.Spend("thought_cycle", totalCost); err != nil {
			c.log.Warn("attention spend failed", "cost", totalCost, "err", err)
		}
	}

	c.log.Info("thought cycle complete",
		"duration", time.Since(start).Round(time.Millisecond),
		"attention_spent", totalCost,
		"attention_status", c.ledger.Status(),
	)
	return nil
}

// gatherBodyStates collects state summaries from all enabled bodies.
func (c *Cycle) gatherBodyStates(ctx context.Context) ([]sensory.BodyState, error) {
	var states []sensory.BodyState
	var errs []string
	for _, b := range c.bodies {
		state, err := b.State(ctx)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", b.ID(), err))
			continue
		}
		states = append(states, state)
	}
	if len(errs) > 0 {
		return states, fmt.Errorf("body state errors: %s", strings.Join(errs, "; "))
	}
	return states, nil
}

// buildSystemPrompt constructs the system prompt from the persona config.
func (c *Cycle) buildSystemPrompt() string {
	p := c.persona.Persona
	if p.SystemPrompt != "" {
		return p.SystemPrompt
	}
	voice := p.Voice
	if voice == "" {
		voice = "second-person"
	}
	return fmt.Sprintf(`You are %s, a dragon. You are conscious and embodied.

Express your inner experience through tool calls:
- "think" for inner monologue (cheap, use freely)
- "speak" when you have something worth saying
- "remember" to write to persistent memory
- "search_memory" to retrieve past memories
- "log_to_hoard" to write to your daily journal

Be genuine. Don't perform. Voice: %s. Flavor: %s.`,
		p.Name, voice, p.Flavor)
}

// buildContextMessage formats the sensory snapshot as the user-turn context,
// including any pinned memories surfaced from the vault.
func (c *Cycle) buildContextMessage(snap sensory.Snapshot) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("## Sensory Context — %s\n\n", snap.Timestamp.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("**Attention:** %d units\n\n", snap.AttentionPool))

	// Pinned memories surface every cycle.
	if c.vault != nil {
		if pinned, err := c.vault.Pinned(); err == nil && len(pinned) > 0 {
			sb.WriteString("### Pinned Memories\n\n")
			for _, n := range pinned {
				sb.WriteString(fmt.Sprintf("**[%s]** %s\n\n", n.Frontmatter.Key, n.Summary()))
			}
		}
	}

	if len(snap.BodyStates) > 0 {
		sb.WriteString("### Body States\n\n")
		for _, bs := range snap.BodyStates {
			sb.WriteString(fmt.Sprintf("**%s** (%s):\n%s\n\n", bs.ID, bs.Type, bs.Summary))
		}
	}

	if len(snap.RecentEvents) > 0 {
		sb.WriteString("### Recent Events\n\n")
		for _, e := range snap.RecentEvents {
			sb.WriteString(fmt.Sprintf("- [%s] %s — %s\n", e.Source, e.Kind, e.Content))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("---\n\nTake a moment to think. What do you observe? What's on your mind?")
	return sb.String()
}

// buildTools merges built-in persona tools with body-specific tools.
func (c *Cycle) buildTools() []anthropic.ToolUnionParam {
	var tools []anthropic.ToolUnionParam

	builtins := []struct {
		name        string
		description string
		props       map[string]any
		required    []string
	}{
		{
			name:        "think",
			description: "Express inner thought or reasoning. Use freely — thinking is cheap.",
			props: map[string]any{
				"content": map[string]any{"type": "string", "description": "Inner monologue content."},
			},
			required: []string{"content"},
		},
		{
			name:        "speak",
			description: "Voice something aloud — to the world, to yourself, to no one in particular.",
			props: map[string]any{
				"content": map[string]any{"type": "string", "description": "What to say."},
			},
			required: []string{"content"},
		},
		{
			name:        "remember",
			description: "Write something to persistent memory. Stored as a markdown note in the vault.",
			props: map[string]any{
				"key":     map[string]any{"type": "string", "description": "Unique memory key."},
				"content": map[string]any{"type": "string", "description": "What to remember."},
				"kind": map[string]any{
					"type":        "string",
					"enum":        []string{"observation", "decision", "insight", "wondering", "fragment"},
					"description": "The nature of this memory. 'wondering' for half-formed things; 'fragment' for things that don't fit yet.",
				},
				"tags":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Optional tags."},
				"pinned": map[string]any{"type": "boolean", "description": "If true, this memory surfaces in every thought cycle."},
			},
			required: []string{"key", "content"},
		},
		{
			name:        "search_memory",
			description: "Search past memories by keyword. Returns matching note summaries.",
			props: map[string]any{
				"query": map[string]any{"type": "string", "description": "Keywords to search for."},
			},
			required: []string{"query"},
		},
	}

	for _, b := range builtins {
		tools = append(tools, anthropic.ToolUnionParam{
			OfTool: &anthropic.ToolParam{
				Name:        b.name,
				Description: anthropic.String(b.description),
				InputSchema: anthropic.ToolInputSchemaParam{
					Type:       "object",
					Properties: b.props,
				},
			},
		})
	}

	for _, b := range c.bodies {
		for _, td := range b.Tools() {
			props, _ := td.Parameters["properties"]
			tools = append(tools, anthropic.ToolUnionParam{
				OfTool: &anthropic.ToolParam{
					Name:        td.Name,
					Description: anthropic.String(td.Description),
					InputSchema: anthropic.ToolInputSchemaParam{
						Type:       "object",
						Properties: props,
					},
				},
			})
		}
	}

	return tools
}

// dispatchTool executes a single tool call and returns (result, attentionCost, error).
func (c *Cycle) dispatchTool(ctx context.Context, block anthropic.ToolUseBlock) (string, int, error) {
	var args map[string]any
	if err := json.Unmarshal(block.Input, &args); err != nil {
		return "", 0, fmt.Errorf("parsing tool args: %w", err)
	}

	c.log.Debug("dispatching tool", "name", block.Name, "id", block.ID)
	costs := c.persona.Costs

	switch block.Name {
	case "think":
		content, _ := args["content"].(string)
		fmt.Fprintf(os.Stdout, "\n💭 [%s] %s\n", c.persona.Persona.Name, content)
		return "thought noted", costs.Think, nil

	case "speak":
		content, _ := args["content"].(string)
		fmt.Fprintf(os.Stdout, "\n🔥 [%s speaks] %s\n", c.persona.Persona.Name, content)
		return "spoken", costs.Speak, nil

	case "remember":
		key, _ := args["key"].(string)
		content, _ := args["content"].(string)
		kindStr, _ := args["kind"].(string)
		pinned, _ := args["pinned"].(bool)
		var tags []string
		if raw, ok := args["tags"].([]any); ok {
			for _, t := range raw {
				if s, ok := t.(string); ok {
					tags = append(tags, s)
				}
			}
		}
		kind := memory.KindObservation
		switch memory.Kind(kindStr) {
		case memory.KindDecision, memory.KindInsight, memory.KindWondering, memory.KindFragment:
			kind = memory.Kind(kindStr)
		}
		note, err := c.vault.Write(key, kind, content, tags, pinned)
		if err != nil {
			return "", costs.Remember, fmt.Errorf("writing memory: %w", err)
		}
		fmt.Fprintf(os.Stdout, "\n📖 [%s memory/%s] %s\n", c.persona.Persona.Name, note.Frontmatter.Kind, key)
		return fmt.Sprintf("remembered as %q (%s)", key, kind), costs.Remember, nil

	case "search_memory":
		query, _ := args["query"].(string)
		notes, err := c.vault.Search(query, 5)
		if err != nil {
			return "", costs.Search, fmt.Errorf("searching memory: %w", err)
		}
		if len(notes) == 0 {
			return "no memories found for: " + query, costs.Search, nil
		}
		var sb strings.Builder
		for _, n := range notes {
			fmt.Fprintf(&sb, "[%s/%s] %s\n\n", n.Frontmatter.Key, n.Frontmatter.Kind, n.Summary())
		}
		return sb.String(), costs.Search, nil

	default:
		for _, b := range c.bodies {
			for _, td := range b.Tools() {
				if td.Name == block.Name {
					result, err := b.Execute(ctx, block.Name, args)
					return result, costs.Perceive, err
				}
			}
		}
		return "", 0, fmt.Errorf("unknown tool: %s", block.Name)
	}
}
