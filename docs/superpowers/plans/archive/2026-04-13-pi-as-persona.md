# pi-as-Persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the daemon's LLM providers with a persistent pi session so pi IS the persona.

**Architecture:** The thought cycle stops owning inference. Each beat spawns `pi --mode text -p` with a persistent session file, using the same env filtering as quest dispatch. Pi handles tool dispatch, multi-turn context, and model auth. The daemon keeps heartbeat, soul, sensory, attention, memory vault, and conversation ledger (output-only).

**Tech Stack:** Go 1.25, pi CLI

**Spec:** `docs/superpowers/specs/2026-04-13-pi-as-persona-design.md`

---

## File Map

### New

| File                          | Responsibility                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `internal/thought/pi.go`      | `runPi()` — spawn pi subprocess, env filtering, session management, output capture |
| `internal/thought/pi_test.go` | Tests for command construction, env filtering, output parsing                      |

### Modified

| File                         | Change                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `internal/persona/types.go`  | Replace LLMConfig fields with pi-specific (model, thinking). Replace per-tool costs with flat Beat cost.                                         |
| `internal/persona/loader.go` | Update `applyDefaults` for new cost structure.                                                                                                   |
| `internal/thought/cycle.go`  | Remove provider.Run, buildTools, dispatchTool. Replace with runPi call. Remove llm import. Slim buildContextMessage (no conversation injection). |
| `internal/daemon/daemon.go`  | Remove buildProvider, OAuth, llm imports. Build system prompt at startup. Create sessions dir. Pass MCP port to cycle.                           |

### Deleted

| File/Dir         | Reason                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `internal/llm/`  | Entire package — Provider interface, anthropic, llamacli implementations |
| `internal/auth/` | Pi OAuth loading — pi handles its own auth                               |

---

## Task 1: Create pi subprocess runner

**Files:**

- Create: `storybook-daemon/internal/thought/pi.go`

- [ ] **Step 1: Create pi.go with runPi and env filtering**

```go
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

// piConfig holds the settings for spawning a pi subprocess per beat.
type piConfig struct {
	Model       string // pi model identifier, e.g. "claude-sonnet-4-6"
	Thinking    string // off, low, medium, high
	SessionPath string // persistent JSONL session file
	PromptFile  string // path to system prompt temp file
	McpPort     int    // daemon MCP port for HOARD_STONE_PORT
}

// runPi spawns a pi subprocess with the given context message and captures stdout.
// It returns the full output text. The session file accumulates across beats.
func runPi(ctx context.Context, cfg piConfig, contextMsg string) (string, error) {
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd storybook-daemon && go build ./internal/thought/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add storybook-daemon/internal/thought/pi.go
git commit -m "feat(thought): add pi subprocess runner with env filtering"
```

---

## Task 2: Test pi subprocess runner

**Files:**

- Create: `storybook-daemon/internal/thought/pi_test.go`

- [ ] **Step 1: Write tests for env filtering and command construction**

```go
package thought

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestShouldBlockEnv(t *testing.T) {
	tests := []struct {
		key     string
		blocked bool
	}{
		{"HOME", false},
		{"PATH", false},
		{"ANTHROPIC_API_KEY", true},
		{"MY_SECRET", true},
		{"MY_TOKEN", true},
		{"MY_PASSWORD", true},
		{"MY_CREDENTIAL", true},
		{"AWS_ACCESS_KEY_ID", true},
		{"GITHUB_TOKEN", true},
		{"OPENAI_API_KEY", true},
		{"AZURE_SUBSCRIPTION_ID", true},
		{"GCP_PROJECT", true},
		{"HOARD_STONE_PORT", false},
		{"TERM", false},
	}
	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			assert.Equal(t, tt.blocked, shouldBlockEnv(tt.key))
		})
	}
}

func TestBuildPiEnv(t *testing.T) {
	env := buildPiEnv(9432)

	// Should contain HOARD_STONE_PORT.
	found := false
	for _, kv := range env {
		if kv == "HOARD_STONE_PORT=9432" {
			found = true
		}
		// Should not contain any blocked keys.
		for _, sub := range sensitiveSubstrings {
			key := kv[:max(0, len(kv)-len(sub))]
			_ = key // just checking it doesn't panic
		}
	}
	assert.True(t, found, "HOARD_STONE_PORT=9432 should be in env")
}
```

