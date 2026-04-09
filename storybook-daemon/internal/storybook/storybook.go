// Package storybook orchestrates multiple persona daemons concurrently.
package storybook

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/daemon"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
)

// Storybook runs multiple persona daemons concurrently.
type Storybook struct {
	names []string
	log   *slog.Logger
}

// New creates a Storybook that will run the named personas.
func New(personas []string, log *slog.Logger) *Storybook {
	return &Storybook{
		names: personas,
		log:   log,
	}
}

// Run loads each persona, starts a daemon for each, and blocks until all
// daemons exit or the parent context is cancelled.
func (sb *Storybook) Run(ctx context.Context) error {
	if len(sb.names) == 0 {
		return fmt.Errorf("no personas specified")
	}

	sb.log.Info("storybook starting", "personas", sb.names)

	g, ctx := errgroup.WithContext(ctx)

	for _, name := range sb.names {
		pLog := sb.log.With("persona", name)

		p, err := persona.LoadFromDir(name)
		if err != nil {
			return fmt.Errorf("loading persona %q: %w", name, err)
		}
		pLog.Info("persona loaded",
			"flavor", p.Persona.Flavor,
			"interval", p.Attention.ThoughtInterval,
			"bodies", len(p.Bodies),
		)

		d := daemon.New(p, pLog)

		g.Go(func() error {
			if err := d.Run(ctx); err != nil {
				return fmt.Errorf("daemon %q: %w", name, err)
			}
			return nil
		})
	}

	err := g.Wait()
	sb.log.Info("storybook stopped")
	if err != nil {
		return fmt.Errorf("storybook run: %w", err)
	}
	return nil
}

// DiscoverPersonas returns all persona names found in the standard config directory.
func DiscoverPersonas() ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolving home dir: %w", err)
	}

	dir := filepath.Join(home, ".config", "storybook-daemon", "personas")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading personas directory %q: %w", dir, err)
	}

	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if name, ok := strings.CutSuffix(e.Name(), ".yaml"); ok {
			names = append(names, name)
		}
	}

	if len(names) == 0 {
		return nil, fmt.Errorf("no persona YAMLs found in %q", dir)
	}

	return names, nil
}
