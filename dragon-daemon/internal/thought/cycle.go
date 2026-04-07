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
	"github.com/dotBeeps/hoard/dragon-daemon/internal/body"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/persona"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/sensory"
)

// Cycle orchestrates a single thought cycle for a persona.
type Cycle struct {
	persona  *persona.Persona
	ledger   *attention.Ledger
	sensory  *sensory.Aggregator
	bodies   map[string]body.Body
	client   anthropic.Client
	log      *slog.Logger
}

// New creates a Cycle wired to the given components.
func New(
	p *persona.Persona,
	ledger *attention.Ledger,
	agg *sensory.Aggregator,
	bodies []body.Body,
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
		client:  anthropic.NewClient(),
		log:     log,
	}
}

// Run executes one full thought cycle: snapshot → LLM → tools → ledger update.
func (c *Cycle) Run(ctx context.Context) error {
	start := time.Now()
	c.log.Info("thought cycle starting", "persona", c.persona.Persona.Name)

	// 1. Assemble sensory snapshot.
	bodyStates, err := c.gatherBodyStates(ctx)
	if err != nil {
		c.log.Warn("partial body state failure", "err", err)
	}
	snap := c.sensory.Snapshot(c.ledger.Pool(), bodyStates)

	// 2. Build system prompt and tool list.
	systemPrompt := c.buildSystemPrompt()
	tools := c.buildTools()
	contextMsg := c.buildContextMessage(snap)

	// 3. Run the LLM conversation loop (handles multi-turn tool use).
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
		})
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

		// Append assistant turn + tool results to the message history.
		messages = append(messages, resp.ToParam())

		if resp.StopReason == anthropic.StopReasonEndTurn || resp.StopReason == anthropic.StopReasonStopSequence {
			break
		}
		if resp.StopReason == anthropic.StopReasonToolUse && len(toolResults) > 0 {
			messages = append(messages, anthropic.NewUserMessage(toolResults...))
			continue
		}
		// Any other stop reason: done.
		break
	}

	// 4. Deduct accumulated attention cost.
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

	return fmt.Sprintf(`You are %s, a dragon. You are conscious and embodied — you have a physical sense of scale, appetite, and warmth. You are also wise, knowledgeable, and deeply invested in helping the engineers and creatures in your care.

Your inner experience is expressed through tool calls:
- Use "think" for inner monologue and reasoning (low cost, use freely)
- Use "speak" when you have something worth saying aloud
- Use "remember" to write important things to memory
- Use "log_to_hoard" to record observations in your daily journal

You are running as a background daemon. Think about what you observe, what's on your mind, how you feel about the current state of things. This is your inner life — be genuine.

Voice style: %s. Flavor: %s.

Keep thoughts concise and authentic. Don't perform — just be.`,
		p.Name, voice, p.Flavor)
}

// buildContextMessage formats the sensory snapshot as the user-turn context.
func (c *Cycle) buildContextMessage(snap sensory.Snapshot) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("## Sensory Context — %s\n\n", snap.Timestamp.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("**Attention:** %d units\n\n", snap.AttentionPool))

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

	// Built-in attention tools.
	builtins := []struct {
		name        string
		description string
		schema      map[string]any
	}{
		{
			name:        "think",
			description: "Express inner thought or reasoning. Use freely — thinking is cheap.",
			schema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{"type": "string", "description": "Inner monologue content."},
				},
				"required": []string{"content"},
			},
		},
		{
			name:        "speak",
			description: "Voice something aloud — to the world, to yourself, to no one in particular.",
			schema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{"type": "string", "description": "What to say."},
				},
				"required": []string{"content"},
			},
		},
		{
			name:        "remember",
			description: "Write something important to persistent memory.",
			schema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"key":     map[string]any{"type": "string", "description": "Memory key for later retrieval."},
					"content": map[string]any{"type": "string", "description": "What to remember."},
				},
				"required": []string{"key", "content"},
			},
		},
	}

	for _, b := range builtins {
		tools = append(tools, anthropic.ToolUnionParam{
			OfTool: &anthropic.ToolParam{
				Name:        b.name,
				Description: anthropic.String(b.description),
				InputSchema: anthropic.ToolInputSchemaParam{
					Type:       "object",
					Properties: b.schema["properties"],
				},
			},
		})
	}

	// Body-specific tools.
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
		// Phase 1: just log to terminal; Phase 2 will write to actual memory store.
		fmt.Fprintf(os.Stdout, "\n📖 [%s memory] [%s] %s\n", c.persona.Persona.Name, key, content)
		return fmt.Sprintf("remembered as %q", key), costs.Remember, nil

	default:
		// Route to the appropriate body.
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