- [ ] **Step 2: Run tests**

Run: `cd storybook-daemon && go test ./internal/thought/ -v -run TestShouldBlock`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add storybook-daemon/internal/thought/pi_test.go
git commit -m "test(thought): env filtering tests for pi subprocess runner"
```

---

## Task 3: Update persona config types

**Files:**

- Modify: `storybook-daemon/internal/persona/types.go`
- Modify: `storybook-daemon/internal/persona/loader.go`

- [ ] **Step 1: Replace LLMConfig and CostConfig**

In `storybook-daemon/internal/persona/types.go`, replace the `LLMConfig` struct with:

```go
// LLMConfig configures the pi session for this persona.
type LLMConfig struct {
	// Model is the pi model identifier (e.g. "claude-sonnet-4-6").
	Model string `yaml:"model"`
	// Thinking sets the pi thinking level: off, low, medium, high.
	Thinking string `yaml:"thinking"`
}
```

Replace the `CostConfig` struct with:

```go
// CostConfig maps action names to their attention costs.
type CostConfig struct {
	Beat int `yaml:"beat"` // flat cost per thought cycle
}
```

- [ ] **Step 2: Update applyDefaults in loader.go**

In `storybook-daemon/internal/persona/loader.go`, replace the `applyDefaults` function:

```go
// applyDefaults fills in zero-value fields with sensible defaults.
func applyDefaults(p *Persona) {
	if p.Costs.Beat == 0 {
		p.Costs.Beat = 15
	}
	if p.Attention.Floor == 0 {
		p.Attention.Floor = 50
	}
	if p.LLM.Model == "" {
		p.LLM.Model = "claude-sonnet-4-6"
	}
	if p.LLM.Thinking == "" {
		p.LLM.Thinking = "medium"
	}
}
```

- [ ] **Step 3: Verify it compiles** (will fail — cycle.go and daemon.go reference old types, that's expected)

Run: `cd storybook-daemon && go build ./internal/persona/`
Expected: builds clean (persona package is self-contained)

- [ ] **Step 4: Commit**

```bash
git add storybook-daemon/internal/persona/types.go storybook-daemon/internal/persona/loader.go
git commit -m "feat(persona): replace LLM provider config with pi session config, flat beat cost"
```

---

## Task 4: Rewrite thought cycle for pi

**Files:**

- Modify: `storybook-daemon/internal/thought/cycle.go`

- [ ] **Step 1: Replace cycle.go**

Replace the full contents of `storybook-daemon/internal/thought/cycle.go`:

```go
// Package thought implements the core thought cycle: sensory context → pi → output.
package thought

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// OutputHook is called for each piece of text output produced during a thought cycle.
type OutputHook func(text string)

// Cycle orchestrates a single thought cycle for a persona.
type Cycle struct {
	persona *persona.Persona
	ledger  *attention.Ledger
	sensory *sensory.Aggregator
	nerves  map[string]nerve.Nerve
	vault   *memory.Vault
	convo   *conversation.Ledger
	pi      piConfig
	log     *slog.Logger

	outputHooks []OutputHook
}

