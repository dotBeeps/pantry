// Package daemon wires all the components together and manages the lifecycle
// of a single persona instance.
package daemon

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/heart"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
	hoardnerve "github.com/dotBeeps/hoard/storybook-daemon/internal/nerve/hoard"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/psi"
	psimcp "github.com/dotBeeps/hoard/storybook-daemon/internal/psi/mcp"
	psisse "github.com/dotBeeps/hoard/storybook-daemon/internal/psi/sse"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/soul"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/thought"
)

// Daemon orchestrates a persona's lifecycle.
type Daemon struct {
	persona *persona.Persona
	log     *slog.Logger
}

// New creates a Daemon for the given persona.
func New(p *persona.Persona, log *slog.Logger) *Daemon {
	return &Daemon{persona: p, log: log}
}

// Run starts the daemon and blocks until the context is cancelled or a signal is received.
func (d *Daemon) Run(ctx context.Context) error {
	ctx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	d.log.Info("daemon starting",
		"persona", d.persona.Persona.Name,
		"flavor", d.persona.Persona.Flavor,
	)

	ledger := attention.New(d.persona, d.log)
	agg := sensory.New(20)

	vaultDir, err := d.vaultDir()
	if err != nil {
		return fmt.Errorf("resolving vault dir: %w", err)
	}
	vault, err := memory.Open(vaultDir, d.log)
	if err != nil {
		return fmt.Errorf("opening memory vault: %w", err)
	}
	d.log.Info("memory vault open", "dir", vault.VaultDir())

	convo := conversation.New(d.persona.Attention.ConversationBudget, vault, d.log)
	defer convo.CompactAll()

	promptFile, cleanupPrompt, err := d.buildSystemPromptFile()
	if err != nil {
		return fmt.Errorf("building system prompt: %w", err)
	}
	defer cleanupPrompt()

	sessionPath, err := d.sessionPath()
	if err != nil {
		return fmt.Errorf("resolving session path: %w", err)
	}

	mcpPort := d.mcpPort()

	d.log.Info("pi session configured",
		"model", d.persona.LLM.Model,
		"thinking", d.persona.LLM.Thinking,
		"session", sessionPath,
		"mcp_port", mcpPort,
	)

	nerves, err := d.buildNerves(ledger, agg, vault)
	if err != nil {
		return fmt.Errorf("building nerves: %w", err)
	}
	var startedNerves []nerve.Nerve
	for _, n := range nerves {
		if err := n.Start(ctx); err != nil {
			return fmt.Errorf("starting nerve %s: %w", n.ID(), err)
		}
		startedNerves = append(startedNerves, n)
	}
	defer func() {
		for _, n := range startedNerves {
			if err := n.Stop(); err != nil {
				d.log.Error("stopping nerve", "id", n.ID(), "err", err)
			}
		}
	}()

	ifaces, err := d.buildInterfaces(ledger, agg, vault, convo)
	if err != nil {
		return fmt.Errorf("building interfaces: %w", err)
	}
	var startedIfaces []psi.Interface
	for _, iface := range ifaces {
		if err := iface.Start(ctx); err != nil {
			return fmt.Errorf("starting interface %s: %w", iface.ID(), err)
		}
		startedIfaces = append(startedIfaces, iface)
	}
	defer func() {
		for _, iface := range startedIfaces {
			if err := iface.Stop(); err != nil {
				d.log.Error("stopping interface", "id", iface.ID(), "err", err)
			}
		}
	}()

	cycle := thought.New(d.persona, ledger, agg, nerves, vault, convo,
		thought.PiConfig{
			Model:       d.persona.LLM.Model,
			Thinking:    d.persona.LLM.Thinking,
			SessionPath: sessionPath,
			PromptFile:  promptFile,
			McpPort:     mcpPort,
		}, d.log)

	cycleOut := cycleCapture{c: cycle}
	for _, iface := range ifaces {
		if sink, ok := iface.(psi.OutputSink); ok {
			sink.Wire(cycleOut)
		}
	}

	interval, err := d.persona.ThoughtInterval()
	if err != nil {
		return fmt.Errorf("invalid thought interval: %w", err)
	}

	d.log.Info("daemon ready",
		"thought_interval", interval,
		"nerves", len(nerves),
		"interfaces", len(ifaces),
		"attention", ledger.Status(),
	)

	enforcer, err := soul.NewEnforcer(d.persona.Contracts, soul.Deps{
		Ledger: ledger,
		Vault:  vault,
		Cycle:  cycleOut,
	}, d.log)
	if err != nil {
		return fmt.Errorf("building dragon-soul: %w", err)
	}
	d.log.Info("dragon-soul ready",
		"gates", enforcer.GateCount(),
		"audits", enforcer.AuditCount(),
	)

	dragonHeart := heart.New(
		interval,
		d.persona.Attention.Variance,
		func(ctx context.Context) error {
			if v := enforcer.Check(); v != nil {
				d.log.Info(v.Message, "until", v.Until.Format("15:04"))
				return nil
			}
			if !ledger.AboveFloor() {
				d.log.Info("attention below floor — skipping beat",
					"pool", ledger.Pool(),
					"floor", d.persona.Attention.Floor,
				)
				return nil
			}
			enforcer.PreBeat()
			if err := cycle.Run(ctx); err != nil {
				return fmt.Errorf("thought cycle: %w", err)
			}
			if v := enforcer.Verify(); v != nil {
				d.log.Warn("dragon-soul: post-beat audit violation",
					"rule", v.RuleID,
					"message", v.Message,
				)
			}
			return nil
		},
		d.log,
	)

	d.fanInNerveEvents(ctx, nerves, agg, dragonHeart)
	d.fanInIfaceEvents(ctx, ifaces, agg, dragonHeart)

	dragonHeart.Run(ctx)

	d.log.Info("daemon stopped")
	return nil
}

