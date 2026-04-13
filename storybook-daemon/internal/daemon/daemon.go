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

	anthropicsdk "github.com/anthropics/anthropic-sdk-go"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/auth"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/heart"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/llm"
	anthropicllm "github.com/dotBeeps/hoard/storybook-daemon/internal/llm/anthropic"
	llamacllm "github.com/dotBeeps/hoard/storybook-daemon/internal/llm/llamacli"
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
	return &Daemon{
		persona: p,
		log:     log,
	}
}

// Run starts the daemon and blocks until the context is cancelled or a signal is received.
func (d *Daemon) Run(ctx context.Context) error {
	ctx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	d.log.Info("daemon starting",
		"persona", d.persona.Persona.Name,
		"flavor", d.persona.Persona.Flavor,
	)

	// Wire up components.
	ledger := attention.New(d.persona, d.log)
	agg := sensory.New(20)

	// Build the LLM provider. OAuth is only loaded when the anthropic provider is used.
	provider, err := d.buildProvider()
	if err != nil {
		return fmt.Errorf("building LLM provider: %w", err)
	}

	// Open memory vault.
	vaultDir, err := d.vaultDir()
	if err != nil {
		return fmt.Errorf("resolving vault dir: %w", err)
	}
	vault, err := memory.Open(vaultDir, d.log)
	if err != nil {
		return fmt.Errorf("opening memory vault: %w", err)
	}
	d.log.Info("memory vault open", "dir", vault.VaultDir())

	// Build and start nerves — sensory connectors to external systems.
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

	// Build and start psi interfaces — communication surfaces exposed to the world.
	ifaces, err := d.buildInterfaces(ledger, agg, vault)
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

	cycle := thought.New(d.persona, ledger, agg, nerves, vault, provider, d.log)

	// Wire thought output to psi interfaces that act as output sinks (e.g. SSE stream).
	cycleOut := cycleCapture{c: cycle}
	for _, iface := range ifaces {
		if sink, ok := iface.(psi.OutputSink); ok {
			sink.Wire(cycleOut)
		}
	}

	// Parse thought interval from persona config.
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

	// Build the dragon-soul (contract enforcer).
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

	// Build and run the dragon-heart.
	dragonHeart := heart.New(
		interval,
		d.persona.Attention.Variance,
		func(ctx context.Context) error {
			// Dragon-soul gates cognition: check contracts first.
			if v := enforcer.Check(); v != nil {
				d.log.Info(v.Message, "until", v.Until.Format("15:04"))
				return nil
			}

			// Gate on attention floor.
			if !ledger.AboveFloor() {
				d.log.Info("attention below floor — skipping beat",
					"pool", ledger.Pool(),
					"floor", d.persona.Attention.Floor,
				)
				return nil
			}

			// Pre-beat: snapshot for post-beat audits.
			enforcer.PreBeat()

			if err := cycle.Run(ctx); err != nil {
				return fmt.Errorf("thought cycle: %w", err)
			}

			// Post-beat: verify integrity (attention-honesty, memory-transparency).
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

	// Fan-in events from nerves and psi interfaces → aggregator + nudge the heart.
	d.fanInNerveEvents(ctx, nerves, agg, dragonHeart)
	d.fanInIfaceEvents(ctx, ifaces, agg, dragonHeart)

	dragonHeart.Run(ctx)

	d.log.Info("daemon stopped")
	return nil
}

// cycleCapture adapts *thought.Cycle to soul.OutputCapture.
// thought.OutputHook is func(text string); soul.OutputCapture expects func(string).
type cycleCapture struct{ c *thought.Cycle }

// OnOutput registers fn as the hook that receives every thought string emitted
// by the cycle, satisfying the soul.OutputCapture interface.
func (a cycleCapture) OnOutput(fn func(string)) {
	a.c.OnOutput(thought.OutputHook(fn))
}

// buildNerves constructs Nerve instances for all enabled nerve configs.
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

// buildInterfaces constructs psi Interface instances for all enabled interface configs.
func (d *Daemon) buildInterfaces(ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault) ([]psi.Interface, error) {
	var ifaces []psi.Interface
	for _, cfg := range d.persona.Interfaces {
		if !cfg.Enabled {
			d.log.Info("interface disabled", "id", cfg.ID)
			continue
		}
		iface, err := d.buildInterface(cfg, ledger, agg, vault)
		if err != nil {
			return nil, fmt.Errorf("building interface %s: %w", cfg.ID, err)
		}
		ifaces = append(ifaces, iface)
		d.log.Info("interface loaded", "id", cfg.ID, "type", cfg.Type)
	}
	return ifaces, nil
}

// vaultDir returns the path to this persona's memory vault.
func (d *Daemon) vaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home directory: %w", err)
	}
	return filepath.Join(home, ".config", "storybook-daemon", "memory", d.persona.Persona.Name), nil
}