// New creates a Cycle wired to the given components.
func New(
	p *persona.Persona,
	ledger *attention.Ledger,
	agg *sensory.Aggregator,
	nerves []nerve.Nerve,
	vault *memory.Vault,
	convo *conversation.Ledger,
	pi piConfig,
	log *slog.Logger,
) *Cycle {
	nerveMap := make(map[string]nerve.Nerve, len(nerves))
	for _, n := range nerves {
		nerveMap[n.ID()] = n
	}
	return &Cycle{
		persona: p,
		ledger:  ledger,
		sensory: agg,
		nerves:  nerveMap,
		vault:   vault,
		convo:   convo,
		pi:      pi,
		log:     log,
	}
}

// OnOutput registers a hook called for every piece of text the thought cycle produces.
func (c *Cycle) OnOutput(hook OutputHook) {
	c.outputHooks = append(c.outputHooks, hook)
}

func (c *Cycle) fireOutput(text string) {
	for _, h := range c.outputHooks {
		h(text)
	}
}

// Run executes one full thought cycle: snapshot → pi → output → attention deduction.
func (c *Cycle) Run(ctx context.Context) error {
	start := time.Now()
	c.log.Info("thought cycle starting", "persona", c.persona.Persona.Name)

	// 1. Assemble sensory snapshot.
	nerveStates, err := c.gatherNerveStates(ctx)
	if err != nil {
		c.log.Warn("partial nerve state failure", "err", err)
	}
	snap := c.sensory.Snapshot(c.ledger.Pool(), nerveStates)

	// 2. Build sensory-only context message (no conversation — pi owns that).
	contextMsg := c.buildContextMessage(snap)

	// 3. Run pi subprocess.
	output, err := runPi(ctx, c.pi, contextMsg)
	if err != nil {
		return fmt.Errorf("pi run: %w", err)
	}

	// 4. Process output.
	if output != "" {
		_, _ = fmt.Fprintf(os.Stdout, "\n[%s] %s\n", c.persona.Persona.Name, output)
		c.fireOutput(output)
		if c.convo != nil {
			c.convo.Append(conversation.Entry{
				Role: c.persona.Persona.Name, Content: output, Source: "thought",
			})
		}
	}

	// 5. Deduct flat beat cost.
	beatCost := c.persona.Costs.Beat
	if beatCost > 0 {
		if err := c.ledger.Spend("beat", beatCost); err != nil {
			c.log.Warn("attention spend failed", "cost", beatCost, "err", err)
		}
	}

	c.log.Info("thought cycle complete",
		"duration", time.Since(start).Round(time.Millisecond),
		"attention_spent", beatCost,
		"attention_status", c.ledger.Status(),
	)
	return nil
}

// gatherNerveStates collects state summaries from all connected nerves.
func (c *Cycle) gatherNerveStates(ctx context.Context) ([]sensory.NerveState, error) {
	var states []sensory.NerveState
	var errs []string
	for _, n := range c.nerves {
		state, err := n.State(ctx)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", n.ID(), err))
			continue
		}
		states = append(states, state)
	}
	if len(errs) > 0 {
		return states, fmt.Errorf("nerve state errors: %s", strings.Join(errs, "; "))
	}
	return states, nil
}

