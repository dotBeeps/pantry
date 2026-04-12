package quest

import (
	"context"
	"strings"
	"testing"
)

func makeCommandTestQuest(t *testing.T, harness string) *Quest {
	t.Helper()
	combo := ParseDefName("silly-kobold-scout")
	if combo == nil {
		t.Fatal("ParseDefName returned nil")
	}
	return &Quest{
		ID:      "quest-cmd-1",
		Ally:    "silly-kobold-scout",
		Combo:   combo,
		Harness: harness,
		Model:   "zai/glm-4.5-air",
		Task:    "say hello",
		done:    make(chan struct{}),
	}
}

func TestBuildCommand_TestHarness_RunsEcho(t *testing.T) {
	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	args := result.Cmd.Args
	if len(args) == 0 || (!strings.HasSuffix(args[0], "echo") && args[0] != "echo") {
		t.Errorf("expected echo command, got %v", args)
	}
}

func TestBuildCommand_CleanupRemovesFiles(t *testing.T) {
	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	result.Cleanup()
	result.Cleanup() // idempotent: second call should not panic
}

func TestBuildCommand_HoardOverlayVars(t *testing.T) {
	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 7777)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	env := result.Cmd.Env
	checkEnv := func(want string) {
		t.Helper()
		for _, e := range env {
			if e == want {
				return
			}
		}
		t.Errorf("env var %q not found in subprocess env", want)
	}
	checkEnv("HOARD_GUARD_MODE=ally")
	checkEnv("HOARD_ALLY_DEFNAME=silly-kobold-scout")
	checkEnv("HOARD_ALLY_NAME=silly-kobold-scout")
	checkEnv("HOARD_STONE_PORT=7777")
}

func TestBuildCommand_BlockedEnvVarsStripped(t *testing.T) {
	t.Setenv("MY_SECRET", "super-secret")
	t.Setenv("MY_API_KEY", "key-value")
	t.Setenv("GITHUB_TOKEN", "gh-token")
	t.Setenv("AWS_ACCESS_KEY_ID", "aws-key")
	t.Setenv("SAFE_VAR", "keep-this")

	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	blocked := []string{"MY_SECRET=", "MY_API_KEY=", "GITHUB_TOKEN=", "AWS_ACCESS_KEY_ID="}
	for _, b := range blocked {
		for _, e := range result.Cmd.Env {
			if strings.HasPrefix(e, b) {
				t.Errorf("blocked var %q leaked into env", b)
			}
		}
	}

	var sawSafe bool
	for _, e := range result.Cmd.Env {
		if e == "SAFE_VAR=keep-this" {
			sawSafe = true
		}
	}
	if !sawSafe {
		t.Error("SAFE_VAR not found in subprocess env")
	}
}

func TestBuildCommand_AnthropicKeyPiBlocked(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")

	q := makeCommandTestQuest(t, "pi")
	q.Model = "zai/glm-4.5-air"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	for _, e := range result.Cmd.Env {
		if strings.HasPrefix(e, "ANTHROPIC_API_KEY=") {
			t.Error("ANTHROPIC_API_KEY leaked into pi harness env")
		}
	}
}

func TestBuildCommand_AnthropicKeyClaudeAllowed(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")

	q := makeCommandTestQuest(t, "claude")
	q.Model = "anthropic/claude-haiku-4-5"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	var found bool
	for _, e := range result.Cmd.Env {
		if e == "ANTHROPIC_API_KEY=sk-ant-test" {
			found = true
		}
	}
	if !found {
		t.Error("ANTHROPIC_API_KEY should be allowed for claude harness")
	}
}

func TestBuildCommand_PiArgs(t *testing.T) {
	q := makeCommandTestQuest(t, "pi")
	q.Model = "zai/glm-4.5-air"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	joined := strings.Join(result.Cmd.Args, " ")
	for _, want := range []string{"--mode", "text", "-p", "--model", "zai/glm-4.5-air",
		"--append-system-prompt", "--thinking", "off", "--session"} {
		if !strings.Contains(joined, want) {
			t.Errorf("pi args missing %q; full args: %s", want, joined)
		}
	}
	if q.SessionPath == "" {
		t.Error("SessionPath not set for pi harness")
	}
}

func TestBuildCommand_ClaudeArgs(t *testing.T) {
	q := makeCommandTestQuest(t, "claude")
	q.Model = "anthropic/claude-haiku-4-5"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	joined := strings.Join(result.Cmd.Args, " ")
	for _, want := range []string{"--print", "--model", "anthropic/claude-haiku-4-5",
		"--append-system-prompt-file", "--effort", "low"} {
		if !strings.Contains(joined, want) {
			t.Errorf("claude args missing %q; full args: %s", want, joined)
		}
	}
}

func TestResolveHarness(t *testing.T) {
	tests := []struct {
		model string
		want  string
	}{
		{"anthropic/claude-haiku-4-5", "claude"},
		{"anthropic/claude-sonnet-4-6", "claude"},
		{"zai/glm-4.5-air", "pi"},
		{"github-copilot/claude-haiku-4.5", "pi"},
		{"google/gemini-2.0-flash", "pi"},
	}
	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			got := resolveHarness(tt.model)
			if got != tt.want {
				t.Errorf("resolveHarness(%q) = %q, want %q", tt.model, got, tt.want)
			}
		})
	}
}

func TestThinkingEffortMapping(t *testing.T) {
	thinkingTests := []struct{ adj, want string }{
		{"silly", "off"}, {"clever", "low"}, {"wise", "medium"}, {"elder", "high"},
	}
	for _, tt := range thinkingTests {
		if got := piThinking(tt.adj); got != tt.want {
			t.Errorf("piThinking(%q) = %q, want %q", tt.adj, got, tt.want)
		}
	}

	effortTests := []struct{ adj, want string }{
		{"silly", "low"}, {"clever", "medium"}, {"wise", "high"}, {"elder", "max"},
	}
	for _, tt := range effortTests {
		if got := claudeEffort(tt.adj); got != tt.want {
			t.Errorf("claudeEffort(%q) = %q, want %q", tt.adj, got, tt.want)
		}
	}
}

func TestShouldBlock(t *testing.T) {
	tests := []struct {
		key, harness string
		want         bool
	}{
		{"MY_API_KEY", "pi", true},
		{"MY_SECRET", "pi", true},
		{"MY_TOKEN", "pi", true},
		{"MY_PASSWORD", "pi", true},
		{"MY_CREDENTIAL_FILE", "pi", true},
		{"AWS_REGION", "pi", true},
		{"GITHUB_TOKEN", "pi", true},
		{"OPENAI_API_KEY", "pi", true},
		{"AZURE_CLIENT_ID", "pi", true},
		{"GCP_PROJECT", "pi", true},
		{"ANTHROPIC_API_KEY", "pi", true},
		{"ANTHROPIC_API_KEY", "claude", false},
		{"HOME", "pi", false},
		{"PATH", "pi", false},
		{"SAFE_VAR", "pi", false},
		{"HOARD_GUARD_MODE", "pi", false},
	}
	for _, tt := range tests {
		t.Run(tt.key+"/"+tt.harness, func(t *testing.T) {
			got := shouldBlock(tt.key, tt.harness)
			if got != tt.want {
				t.Errorf("shouldBlock(%q, %q) = %v, want %v", tt.key, tt.harness, got, tt.want)
			}
		})
	}
}
