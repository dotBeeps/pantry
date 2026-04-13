// Package thought implements the core thought cycle: sensory context → LLM → tool calls → nerve actions.
package thought

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/llm"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// OutputHook is called for each piece of text output produced during a thought cycle.
// Includes LLM text blocks, think tool content, and speak tool content.
type OutputHook func(text string)

// Cycle orchestrates a single thought cycle for a persona.
type Cycle struct {
	persona     *persona.Persona
	ledger      *attention.Ledger
	sensory     *sensory.Aggregator
	nerves      map[string]nerve.Nerve
	vault       *memory.Vault
	convo       *conversation.Ledger
	provider    llm.Provider
	log         *slog.Logger
	outputHooks []OutputHook
}

// New creates a Cycle wired to the given components.
func New(
	p *persona.Persona,
	ledger *attention.Ledger,
	agg *sensory.Aggregator,
	nerves []nerve.Nerve,
	vault *memory.Vault,
	convo *conversation.Ledger,
	provider llm.Provider,
	log *slog.Logger,
) *Cycle {
	nerveMap := make(map[string]nerve.Nerve, len(nerves))
	for _, n := range nerves {
		nerveMap[n.ID()] = n
	}
	return &Cycle{
		persona:  p,
		ledger:   ledger,
		sensory:  agg,
		nerves:   nerveMap,
		vault:    vault,
		convo:    convo,
		provider: provider,
		log:      log,
	}
}

// OnOutput registers a hook called for every piece of text the thought cycle produces.
// Safe to call concurrently. Hooks are called in registration order.
func (c *Cycle) OnOutput(hook OutputHook) {
	c.outputHooks = append(c.outputHooks, hook)
}

func (c *Cycle) fireOutput(text string) {
	for _, h := range c.outputHooks {
		h(text)
	}
}