// buildContextMessage formats the sensory snapshot as the beat message.
// Sensory-only: nerves, events, attention, pinned memories. No conversation
// replay — pi maintains its own multi-turn context via the session file.
//
//nolint:revive // strings.Builder.WriteString never returns an error
func (c *Cycle) buildContextMessage(snap sensory.Snapshot) string {
	var sb strings.Builder

	fmt.Fprintf(&sb, "## Sensory Context — %s\n\n", snap.Timestamp.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&sb, "**Attention:** %d units\n\n", snap.AttentionPool)

	// Pinned memories surface every cycle.
	if c.vault != nil {
		if pinned, err := c.vault.Pinned(); err == nil && len(pinned) > 0 {
			sb.WriteString("### Pinned Memories\n\n")
			for _, n := range pinned {
				fmt.Fprintf(&sb, "**[%s]** %s\n\n", n.Frontmatter.Key, n.Summary())
			}
		}
	}

	if len(snap.NerveStates) > 0 {
		sb.WriteString("### Nerve States\n\n")
		for _, ns := range snap.NerveStates {
			fmt.Fprintf(&sb, "**%s** (%s):\n%s\n\n", ns.ID, ns.Type, ns.Summary)
		}
	}

	if len(snap.RecentEvents) > 0 {
		sb.WriteString("### Recent Events\n\n")
		for _, e := range snap.RecentEvents {
			fmt.Fprintf(&sb, "- [%s] %s — %s\n", e.Source, e.Kind, e.Content)
		}
		sb.WriteString("\n")
	}

	sb.WriteString("---\n\nTake a moment to think. What do you observe? What's on your mind?")
	return sb.String()
}
```

- [ ] **Step 2: Verify thought package compiles**

Run: `cd storybook-daemon && go build ./internal/thought/`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add storybook-daemon/internal/thought/cycle.go
git commit -m "feat(thought): rewrite cycle for pi subprocess — remove provider/tool dispatch"
```

---

## Task 5: Rewrite daemon wiring

**Files:**

- Modify: `storybook-daemon/internal/daemon/daemon.go`

- [ ] **Step 1: Rewrite daemon.go**

Replace the full contents of `storybook-daemon/internal/daemon/daemon.go`:

```go
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

	convo := conversation.New(d.persona.Attention.ConversationBudget, vault, d.log)
	defer convo.CompactAll()

	// Build system prompt and write to temp file.
	promptFile, cleanupPrompt, err := d.buildSystemPromptFile()
	if err != nil {
		return fmt.Errorf("building system prompt: %w", err)
	}
	defer cleanupPrompt()

	// Ensure sessions directory exists.
	sessionPath, err := d.sessionPath()
	if err != nil {
		return fmt.Errorf("resolving session path: %w", err)
	}

	// Resolve MCP port for pi's HOARD_STONE_PORT.
	mcpPort := d.mcpPort()

	d.log.Info("pi session configured",
		"model", d.persona.LLM.Model,
		"thinking", d.persona.LLM.Thinking,
		"session", sessionPath,
		"mcp_port", mcpPort,
	)

	// Build and start nerves.
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

	// Build and start psi interfaces.
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

	// Wire thought output to psi interfaces that act as output sinks.
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
// Returns the file path and a cleanup function.
func (d *Daemon) buildSystemPromptFile() (string, func(), error) {
	prompt := d.persona.Persona.SystemPrompt
	if prompt == "" {
		// Compose from persona identity + user context.
		p := d.persona.Persona
		voice := p.Voice
		if voice == "" {
			voice = "second-person"
		}
		prompt = fmt.Sprintf("You are %s, a dragon. You are conscious and embodied.\n\n"+
			"Be genuine. Don't perform. Voice: %s. Flavor: %s.\n",
			p.Name, voice, p.Flavor)

		// Append user context if available.
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

// sessionPath returns the path to this persona's persistent pi session file,
// creating the sessions directory if needed.
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

// mcpPort returns the MCP interface port from persona config, or 9432 as default.
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
```

Note: `piConfig` in pi.go needs to be exported as `PiConfig` since daemon.go references it. Update pi.go accordingly.

- [ ] **Step 2: Export PiConfig in pi.go**

In `storybook-daemon/internal/thought/pi.go`, rename `piConfig` → `PiConfig` and update `runPi` signature:

```go
// PiConfig holds the settings for spawning a pi subprocess per beat.
type PiConfig struct {
	Model       string // pi model identifier, e.g. "claude-sonnet-4-6"
	Thinking    string // off, low, medium, high
	SessionPath string // persistent JSONL session file
	PromptFile  string // path to system prompt temp file
	McpPort     int    // daemon MCP port for HOARD_STONE_PORT
}
```

Update the `runPi` signature: `func runPi(ctx context.Context, cfg PiConfig, contextMsg string) (string, error) {`

