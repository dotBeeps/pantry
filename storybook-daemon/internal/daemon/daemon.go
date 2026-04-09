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
	"github.com/dotBeeps/hoard/storybook-daemon/internal/auth"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/body"
	hoardbody "github.com/dotBeeps/hoard/storybook-daemon/internal/body/hoard"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/heart"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/psi"
	psidoggy "github.com/dotBeeps/hoard/storybook-daemon/internal/psi/doggy"
	psimcp "github.com/dotBeeps/hoard/storybook-daemon/internal/psi/mcp"
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

	// Load pi OAuth credentials.
	oauth, err := auth.LoadPiOAuth(d.log)
	if err != nil {
		return fmt.Errorf("loading pi oauth: %w", err)
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

	// Build and start bodies — external systems the daemon inhabits.
	bodies, err := d.buildBodies(ledger, agg, vault)
	if err != nil {
		return fmt.Errorf("building bodies: %w", err)
	}
	var startedBodies []body.Body
	for _, b := range bodies {
		if err := b.Start(ctx); err != nil {
			return fmt.Errorf("starting body %s: %w", b.ID(), err)
		}
		startedBodies = append(startedBodies, b)
	}
	defer func() {
		for _, b := range startedBodies {
			if err := b.Stop(); err != nil {
				d.log.Error("stopping body", "id", b.ID(), "err", err)
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

	cycle := thought.New(d.persona, ledger, agg, bodies, vault, oauth, d.log)

	// Wire thought output to psi interfaces that act as output sinks (e.g. doggy SSE stream).
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
		"bodies", len(bodies),
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

	// Fan-in events from bodies and psi interfaces → aggregator + nudge the heart.
	d.fanInBodyEvents(ctx, bodies, agg, dragonHeart)
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

// buildBodies constructs Body instances for all enabled body configs.
func (d *Daemon) buildBodies(ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault) ([]body.Body, error) {
	var bodies []body.Body
	for _, cfg := range d.persona.Bodies {
		if !cfg.Enabled {
			d.log.Info("body disabled", "id", cfg.ID)
			continue
		}
		b, err := d.buildBody(cfg, ledger, agg, vault)
		if err != nil {
			return nil, fmt.Errorf("building body %s: %w", cfg.ID, err)
		}
		bodies = append(bodies, b)
		d.log.Info("body loaded", "id", cfg.ID, "type", cfg.Type)
	}
	return bodies, nil
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

// fanInBodyEvents starts goroutines that drain each body's event channel
// into the aggregator and nudge the dragon-heart for immediate processing.
func (d *Daemon) fanInBodyEvents(ctx context.Context, bodies []body.Body, agg *sensory.Aggregator, h *heart.Heart) {
	for _, b := range bodies {
		ch := b.Events()
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
						d.log.Debug("body event channel closed", "body", id)
						return
					}
					d.log.Debug("body event received", "body", id, "type", ev.Kind)
					agg.Enqueue(ev)
					h.Nudge()
				}
			}
		}(b.ID(), ch)
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

func (d *Daemon) buildBody(cfg persona.BodyConfig, _ *attention.Ledger, _ *sensory.Aggregator, _ *memory.Vault) (body.Body, error) {
	switch cfg.Type {
	case "hoard":
		path := cfg.Path
		if path == "" {
			return nil, fmt.Errorf("hoard body %q requires a path", cfg.ID)
		}
		// Expand ~ if needed.
		if len(path) >= 2 && path[:2] == "~/" {
			home, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("resolving home dir: %w", err)
			}
			path = home + path[1:]
		}
		return hoardbody.New(cfg.ID, path, d.log), nil
	default:
		return nil, fmt.Errorf("unsupported body type %q (supported: hoard)", cfg.Type)
	}
}

func (d *Daemon) buildInterface(cfg persona.InterfaceConfig, ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault) (psi.Interface, error) {
	switch cfg.Type {
	case "doggy":
		port := 7432
		if cfg.Path != "" {
			if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
				port = p
			}
		}
		return psidoggy.New(cfg.ID, port, ledger, agg, d.log), nil
	case "mcp":
		port := 9000
		if cfg.Path != "" {
			if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
				port = p
			}
		}
		return psimcp.New(cfg.ID, port, vault, ledger, d.log), nil
	default:
		return nil, fmt.Errorf("unsupported interface type %q (supported: doggy, mcp)", cfg.Type)
	}
}
