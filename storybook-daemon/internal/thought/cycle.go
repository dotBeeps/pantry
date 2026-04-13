// Package thought implements the core thought cycle: sensory context → pi → output.
package thought

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// OutputHook is called for each piece of text output produced during a thought cycle.
type OutputHook func(text string)

// Cycle orchestrates a single thought cycle for a persona.
type Cycle struct {
	persona *persona.Persona
	ledger  *attention.Ledger
	sensory *sensory.Aggregator
	nerves  map[string]nerve.Nerve
	vault   *memory.Vault
	convo   *conversation.Ledger
	pi      PiConfig
	log     *slog.Logger

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
	pi PiConfig,
	log *slog.Logger,
) *Cycle {
	nerveMap := make(map[string]nerve.Nerve, len(nerves))
	for _, n := range nerves {
		nerveMap[n.ID()] = n
	}
	return &Cycle{
		persona: p,
		ledger:  ledger,
		sensory: agg,
		nerves:  nerveMap,
		vault:   vault,
		convo:   convo,
		pi:      pi,
		log:     log,
	}
}

// OnOutput registers a hook called for every piece of text the thought cycle produces.
func (c *Cycle) OnOutput(hook OutputHook) {
	c.outputHooks = append(c.outputHooks, hook)
}

func (c *Cycle) fireOutput(text string) {
	for _, h := range c.outputHooks {
		h(text)
	}
}

// Run executes one full thought cycle: snapshot → pi → output → attention deduction.
func (c *Cycle) Run(ctx context.Context) error {
	start := time.Now()
	c.log.Info("thought cycle starting", "persona", c.persona.Persona.Name)

	// 1. Assemble sensory snapshot.
	nerveStates, err := c.gatherNerveStates(ctx)
	if err != nil {
		c.log.Warn("partial nerve state failure", "err", err)
	}
	snap := c.sensory.Snapshot(c.ledger.Pool(), nerveStates)

	// 2. Build sensory-only context message (no conversation — pi owns that).
	contextMsg := c.buildContextMessage(snap)

	// 3. Run pi subprocess.
	output, err := runPi(ctx, c.pi, contextMsg)
	if err != nil {
		return fmt.Errorf("pi run: %w", err)
	}

	// 4. Process output.
	if output != "" {
		_, _ = fmt.Fprintf(os.Stdout, "\n[%s] %s\n", c.persona.Persona.Name, output)
		c.fireOutput(output)
		if c.convo != nil {
			c.convo.Append(conversation.Entry{
				Role: c.persona.Persona.Name, Content: output, Source: "thought",
			})
		}
	}

	// 5. Deduct flat beat cost.
	beatCost := c.persona.Costs.Beat
	if beatCost > 0 {
		if err := c.ledger.Spend("beat", beatCost); err != nil {
			c.log.Warn("attention spend failed", "cost", beatCost, "err", err)
		}
	}

	c.log.Info("thought cycle complete",
		"duration", time.Since(start).Round(time.Millisecond),
		"attention_spent", beatCost,
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

// buildContextMessage formats the sensory snapshot as the beat message.
// Sensory-only: nerves, events, attention, pinned memories. No conversation
// replay — pi maintains its own multi-turn context via the session file.
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
