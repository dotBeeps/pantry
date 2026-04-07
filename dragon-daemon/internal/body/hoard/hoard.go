// Package hoard implements the Body interface for a hoard git repository.
// It reads recent git activity and project structure to provide sensory context,
// and accepts log_to_hoard tool calls to write daily journal entries.
package hoard

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/body"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/sensory"
)

// Body is a hoard repository body.
type Body struct {
	id     string
	path   string
	log    *slog.Logger
	events chan sensory.Event // dragon-heart: outbound event channel
	watch  *watcher           // dragon-body: filesystem watcher
	cancel context.CancelFunc
}

// New creates a HoardBody for the repository at path.
func New(id, path string, log *slog.Logger) *Body {
	return &Body{
		id:     id,
		path:   path,
		log:    log,
		events: make(chan sensory.Event, 16),
	}
}

// ID returns the body identifier.
func (b *Body) ID() string { return b.id }

// Type returns "hoard".
func (b *Body) Type() string { return "hoard" }

// Start initializes the dragon-body filesystem watcher.
func (b *Body) Start(ctx context.Context) error {
	w, err := newWatcher(b.path, b.events, b.log)
	if err != nil {
		return fmt.Errorf("starting hoard watcher: %w", err)
	}
	b.watch = w

	watchCtx, cancel := context.WithCancel(ctx)
	b.cancel = cancel
	go w.run(watchCtx)

	b.log.Info("dragon-body started", "id", b.id, "path", b.path)
	return nil
}

// Stop shuts down the dragon-body filesystem watcher.
func (b *Body) Stop() error {
	if b.cancel != nil {
		b.cancel()
	}
	if b.watch != nil {
		return b.watch.stop()
	}
	return nil
}

// State returns a sensory summary of the hoard repository.
func (b *Body) State(ctx context.Context) (sensory.BodyState, error) {
	summary, raw, err := b.buildSummary(ctx)
	if err != nil {
		// Non-fatal: return a degraded state with the error message.
		b.log.Warn("hoard body state degraded", "id", b.id, "err", err)
		summary = fmt.Sprintf("[hoard %s: state unavailable — %s]", b.id, err)
		raw = nil
	}
	return sensory.BodyState{
		ID:      b.id,
		Type:    "hoard",
		Summary: summary,
		Raw:     raw,
	}, nil
}

// Execute routes tool calls to the hoard body.
func (b *Body) Execute(ctx context.Context, name string, args map[string]any) (string, error) {
	switch name {
	case "log_to_hoard":
		return b.logToHoard(ctx, args)
	default:
		return "", fmt.Errorf("unknown tool %q for hoard body %s", name, b.id)
	}
}

// Events returns the dragon-heart event channel.
// Events pushed here trigger immediate thought cycles.
func (b *Body) Events() <-chan sensory.Event {
	return b.events
}

// Tools returns the tools this body exposes.
func (b *Body) Tools() []body.ToolDef {
	return []body.ToolDef{
		{
			Name:        "log_to_hoard",
			Description: "Write a log entry to the hoard repository's daily journal. Use this to record thoughts, observations, or decisions.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "The content to write to the daily log.",
					},
					"section": map[string]any{
						"type":        "string",
						"description": "Optional section header to write under (e.g. 'observations', 'decisions').",
					},
				},
				"required": []string{"content"},
			},
		},
	}
}

// buildSummary assembles the sensory summary string from git log and repo structure.
func (b *Body) buildSummary(ctx context.Context) (string, map[string]any, error) {
	var parts []string
	raw := map[string]any{}

	// Recent git commits (last 5).
	commits, err := b.recentCommits(ctx, 5)
	if err == nil && len(commits) > 0 {
		parts = append(parts, "Recent commits:\n"+strings.Join(commits, "\n"))
		raw["recent_commits"] = commits
	}

	// Check for any unstaged changes.
	dirty, err := b.isDirty(ctx)
	if err == nil {
		raw["dirty"] = dirty
		if dirty {
			parts = append(parts, "Repository has uncommitted changes.")
		}
	}

	// Today's daily log if it exists.
	todayLog, err := b.todayLogContent()
	if err == nil && todayLog != "" {
		parts = append(parts, "Today's log:\n"+todayLog)
		raw["today_log"] = todayLog
	}

	if len(parts) == 0 {
		return fmt.Sprintf("Hoard repository at %s (no activity detected).", b.path), raw, nil
	}

	summary := fmt.Sprintf("Hoard repository at %s:\n\n%s", b.path, strings.Join(parts, "\n\n"))
	return summary, raw, nil
}

// recentCommits returns the last n commit summaries from git log.
func (b *Body) recentCommits(ctx context.Context, n int) ([]string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", b.path, "log", //nolint:gosec // G204: args are hardcoded, not user-controlled
		fmt.Sprintf("--max-count=%d", n),
		"--pretty=format:%h %s (%ar)",
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git log: %w", err)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var result []string
	for _, l := range lines {
		if l = strings.TrimSpace(l); l != "" {
			result = append(result, "  "+l)
		}
	}
	return result, nil
}

// isDirty reports whether the repo has any unstaged or uncommitted changes.
func (b *Body) isDirty(ctx context.Context) (bool, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", b.path, "status", "--porcelain") //nolint:gosec // G204: args are hardcoded
	out, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("git status: %w", err)
	}
	return strings.TrimSpace(string(out)) != "", nil
}

// todayLogContent reads today's daily log file if it exists.
// Looks for den/daily/YYYY-MM-DD.md.
func (b *Body) todayLogContent() (string, error) {
	today := time.Now().Format("2006-01-02")
	path := filepath.Join(b.path, "den", "daily", today+".md")
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("reading daily log: %w", err)
	}
	content := strings.TrimSpace(string(data))
	// Truncate to first 500 chars for the sensory snapshot.
	if len(content) > 500 {
		content = content[:500] + "\n[... truncated]"
	}
	return content, nil
}

// logToHoard appends a log entry to today's daily log file.
func (b *Body) logToHoard(_ context.Context, args map[string]any) (string, error) {
	content, ok := args["content"].(string)
	if !ok || content == "" {
		return "", errors.New("log_to_hoard: content is required")
	}
	section, _ := args["section"].(string)

	today := time.Now().Format("2006-01-02")
	dir := filepath.Join(b.path, "den", "daily")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("creating daily log dir: %w", err)
	}

	path := filepath.Join(dir, today+".md")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return "", fmt.Errorf("opening daily log: %w", err)
	}
	defer func() {
		if cerr := f.Close(); cerr != nil {
			b.log.Error("closing daily log", "err", cerr)
		}
	}()

	now := time.Now().Format("15:04")
	var entry string
	if section != "" {
		entry = fmt.Sprintf("\n## %s (%s)\n\n%s\n", section, now, content)
	} else {
		entry = fmt.Sprintf("\n<!-- %s -->\n%s\n", now, content)
	}

	if _, err := f.WriteString(entry); err != nil {
		return "", fmt.Errorf("writing to daily log: %w", err)
	}

	b.log.Info("hoard daily log updated", "file", path, "section", section)
	return "Logged to " + path, nil
}