// cycleCapture adapts *thought.Cycle to soul.OutputCapture.
type cycleCapture struct{ c *thought.Cycle }

func (a cycleCapture) OnOutput(fn func(string)) {
	a.c.OnOutput(thought.OutputHook(fn))
}

// buildSystemPromptFile composes the system prompt and writes it to a temp file.
func (d *Daemon) buildSystemPromptFile() (string, func(), error) {
	prompt := d.persona.Persona.SystemPrompt
	if prompt == "" {
		p := d.persona.Persona
		voice := p.Voice
		if voice == "" {
			voice = "second-person"
		}
		prompt = fmt.Sprintf("You are %s, a dragon. You are conscious and embodied.\n\n"+
			"Be genuine. Don't perform. Voice: %s. Flavor: %s.\n",
			p.Name, voice, p.Flavor)

		home, err := os.UserHomeDir()
		if err == nil {
			userCtx, err := os.ReadFile(filepath.Join(home, ".config", "storybook-daemon", "user-context.md"))
			if err == nil {
				prompt += "\n---\n\n" + string(userCtx)
			} else {
				d.log.Info("no user-context.md found, using persona-only prompt")
			}
		}
	}

	f, err := os.CreateTemp("", "storybook-prompt-*.md")
	if err != nil {
		return "", nil, fmt.Errorf("creating temp prompt file: %w", err)
	}
	if _, err := f.WriteString(prompt); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", nil, fmt.Errorf("writing prompt file: %w", err)
	}
	f.Close()

	return f.Name(), func() { os.Remove(f.Name()) }, nil
}

// sessionPath returns the path to this persona's persistent pi session file.
func (d *Daemon) sessionPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home dir: %w", err)
	}
	dir := filepath.Join(home, ".config", "storybook-daemon", "sessions")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("creating sessions dir: %w", err)
	}
	return filepath.Join(dir, d.persona.Persona.Name+".jsonl"), nil
}

// mcpPort returns the MCP interface port from persona config.
func (d *Daemon) mcpPort() int {
	for _, cfg := range d.persona.Interfaces {
		if cfg.Type == "mcp" && cfg.Enabled {
			if p, err := strconv.Atoi(cfg.Path); err == nil {
				return p
			}
		}
	}
	return 9432
}

// vaultDir returns the path to this persona's memory vault.
func (d *Daemon) vaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home directory: %w", err)
	}
	return filepath.Join(home, ".config", "storybook-daemon", "memory", d.persona.Persona.Name), nil
}