// fanInNerveEvents starts goroutines that drain each nerve's event channel
// into the aggregator and nudge the dragon-heart for immediate processing.
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

// fanInIfaceEvents starts goroutines that drain each psi interface's event channel
// into the aggregator and nudge the dragon-heart for immediate processing.
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

func (d *Daemon) buildNerve(cfg persona.NerveConfig, _ *attention.Ledger, _ *sensory.Aggregator, _ *memory.Vault) (nerve.Nerve, error) {
	switch cfg.Type {
	case "hoard":
		path := cfg.Path
		if path == "" {
			return nil, fmt.Errorf("hoard nerve %q requires a path", cfg.ID)
		}
		// Expand ~ if needed.
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

func (d *Daemon) buildInterface(cfg persona.InterfaceConfig, ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault) (psi.Interface, error) {
	switch cfg.Type {
	case "sse":
		port := 7432
		if cfg.Path != "" {
			if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
				port = p
			}
		}
		return psisse.New(cfg.ID, port, ledger, agg, d.log), nil
	case "mcp":
		port := 9000
		if cfg.Path != "" {
			if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
				port = p
			}
		}
		return psimcp.New(cfg.ID, port, vault, ledger, d.log), nil
	default:
		return nil, fmt.Errorf("unsupported interface type %q (supported: sse, mcp)", cfg.Type)
	}
}

// buildProvider constructs the LLM provider from the persona's llm config.
// For the anthropic provider, pi OAuth credentials are loaded from disk.
// For the llamacli provider, no network credentials are required.
func (d *Daemon) buildProvider() (llm.Provider, error) {
	cfg := d.persona.LLM

	switch cfg.Provider {
	case "llamacli":
		binaryPath := cfg.BinaryPath
		if binaryPath == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("resolving home dir for llama-cli default path: %w", err)
			}
			binaryPath = filepath.Join(home, "AI", "llama.cpp", "build-rocm", "bin", "llama-cli")
		}
		if cfg.ModelPath == "" {
			return nil, fmt.Errorf("llamacli provider requires llm.model_path in persona config")
		}
		gpuLayers := cfg.GPULayers
		if gpuLayers == 0 {
			gpuLayers = 999 // offload all layers to GPU by default
		}
		maxTokens := cfg.MaxTokens
		if maxTokens == 0 {
			maxTokens = 2048
		}
		temperature := cfg.Temperature
		if temperature == 0 {
			temperature = 0.7
		}
		d.log.Info("LLM provider: llamacli",
			"binary", binaryPath,
			"model", cfg.ModelPath,
			"gpu_layers", gpuLayers,
			"max_tokens", maxTokens,
		)
		return llamacllm.New(llamacllm.Config{
			BinaryPath:  binaryPath,
			ModelPath:   cfg.ModelPath,
			GPULayers:   gpuLayers,
			Threads:     cfg.Threads,
			ContextSize: cfg.ContextSize,
			MaxTokens:   maxTokens,
			Temperature: temperature,
		}, d.log), nil

	default: // "anthropic" or empty string
		oauth, err := auth.LoadPiOAuth(d.log)
		if err != nil {
			return nil, fmt.Errorf("loading pi oauth for anthropic provider: %w", err)
		}
		model := anthropicsdk.Model(cfg.Model)
		if model == "" {
			model = anthropicsdk.ModelClaudeHaiku4_5
		}
		maxTokens := int64(cfg.MaxTokens)
		if maxTokens == 0 {
			maxTokens = 1024
		}
		d.log.Info("LLM provider: anthropic", "model", model, "max_tokens", maxTokens)
		return anthropicllm.New(oauth, model, maxTokens, d.log), nil
	}
}
