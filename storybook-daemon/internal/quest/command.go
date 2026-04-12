package quest

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

// CommandResult holds the built command and a cleanup function for temp files.
type CommandResult struct {
	Cmd     *exec.Cmd
	Cleanup func()
}

// BuildCommand constructs the subprocess command for a quest.
// It creates a temp directory, writes the system prompt, sets env, and returns
// a Cleanup func that removes the temp dir. The caller must defer result.Cleanup().
func BuildCommand(ctx context.Context, q *Quest, daemonPort int) (*CommandResult, error) {
	tmpDir, err := os.MkdirTemp("", "hoard-quest-"+q.ID+"-")
	if err != nil {
		return nil, fmt.Errorf("creating temp dir: %w", err)
	}

	var cleanupOnce sync.Once
	cleanup := func() {
		cleanupOnce.Do(func() { os.RemoveAll(tmpDir) })
	}

	prompt := BuildAllyPrompt(q.Combo, q.Ally)
	promptFile := filepath.Join(tmpDir, "system.md")
	if err := os.WriteFile(promptFile, []byte(prompt), 0600); err != nil {
		cleanup()
		return nil, fmt.Errorf("writing system prompt: %w", err)
	}

	harness := q.Harness
	if harness == "" {
		harness = resolveHarness(q.Model)
	}

	env := buildEnv(harness, daemonPort, q)

	var cmd *exec.Cmd
	switch harness {
	case "pi":
		sessionFile := filepath.Join(tmpDir, "session.jsonl")
		q.SessionPath = sessionFile
		tools := ResolveTools(q.Combo.Job)
		thinking := piThinking(q.Combo.Adjective)
		cmd = exec.CommandContext(ctx, "pi",
			"--mode", "text",
			"-p",
			"--model", q.Model,
			"--append-system-prompt", promptFile,
			"--tools", tools,
			"--thinking", thinking,
			"--session", sessionFile,
			"Task: "+q.Task,
		)

	case "claude":
		tools := ResolveTools(q.Combo.Job)
		effort := claudeEffort(q.Combo.Adjective)
		cmd = exec.CommandContext(ctx, "claude",
			"--print",
			"--model", q.Model,
			"--append-system-prompt-file", promptFile,
			"--allowedTools", tools,
			"--effort", effort,
			q.Task,
		)

	case "test":
		// Full pipeline (prompt written, env filtered) but runs echo instead of pi/claude.
		// Used in tests when API keys are unavailable.
		cmd = exec.CommandContext(ctx, "echo", "Task: "+q.Task)

	default:
		cleanup()
		return nil, fmt.Errorf("unknown harness: %q", harness)
	}

	cmd.Env = env
	return &CommandResult{Cmd: cmd, Cleanup: cleanup}, nil
}

// resolveHarness derives the subprocess harness from the model's provider prefix.
// "anthropic/*" → claude CLI; everything else → pi.
func resolveHarness(model string) string {
	provider, _, found := strings.Cut(model, "/")
	if found && provider == "anthropic" {
		return "claude"
	}
	return "pi"
}

// piThinking maps an ally adjective to a pi --thinking level.
func piThinking(adjective string) string {
	switch adjective {
	case "clever":
		return "low"
	case "wise":
		return "medium"
	case "elder":
		return "high"
	default:
		return "off"
	}
}

// claudeEffort maps an ally adjective to a claude --effort level.
func claudeEffort(adjective string) string {
	switch adjective {
	case "clever":
		return "medium"
	case "wise":
		return "high"
	case "elder":
		return "max"
	default:
		return "low"
	}
}

// sensitiveSubstrings are key substrings that indicate sensitive credentials.
// Matched with strings.Contains so partial matches like MY_CREDENTIAL_FILE are caught.
var sensitiveSubstrings = []string{
	"_API_KEY", "_SECRET", "_TOKEN", "_PASSWORD", "_CREDENTIAL",
}

// blockedPrefixes are env var key prefixes for cloud/external service namespaces.
var blockedPrefixes = []string{
	"AWS_", "GITHUB_", "OPENAI_", "AZURE_", "GCP_",
}

// shouldBlock reports whether an env var with the given key should be stripped
// from the subprocess environment. ANTHROPIC_API_KEY is allowed for the claude harness only.
func shouldBlock(key, harness string) bool {
	if key == "ANTHROPIC_API_KEY" {
		return harness != "claude"
	}
	for _, sub := range sensitiveSubstrings {
		if strings.Contains(key, sub) {
			return true
		}
	}
	for _, prefix := range blockedPrefixes {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

// buildEnv constructs the subprocess environment: inherit os.Environ(), strip blocked vars,
// then overlay hoard-specific vars.
func buildEnv(harness string, daemonPort int, q *Quest) []string {
	raw := os.Environ()
	filtered := make([]string, 0, len(raw)+4)
	for _, kv := range raw {
		eq := strings.IndexByte(kv, '=')
		if eq < 0 {
			continue
		}
		if !shouldBlock(kv[:eq], harness) {
			filtered = append(filtered, kv)
		}
	}
	return append(filtered,
		"HOARD_GUARD_MODE=ally",
		"HOARD_ALLY_DEFNAME="+q.Combo.DefName(),
		"HOARD_ALLY_NAME="+q.Ally,
		fmt.Sprintf("HOARD_STONE_PORT=%d", daemonPort),
	)
}
