package thought

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// PiConfig holds the settings for spawning a pi subprocess per beat.
type PiConfig struct {
	Model       string // pi model identifier, e.g. "claude-sonnet-4-6"
	Thinking    string // off, low, medium, high
	SessionPath string // persistent JSONL session file
	PromptFile  string // path to system prompt temp file
	McpPort     int    // daemon MCP port for HOARD_STONE_PORT
}

// runPi spawns a pi subprocess with the given context message and captures stdout.
// It returns the full output text. The session file accumulates across beats.
func runPi(ctx context.Context, cfg PiConfig, contextMsg string) (string, error) {
	args := []string{
		"--mode", "text",
		"-p",
		"--model", cfg.Model,
		"--system-prompt", cfg.PromptFile,
		"--thinking", cfg.Thinking,
		"--session", cfg.SessionPath,
		contextMsg,
	}

	cmd := exec.CommandContext(ctx, "pi", args...)
	cmd.Env = buildPiEnv(cfg.McpPort)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("creating stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("creating stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("starting pi: %w", err)
	}

	// Drain stderr in background.
	go drainPipe(stderr)

	raw, err := io.ReadAll(stdout)
	if err != nil {
		return "", fmt.Errorf("reading pi stdout: %w", err)
	}

	if err := cmd.Wait(); err != nil {
		return "", fmt.Errorf("pi exited with error: %w", err)
	}

	return strings.TrimSpace(string(raw)), nil
}

// drainPipe reads and discards a pipe to prevent subprocess blocking.
func drainPipe(r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		// discard — pi stderr is noisy with model loading messages
	}
}

// sensitiveSubstrings are key substrings that indicate credentials to strip.
var sensitiveSubstrings = []string{
	"_API_KEY", "_SECRET", "_TOKEN", "_PASSWORD", "_CREDENTIAL",
}

// blockedPrefixes are env var key prefixes for cloud/external namespaces.
var blockedPrefixes = []string{
	"AWS_", "GITHUB_", "OPENAI_", "AZURE_", "GCP_",
}

// buildPiEnv constructs a filtered environment for the pi subprocess.
// Same filtering as quest dispatch: strip credentials, add HOARD_STONE_PORT.
func buildPiEnv(mcpPort int) []string {
	raw := os.Environ()
	filtered := make([]string, 0, len(raw)+1)
	for _, kv := range raw {
		eq := strings.IndexByte(kv, '=')
		if eq < 0 {
			continue
		}
		key := kv[:eq]
		if shouldBlockEnv(key) {
			continue
		}
		filtered = append(filtered, kv)
	}
	return append(filtered, fmt.Sprintf("HOARD_STONE_PORT=%d", mcpPort))
}

// shouldBlockEnv reports whether an env var key should be stripped.
func shouldBlockEnv(key string) bool {
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