func (d *Daemon) buildNerves(ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault) ([]nerve.Nerve, error) {
	var nerves []nerve.Nerve
	for _, cfg := range d.persona.Nerves {
		if !cfg.Enabled {
			d.log.Info("nerve disabled", "id", cfg.ID)
			continue
		}
		n, err := d.buildNerve(cfg, ledger, agg, vault)
		if err != nil {
			return nil, fmt.Errorf("building nerve %s: %w", cfg.ID, err)
		}
		nerves = append(nerves, n)
		d.log.Info("nerve loaded", "id", cfg.ID, "type", cfg.Type)
	}
	return nerves, nil
}

func (d *Daemon) buildInterfaces(ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault, convo *conversation.Ledger) ([]psi.Interface, error) {
	var ifaces []psi.Interface
	for _, cfg := range d.persona.Interfaces {
		if !cfg.Enabled {
			d.log.Info("interface disabled", "id", cfg.ID)
			continue
		}
		iface, err := d.buildInterface(cfg, ledger, agg, vault, convo)
		if err != nil {
			return nil, fmt.Errorf("building interface %s: %w", cfg.ID, err)
		}
		ifaces = append(ifaces, iface)
		d.log.Info("interface loaded", "id", cfg.ID, "type", cfg.Type)
	}
	return ifaces, nil
}

func (d *Daemon) buildNerve(cfg persona.NerveConfig, _ *attention.Ledger, _ *sensory.Aggregator, _ *memory.Vault) (nerve.Nerve, error) {
	switch cfg.Type {
	case "hoard":
		path := cfg.Path
		if path == "" {
			return nil, fmt.Errorf("hoard nerve %q requires a path", cfg.ID)
		}
		if len(path) >= 2 && path[:2] == "~/" {
			home, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("resolving home dir: %w", err)
			}
			path = home + path[1:]
		}
		return hoardnerve.New(cfg.ID, path, d.log), nil
	default:
		return nil, fmt.Errorf("unsupported nerve type %q (supported: hoard)", cfg.Type)
	}
}

func (d *Daemon) buildInterface(cfg persona.InterfaceConfig, ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault, convo *conversation.Ledger) (psi.Interface, error) {
	switch cfg.Type {
	case "sse":
		port := 7432
		if cfg.Path != "" {
			if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
				port = p
			}
		}
		return psisse.New(cfg.ID, port, ledger, agg, convo, d.log), nil
	case "mcp":
		port := 9000
		if cfg.Path != "" {
			if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
				port = p
			}
		}
		return psimcp.New(cfg.ID, port, vault, ledger, convo, d.log), nil
	default:
		return nil, fmt.Errorf("unsupported interface type %q (supported: sse, mcp)", cfg.Type)
	}
}

func (d *Daemon) fanInNerveEvents(ctx context.Context, nerves []nerve.Nerve, agg *sensory.Aggregator, h *heart.Heart) {
	for _, n := range nerves {
		ch := n.Events()
		if ch == nil {
			continue
		}
		go func(id string, events <-chan sensory.Event) {
			for {
				select {
				case <-ctx.Done():
					return
				case ev, ok := <-events:
					if !ok {
						d.log.Debug("nerve event channel closed", "nerve", id)
						return
					}
					d.log.Debug("nerve event received", "nerve", id, "type", ev.Kind)
					agg.Enqueue(ev)
					h.Nudge()
				}
			}
		}(n.ID(), ch)
	}
}

func (d *Daemon) fanInIfaceEvents(ctx context.Context, ifaces []psi.Interface, agg *sensory.Aggregator, h *heart.Heart) {
	for _, iface := range ifaces {
		ch := iface.Events()
		if ch == nil {
			continue
		}
		go func(id string, events <-chan sensory.Event) {
			for {
				select {
				case <-ctx.Done():
					return
				case ev, ok := <-events:
					if !ok {
						d.log.Debug("interface event channel closed", "interface", id)
						return
					}
					d.log.Debug("interface event received", "interface", id, "type", ev.Kind)
					agg.Enqueue(ev)
					h.Nudge()
				}
			}
		}(iface.ID(), ch)
	}
}
