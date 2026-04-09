package hoard

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
	"github.com/fsnotify/fsnotify"
)

// watcher watches the hoard repository for file changes and git events,
// pushing sensory events to the body's event channel.
// The dragon-body senses its environment through file system observation.
type watcher struct {
	path   string
	events chan<- sensory.Event
	log    *slog.Logger

	fsw  *fsnotify.Watcher
	done chan struct{}
}

// newWatcher creates a watcher for the given repository path.
func newWatcher(path string, events chan<- sensory.Event, log *slog.Logger) (*watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("creating fs watcher: %w", err)
	}

	w := &watcher{
		path:   path,
		events: events,
		log:    log,
		fsw:    fsw,
		done:   make(chan struct{}),
	}

	// Watch the repo root.
	if err := fsw.Add(path); err != nil {
		_ = fsw.Close() // best-effort cleanup
		return nil, fmt.Errorf("watching repo root: %w", err)
	}

	// Watch .git/refs/heads for commit detection.
	refsPath := filepath.Join(path, ".git", "refs", "heads")
	if err := fsw.Add(refsPath); err != nil {
		// Not fatal — repo might not have local refs yet.
		w.log.Debug("dragon-body: could not watch git refs", "path", refsPath, "err", err)
	}

	return w, nil
}

// run starts the watcher loop. Call from a goroutine; blocks until ctx is cancelled.
func (w *watcher) run(ctx context.Context) {
	defer close(w.done)
	w.log.Info("dragon-body: watcher started", "path", w.path)

	// Debounce window: coalesce rapid writes into a single event.
	const debounce = 100 * time.Millisecond

	var mu sync.Mutex
	pending := make(map[string]fsnotify.Event)
	var timer *time.Timer

	flush := func() {
		mu.Lock()
		batch := pending
		pending = make(map[string]fsnotify.Event)
		mu.Unlock()

		for _, ev := range batch {
			sensoryEv := w.classify(ev)
			if sensoryEv != nil {
				select {
				case w.events <- *sensoryEv:
				default:
					w.log.Warn("dragon-body: event channel full, dropping", "kind", sensoryEv.Kind)
				}
			}
		}
	}

	for {
		select {
		case <-ctx.Done():
			w.log.Info("dragon-body: watcher stopped")
			return

		case event, ok := <-w.fsw.Events:
			if !ok {
				return
			}

			// Skip noisy ops.
			if event.Op == fsnotify.Chmod {
				continue
			}

			mu.Lock()
			pending[event.Name] = event
			if timer == nil {
				timer = time.AfterFunc(debounce, func() {
					mu.Lock()
					timer = nil
					mu.Unlock()
					flush()
				})
			} else {
				timer.Reset(debounce)
			}
			mu.Unlock()

		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			w.log.Error("dragon-body: watcher error", "err", err)
		}
	}
}

// classify maps a filesystem event to a sensory event.
// Returns nil for events we don't care about.
func (w *watcher) classify(ev fsnotify.Event) *sensory.Event {
	rel, err := filepath.Rel(w.path, ev.Name)
	if err != nil {
		rel = ev.Name
	}

	// Git ref change → commit event.
	if strings.HasPrefix(rel, filepath.Join(".git", "refs", "heads")) {
		branch := filepath.Base(ev.Name)
		return &sensory.Event{
			Source:  "hoard",
			Kind:    "commit",
			Content: "commit detected on branch " + branch,
			At:      time.Now(),
		}
	}

	// Ignore .git internals other than ref changes.
	if strings.HasPrefix(rel, ".git") {
		return nil
	}

	// Regular file change.
	var action string
	switch {
	case ev.Op&fsnotify.Create != 0:
		action = "created"
	case ev.Op&fsnotify.Remove != 0:
		action = "removed"
	case ev.Op&fsnotify.Rename != 0:
		action = "renamed"
	default:
		action = "modified"
	}

	return &sensory.Event{
		Source:  "hoard",
		Kind:    "file_change",
		Content: action + ": " + rel,
		At:      time.Now(),
	}
}

// stop shuts down the filesystem watcher.
func (w *watcher) stop() error {
	err := w.fsw.Close()
	<-w.done // wait for run() to exit
	if err != nil {
		return fmt.Errorf("closing fs watcher: %w", err)
	}
	return nil
}
