package agent

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Config holds tunable settings for the Dispatcher.
type Config struct {
	// PiBinary is the path to the pi executable (default: "pi").
	PiBinary string

	// ExtensionPath is the path to soulgem.js to pass to pi.
	// If empty, pi must already have the extension installed globally.
	ExtensionPath string

	// ExtraArgs are appended verbatim to every pi invocation.
	ExtraArgs []string
}

func (c Config) withDefaults() Config {
	if c.PiBinary == "" {
		c.PiBinary = "pi"
	}
	return c
}

// Dispatcher creates and manages pi agent subprocesses.
// All exported methods are safe to call from multiple goroutines.
type Dispatcher struct {
	cfg Config
	log *slog.Logger

	mu     sync.RWMutex
	agents map[string]*Agent
}

// NewDispatcher creates a Dispatcher with the given config.
func NewDispatcher(cfg Config, log *slog.Logger) *Dispatcher {
	return &Dispatcher{
		cfg:    cfg.withDefaults(),
		log:    log,
		agents: make(map[string]*Agent),
	}
}

// Dispatch launches a new pi agent with the given goal and initial context.
//
// initialContext is the assembled LLM context string (player state + events).
// The agent runs asynchronously — use [List] and [Get] to monitor it.
//
// pi is invoked with the initial context + goal fed via stdin. The soulgem
// extension must be loaded (globally installed or via Config.ExtensionPath)
// so the agent has Minecraft tools available.
func (d *Dispatcher) Dispatch(ctx context.Context, goal, initialContext string) (*AgentSnapshot, error) {
	id := newAgentID()
	args := d.buildArgs()

	cmd := exec.Command(d.cfg.PiBinary, args...) //nolint:gosec — intentional subprocess

	// Feed initial context + goal via stdin (pi reads its opening message from stdin
	// when not attached to a terminal).
	cmd.Stdin = strings.NewReader(buildInitialInput(initialContext, goal))

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("creating stdout pipe for agent %s: %w", id, err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("creating stderr pipe for agent %s: %w", id, err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("starting pi for agent %s: %w", id, err)
	}

	agent := &Agent{
		ID:        id,
		Goal:      goal,
		Status:    StatusRunning,
		StartedAt: time.Now(),
		PID:       cmd.Process.Pid,
		cmd:       cmd,
	}

	d.mu.Lock()
	d.agents[id] = agent
	d.mu.Unlock()

	d.log.Info("Agent dispatched", "id", id, "pid", agent.PID, "goal", goal)

	go d.streamLogs(agent, stdoutPipe, "out")
	go d.streamLogs(agent, stderrPipe, "err")
	go d.watch(agent, cmd)

	snap := agent.Snapshot()
	return &snap, nil
}

// Kill sends SIGKILL to the agent's process. Returns an error if the agent
// is not found or is not currently running.
func (d *Dispatcher) Kill(id string) error {
	d.mu.RLock()
	agent, ok := d.agents[id]
	d.mu.RUnlock()
	if !ok {
		return fmt.Errorf("agent %q not found", id)
	}

	agent.mu.Lock()
	status := agent.Status
	proc := agent.cmd.Process
	agent.mu.Unlock()

	if status != StatusRunning {
		return fmt.Errorf("agent %q is not running (status: %s)", id, status)
	}
	if err := proc.Kill(); err != nil {
		return fmt.Errorf("killing agent %q: %w", id, err)
	}
	agent.setStatus(StatusKilled)
	d.log.Info("Agent killed", "id", id)
	return nil
}

// Get returns a snapshot of the agent with the given ID, or false if not found.
func (d *Dispatcher) Get(id string) (AgentSnapshot, bool) {
	d.mu.RLock()
	agent, ok := d.agents[id]
	d.mu.RUnlock()
	if !ok {
		return AgentSnapshot{}, false
	}
	return agent.Snapshot(), true
}

// GetLogs returns the rolling log buffer for an agent, or false if not found.
func (d *Dispatcher) GetLogs(id string) ([]string, bool) {
	d.mu.RLock()
	agent, ok := d.agents[id]
	d.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return agent.Logs(), true
}

// List returns snapshots of all agents.
func (d *Dispatcher) List() []AgentSnapshot {
	d.mu.RLock()
	defer d.mu.RUnlock()
	snaps := make([]AgentSnapshot, 0, len(d.agents))
	for _, a := range d.agents {
		snaps = append(snaps, a.Snapshot())
	}
	return snaps
}

// PiBinaryAvailable reports whether the pi binary can be found on PATH.
func (d *Dispatcher) PiBinaryAvailable() bool {
	_, err := exec.LookPath(d.cfg.PiBinary)
	return err == nil
}

// ── Internal ──────────────────────────────────────────────────────────────────

func (d *Dispatcher) buildArgs() []string {
	var args []string
	if d.cfg.ExtensionPath != "" {
		args = append(args, "--extension", d.cfg.ExtensionPath)
	}
	return append(args, d.cfg.ExtraArgs...)
}

func buildInitialInput(context, goal string) string {
	var sb strings.Builder
	if context != "" {
		sb.WriteString(context)
		sb.WriteString("\n\n")
	}
	sb.WriteString("Goal: ")
	sb.WriteString(goal)
	sb.WriteString("\n")
	return sb.String()
}

func (d *Dispatcher) streamLogs(agent *Agent, r io.Reader, prefix string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		agent.AppendLog(fmt.Sprintf("[%s] %s", prefix, line))
	}
}

func (d *Dispatcher) watch(agent *Agent, cmd *exec.Cmd) {
	err := cmd.Wait()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}

	agent.mu.Lock()
	defer agent.mu.Unlock()

	if agent.Status == StatusKilled {
		return // already marked by Kill()
	}
	status := StatusCompleted
	if exitCode != 0 {
		status = StatusFailed
	}
	now := time.Now()
	agent.Status   = status
	agent.EndedAt  = &now
	agent.ExitCode = exitCode

	d.log.Info("Agent exited", "id", agent.ID, "status", status, "exitCode", exitCode)
}

func newAgentID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
