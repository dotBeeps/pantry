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
	"syscall"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/attention"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/auth"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/body"
	hoardbody "github.com/dotBeeps/hoard/dragon-daemon/internal/body/hoard"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/memory"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/persona"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/sensory"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/thought"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/ticker"
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

	bodies, err := d.buildBodies()
	if err != nil {
		return fmt.Errorf("building bodies: %w", err)
	}

	cycle := thought.New(d.persona, ledger, agg, bodies, vault, oauth, d.log)

	// Parse thought interval from persona config.
	interval, err := d.persona.ThoughtInterval()
	if err != nil {
		return fmt.Errorf("invalid thought interval: %w", err)
	}

	d.log.Info("daemon ready",
		"thought_interval", interval,
		"bodies", len(bodies),
		"attention", ledger.Status(),
	)

	// Build and run the ticker.
	tick := ticker.New(
		interval,
		d.persona.Attention.Variance,
		func(ctx context.Context) error {
			// Gate on attention floor.
			if !ledger.AboveFloor() {
				d.log.Info("attention below floor — skipping tick",
					"pool", ledger.Pool(),
					"floor", d.persona.Attention.Floor,
				)
				return nil
			}
			return cycle.Run(ctx)
		},
		d.log,
	)

	tick.Run(ctx)

	d.log.Info("daemon stopped")
	return nil
}

// buildBodies constructs Body instances for all enabled body configs.
// Phase 1: only "hoard" type is supported.
func (d *Daemon) buildBodies() ([]body.Body, error) {
	var bodies []body.Body
	for _, cfg := range d.persona.Bodies {
		if !cfg.Enabled {
			d.log.Info("body disabled", "id", cfg.ID)
			continue
		}
		b, err := d.buildBody(cfg)
		if err != nil {
			return nil, fmt.Errorf("building body %s: %w", cfg.ID, err)
		}
		bodies = append(bodies, b)
		d.log.Info("body loaded", "id", cfg.ID, "type", cfg.Type)
	}
	return bodies, nil
}

// vaultDir returns the path to this persona's memory vault.
func (d *Daemon) vaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "dragon-daemon", "memory", d.persona.Persona.Name), nil
}

func (d *Daemon) buildBody(cfg persona.BodyConfig) (body.Body, error) {
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
		return nil, fmt.Errorf("unsupported body type %q (Phase 1 supports: hoard)", cfg.Type)
	}
}
