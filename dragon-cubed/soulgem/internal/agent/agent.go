// Package agent manages pi subprocess agents that execute goals in Minecraft.
package agent

import (
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Status is the lifecycle state of an agent.
type Status string

const (
	StatusPending   Status = "pending"
	StatusRunning   Status = "running"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
	StatusKilled    Status = "killed"
)

// maxLogLines is the rolling log buffer size per agent.
const maxLogLines = 500

// Agent represents a single pi subprocess instance executing a goal.
type Agent struct {
	ID        string    `json:"id"`
	Goal      string    `json:"goal"`
	Status    Status    `json:"status"`
	StartedAt time.Time `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt,omitempty"`
	ExitCode  int       `json:"exitCode,omitempty"`
	PID       int       `json:"pid,omitempty"`

	mu   sync.Mutex
	cmd  *exec.Cmd
	logs []string // rolling buffer
}

// AppendLog adds a line to the agent's rolling log buffer.
func (a *Agent) AppendLog(line string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.logs = append(a.logs, line)
	if len(a.logs) > maxLogLines {
		a.logs = a.logs[len(a.logs)-maxLogLines:]
	}
}

// Logs returns a copy of the rolling log buffer.
func (a *Agent) Logs() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]string, len(a.logs))
	copy(out, a.logs)
	return out
}

// LogString returns the log buffer as a newline-joined string.
func (a *Agent) LogString() string {
	return strings.Join(a.Logs(), "\n")
}

// setStatus updates the agent status under its lock.
func (a *Agent) setStatus(s Status) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Status = s
}

// markEnded records the end time and exit state.
func (a *Agent) markEnded(s Status, exitCode int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	a.Status   = s
	a.EndedAt  = &now
	a.ExitCode = exitCode
}

// Snapshot returns a copy of the agent safe to serialise.
func (a *Agent) Snapshot() AgentSnapshot {
	a.mu.Lock()
	defer a.mu.Unlock()
	return AgentSnapshot{
		ID:        a.ID,
		Goal:      a.Goal,
		Status:    a.Status,
		StartedAt: a.StartedAt,
		EndedAt:   a.EndedAt,
		ExitCode:  a.ExitCode,
		PID:       a.PID,
	}
}

// AgentSnapshot is a serialisable, lock-free copy of an Agent's fields.
type AgentSnapshot struct {
	ID        string     `json:"id"`
	Goal      string     `json:"goal"`
	Status    Status     `json:"status"`
	StartedAt time.Time  `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt,omitempty"`
	ExitCode  int        `json:"exitCode,omitempty"`
	PID       int        `json:"pid,omitempty"`
}