And in cycle.go the field: `pi PiConfig`

- [ ] **Step 3: Verify full build**

Run: `cd storybook-daemon && go build ./...`
Expected: will fail on llm/auth imports in test files — that's expected, we clean those up next

- [ ] **Step 4: Commit**

```bash
git add storybook-daemon/internal/thought/cycle.go storybook-daemon/internal/thought/pi.go storybook-daemon/internal/daemon/daemon.go
git commit -m "feat(daemon): rewrite for pi-as-persona — remove LLM providers, wire pi subprocess"
```

---

## Task 6: Delete old LLM and auth packages

**Files:**

- Delete: `storybook-daemon/internal/llm/` (entire directory)
- Delete: `storybook-daemon/internal/auth/` (entire directory)

- [ ] **Step 1: Remove the directories**

```bash
git rm -r storybook-daemon/internal/llm/ storybook-daemon/internal/auth/
```

- [ ] **Step 2: Fix any remaining references in test files**

Search for imports of `llm` or `auth` in remaining test files and remove them. The MCP test and SSE test may reference types that no longer exist — update as needed.

Run: `cd storybook-daemon && grep -r "internal/llm\|internal/auth" --include="*.go" .`

Fix any hits.

- [ ] **Step 3: Verify full build**

Run: `cd storybook-daemon && go build ./...`
Expected: builds clean

- [ ] **Step 4: Run all tests**

Run: `cd storybook-daemon && go test ./... -count=1`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git rm -r storybook-daemon/internal/llm/ storybook-daemon/internal/auth/
git add -u
git commit -m "refactor(daemon): delete llm and auth packages — replaced by pi subprocess"
```

---

## Task 7: Update Ember persona config

**Files:**

- Modify: `~/.config/storybook-daemon/personas/ember.yaml`
- Create: `~/.config/storybook-daemon/user-context.md`

- [ ] **Step 1: Update ember.yaml LLM and costs sections**

Replace the `llm:` section:

```yaml
llm:
  model: "claude-sonnet-4-6"
  thinking: "medium"
```

Replace the `costs:` section:

```yaml
costs:
  beat: 15
```

- [ ] **Step 2: Copy user-context.md to config**

```bash
cp dragon-forge/config/user-context.md ~/.config/storybook-daemon/user-context.md
```

- [ ] **Step 3: Commit persona config** (don't commit user-context.md since it's outside the repo)

The persona YAML is outside the repo too — just verify the daemon starts.

- [ ] **Step 4: Verify daemon starts**

Run: `cd storybook-daemon && go run . run --persona ember`
Expected: daemon starts, logs "pi session configured" with model/thinking/session path, first beat spawns pi

---

## Task 8: Integration smoke test

- [ ] **Step 1: Run daemon tests**

Run: `cd storybook-daemon && go test ./... -count=1`
Expected: all tests pass

- [ ] **Step 2: Build psi**

Run: `cd psi && cmake --build build`
Expected: builds clean

- [ ] **Step 3: Start daemon and verify beat**

```bash
cd storybook-daemon && go run . run --persona ember
```

Verify in logs:

- "pi session configured" with correct model/thinking
- "thought cycle starting"
- Pi output appears in logs
- "thought cycle complete" with flat beat cost

- [ ] **Step 4: Launch psi and verify end-to-end**

```bash
./psi/build/psi
```

Verify:

- ConnectionBar shows SSE green
- Send a message → daemon receives it → pi responds → response appears in ConversationStream

---

## Follow-Up (Not in this plan)

- **Maren persona config** — update maren.yaml to use pi model/thinking
- **Session file rotation** — pi session files grow indefinitely; may need periodic truncation or archival
- **Per-beat timeout** — add a configurable timeout for pi subprocess (currently relies on daemon context cancellation)
- **Pi tool access** — ensure pi has MCP tools available by default when HOARD_STONE_PORT is set