// Run executes one full thought cycle: snapshot → LLM → tools → ledger update.
func (c *Cycle) Run(ctx context.Context) error {
	start := time.Now()
	c.log.Info("thought cycle starting", "persona", c.persona.Persona.Name)

	// 1. Assemble sensory snapshot (nerve states + events + pinned memories).
	nerveStates, err := c.gatherNerveStates(ctx)
	if err != nil {
		c.log.Warn("partial nerve state failure", "err", err)
	}
	snap := c.sensory.Snapshot(c.ledger.Pool(), nerveStates)

	// 2. Build system prompt, tools, and context message.
	systemPrompt := c.buildSystemPrompt()
	tools := c.buildTools()
	contextMsg := c.buildContextMessage(snap)

	// 3. Run the provider — it manages its own multi-turn loop if needed.
	var totalCost int
	err = c.provider.Run(ctx, systemPrompt, contextMsg, tools,
		func(text string) {
			if strings.TrimSpace(text) != "" {
				_, _ = fmt.Fprintf(os.Stdout, "\n[%s thought] %s\n", c.persona.Persona.Name, text)
				c.fireOutput(text)
				if c.convo != nil {
					c.convo.Append(conversation.Entry{
						Role: c.persona.Persona.Name, Content: text, Source: "thought",
					})
				}
			}
		},
		func(call llm.ToolCall) (string, bool) {
			result, cost, execErr := c.dispatchTool(ctx, call)
			totalCost += cost
			if execErr != nil {
				c.log.Warn("tool execution failed", "tool", call.Name, "err", execErr)
				return fmt.Sprintf("error: %s", execErr), true
			}
			return result, false
		},
	)
	if err != nil {
		return fmt.Errorf("LLM run: %w", err)
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

// gatherNerveStates collects state summaries from all connected nerves.
func (c *Cycle) gatherNerveStates(ctx context.Context) ([]sensory.NerveState, error) {
	var states []sensory.NerveState
	var errs []string
	for _, n := range c.nerves {
		state, err := n.State(ctx)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", n.ID(), err))
			continue
		}
		states = append(states, state)
	}
	if len(errs) > 0 {
		return states, fmt.Errorf("nerve state errors: %s", strings.Join(errs, "; "))
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
//
//nolint:revive // strings.Builder.WriteString never returns an error
func (c *Cycle) buildContextMessage(snap sensory.Snapshot) string {
	var sb strings.Builder

	fmt.Fprintf(&sb, "## Sensory Context — %s\n\n", snap.Timestamp.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&sb, "**Attention:** %d units\n\n", snap.AttentionPool)

	// Pinned memories surface every cycle.
	if c.vault != nil {
		if pinned, err := c.vault.Pinned(); err == nil && len(pinned) > 0 {
			sb.WriteString("### Pinned Memories\n\n")
			for _, n := range pinned {
				fmt.Fprintf(&sb, "**[%s]** %s\n\n", n.Frontmatter.Key, n.Summary())
			}
		}
	}

	// Conversation context.
	if c.convo != nil {
		if convoBlock := c.convo.Render(); convoBlock != "" {
			sb.WriteString(convoBlock)
		}
	}

	if len(snap.NerveStates) > 0 {
		sb.WriteString("### Nerve States\n\n")
		for _, ns := range snap.NerveStates {
			fmt.Fprintf(&sb, "**%s** (%s):\n%s\n\n", ns.ID, ns.Type, ns.Summary)
		}
	}

	if len(snap.RecentEvents) > 0 {
		sb.WriteString("### Recent Events\n\n")
		for _, e := range snap.RecentEvents {
			fmt.Fprintf(&sb, "- [%s] %s — %s\n", e.Source, e.Kind, e.Content)
		}
		sb.WriteString("\n")
	}

	sb.WriteString("---\n\nTake a moment to think. What do you observe? What's on your mind?")
	return sb.String()
}

// buildTools assembles the tool definitions from builtins and connected nerves.
func (c *Cycle) buildTools() []llm.Tool {
	builtins := []llm.Tool{
		{
			Name:        "think",
			Description: "Express inner thought or reasoning. Use freely — thinking is cheap.",
			Properties: map[string]any{
				"content": map[string]any{"type": "string", "description": "Inner monologue content."},
			},
			Required: []string{"content"},
		},
		{
			Name:        "speak",
			Description: "Voice something aloud — to the world, to yourself, to no one in particular.",
			Properties: map[string]any{
				"content": map[string]any{"type": "string", "description": "What to say."},
			},
			Required: []string{"content"},
		},
		{
			Name:        "remember",
			Description: "Write something to persistent memory. Stored as a markdown note in the vault.",
			Properties: map[string]any{
				"key":     map[string]any{"type": "string", "description": "Unique memory key."},
				"content": map[string]any{"type": "string", "description": "What to remember."},
				"kind": map[string]any{
					"type":        "string",
					"enum":        []string{"observation", "decision", "insight", "wondering", "fragment"},
					"description": "The nature of this memory.",
				},
				"tags":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Optional tags."},
				"pinned": map[string]any{"type": "boolean", "description": "If true, surfaces in every thought cycle."},
			},
			Required: []string{"key", "content"},
		},
		{
			Name:        "search_memory",
			Description: "Search past memories by keyword. Returns matching note summaries.",
			Properties: map[string]any{
				"query": map[string]any{"type": "string", "description": "Keywords to search for."},
			},
			Required: []string{"query"},
		},
	}

	tools := make([]llm.Tool, 0, len(builtins))
	tools = append(tools, builtins...)

	for _, n := range c.nerves {
		for _, td := range n.Tools() {
			props, _ := td.Parameters["properties"].(map[string]any)
			tools = append(tools, llm.Tool{
				Name:        td.Name,
				Description: td.Description,
				Properties:  props,
			})
		}
	}
	return tools
}

// dispatchTool executes a single tool call and returns (result, attentionCost, error).
func (c *Cycle) dispatchTool(ctx context.Context, call llm.ToolCall) (string, int, error) {
	var args map[string]any
	if err := json.Unmarshal(call.Input, &args); err != nil {
		return "", 0, fmt.Errorf("parsing tool args: %w", err)
	}

	c.log.Debug("dispatching tool", "name", call.Name, "id", call.ID)
	costs := c.persona.Costs

	switch call.Name {
	case "think":
		content, _ := args["content"].(string)
		_, _ = fmt.Fprintf(os.Stdout, "\n💭 [%s] %s\n", c.persona.Persona.Name, content)
		c.fireOutput(content)
		return "thought noted", costs.Think, nil

	case "speak":
		content, _ := args["content"].(string)
		_, _ = fmt.Fprintf(os.Stdout, "\n🔥 [%s speaks] %s\n", c.persona.Persona.Name, content)
		c.fireOutput(content)
		if c.convo != nil {
			c.convo.Append(conversation.Entry{
				Role: c.persona.Persona.Name, Content: content, Source: "thought",
			})
		}
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
		case memory.KindDecision, memory.KindInsight, memory.KindWondering, memory.KindFragment, memory.KindJournal:
			kind = memory.Kind(kindStr)
		}
		note, err := c.vault.Write(key, kind, content, tags, pinned, memory.TierUnset)
		if err != nil {
			return "", costs.Remember, fmt.Errorf("writing memory: %w", err)
		}
		_, _ = fmt.Fprintf(os.Stdout, "\n📖 [%s memory/%s] %s\n", c.persona.Persona.Name, note.Frontmatter.Kind, key)
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
		for _, n := range c.nerves {
			for _, td := range n.Tools() {
				if td.Name == call.Name {
					result, err := n.Execute(ctx, call.Name, args)
					if err != nil {
						return "", costs.Perceive, fmt.Errorf("nerve tool %s: %w", call.Name, err)
					}
					return result, costs.Perceive, nil
				}
			}
		}
		return "", 0, fmt.Errorf("unknown tool: %s", call.Name)
	}
}
