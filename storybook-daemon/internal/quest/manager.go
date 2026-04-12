package quest

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// BrokerSender is the interface the manager uses to post stone events.
// Defined in the consumer package per Go convention.
type BrokerSender interface {
	Send(ctx context.Context, sessionID string, msg stone.Message) error
	History(sessionID string, sinceID string) []stone.Message
}

// Manager owns the lifecycle of all running quests and groups.
type Manager struct {
	mu         sync.Mutex
	quests     map[string]*Quest
	groups     map[string]*Group
	bySession  map[string][]string
	broker     BrokerSender
	cascader   *Cascader
	daemonPort int
	logFn      func(args ...any)
	nextID     atomic.Int64
}

// NewManager constructs a Manager. broker may be nil (no stone events posted).
func NewManager(broker BrokerSender, daemonPort int, logFn func(args ...any)) *Manager {
	return &Manager{
		quests:     make(map[string]*Quest),
		groups:     make(map[string]*Group),
		bySession:  make(map[string][]string),
		broker:     broker,
		cascader:   NewCascader(),
		daemonPort: daemonPort,
		logFn:      logFn,
	}
}

// Dispatch validates all requests, registers quests, and starts goroutines.
// Returns (QuestInfo snapshots, groupID, error). groupID is "" for single mode.
// For chain mode the returned infos cover all steps (IDs pre-allocated).
func (m *Manager) Dispatch(ctx context.Context, sessionID string, req DispatchRequest) ([]QuestInfo, string, error) {
	if len(req.Quests) == 0 {
		return nil, "", fmt.Errorf("no quests to dispatch")
	}
	if req.Mode == "single" && len(req.Quests) != 1 {
		return nil, "", fmt.Errorf("mode %q requires exactly 1 quest, got %d", req.Mode, len(req.Quests))
	}
	for _, qr := range req.Quests {
		if ParseDefName(qr.Ally) == nil {
			return nil, "", fmt.Errorf("invalid ally defName: %q", qr.Ally)
		}
	}

	switch req.Mode {
	case "single":
		qr := req.Quests[0]
		q := m.newQuest(sessionID, qr, "")
		timeout := m.resolveTimeout(qr, q.Combo)

		m.mu.Lock()
		m.quests[q.ID] = q
		m.bySession[sessionID] = append(m.bySession[sessionID], q.ID)
		m.mu.Unlock()

		go m.runQuest(q, timeout)
		return []QuestInfo{q.Info()}, "", nil

	case "rally":
		groupID := "group-" + strconv.FormatInt(m.nextID.Add(1), 10)
		group := &Group{
			ID:       groupID,
			Mode:     "rally",
			FailFast: req.FailFast,
			done:     make(chan struct{}),
		}

		var infos []QuestInfo
		var quests []*Quest
		for _, qr := range req.Quests {
			q := m.newQuest(sessionID, qr, groupID)
			timeout := m.resolveTimeout(qr, q.Combo)
			group.QuestIDs = append(group.QuestIDs, q.ID)

			m.mu.Lock()
			m.quests[q.ID] = q
			m.bySession[sessionID] = append(m.bySession[sessionID], q.ID)
			m.mu.Unlock()

			quests = append(quests, q)
			infos = append(infos, q.Info())
			go m.runQuest(q, timeout)
		}

		m.mu.Lock()
		m.groups[groupID] = group
		m.mu.Unlock()

		go m.watchRally(ctx, group, quests, sessionID)
		return infos, groupID, nil

	case "chain":
		groupID := "group-" + strconv.FormatInt(m.nextID.Add(1), 10)
		group := &Group{
			ID:   groupID,
			Mode: "chain",
			done: make(chan struct{}),
		}

		var infos []QuestInfo
		var quests []*Quest
		for _, qr := range req.Quests {
			q := m.newQuest(sessionID, qr, groupID)
			group.QuestIDs = append(group.QuestIDs, q.ID)

			m.mu.Lock()
			m.quests[q.ID] = q
			m.bySession[sessionID] = append(m.bySession[sessionID], q.ID)
			m.mu.Unlock()

			quests = append(quests, q)
			infos = append(infos, q.Info())
		}

		m.mu.Lock()
		m.groups[groupID] = group
		m.mu.Unlock()

		go m.runChain(ctx, group, quests, req.Quests, sessionID)
		return infos, groupID, nil

	default:
		return nil, "", fmt.Errorf("unknown dispatch mode: %q", req.Mode)
	}
}

func (m *Manager) newQuest(sessionID string, qr QuestRequest, groupID string) *Quest {
	id := "quest-" + strconv.FormatInt(m.nextID.Add(1), 10)
	combo := ParseDefName(qr.Ally)
	model := qr.Model
	if model == "" {
		model = ResolveModel(combo.Noun)
	}
	return &Quest{
		ID:        id,
		SessionID: sessionID,
		GroupID:   groupID,
		Ally:      qr.Ally,
		Combo:     combo,
		Harness:   qr.Harness,
		Model:     model,
		Task:      qr.Task,
		Status:    StatusPending,
		StartedAt: time.Now(),
		done:      make(chan struct{}),
	}
}

func (m *Manager) resolveTimeout(qr QuestRequest, combo *AllyCombo) time.Duration {
	ms := qr.TimeoutMs
	if ms <= 0 {
		ms = JobDefaults(combo.Job).TimeoutMs
	}
	return time.Duration(ms) * time.Millisecond
}

// runQuest runs a quest to completion, retrying with cascade on retryable failures.
func (m *Manager) runQuest(q *Quest, timeout time.Duration) {
	questCtx, questCancel := context.WithCancel(context.Background())
	m.mu.Lock()
	q.cancel = questCancel
	m.mu.Unlock()
	defer questCancel()

	m.setStatus(q, StatusSpawning)

	for {
		runCtx, runCancel := context.WithTimeout(questCtx, timeout)

		var cmd *exec.Cmd
		var cleanup func()

		if q.Harness == "mock" {
			// Internal test-only harness: run task as shell command directly.
			parts := strings.Fields(q.Task)
			if len(parts) == 0 {
				runCancel()
				m.terminateQuest(q, StatusFailed, "empty task")
				return
			}
			cmd = exec.CommandContext(runCtx, parts[0], parts[1:]...)
			cleanup = func() {}
		} else {
			result, err := BuildCommand(runCtx, q, m.daemonPort)
			if err != nil {
				runCancel()
				m.terminateQuest(q, StatusFailed, fmt.Sprintf("build command: %v", err))
				return
			}
			cmd = result.Cmd
			cleanup = result.Cleanup
		}

		m.setStatus(q, StatusRunning)
		response, runErr := m.execCommand(runCtx, q, cmd)
		cleanup()

		// Capture context state before cancelling the run context.
		timedOut := runCtx.Err() == context.DeadlineExceeded
		cancelled := questCtx.Err() == context.Canceled
		runCancel()

		if cancelled {
			m.terminateQuest(q, StatusCancelled, "cancelled")
			return
		}
		if timedOut {
			m.terminateQuest(q, StatusTimeout, "timeout")
			return
		}

		if runErr != nil {
			m.mu.Lock()
			exitCode := 0
			if q.ExitCode != nil {
				exitCode = *q.ExitCode
			}
			stderr := q.LastStderr
			m.mu.Unlock()

			retryable, cooldown := IsRetryable(stderr, exitCode)
			if retryable {
				nextModel, ok := m.cascader.NextModel(q.Combo.Noun, q.Model)
				if ok {
					m.cascader.RecordFailure(q.Model, cooldown)
					m.logFn("quest cascade: ", q.ID, " failing model=", q.Model, " → next=", nextModel)
					select {
					case <-questCtx.Done():
						m.terminateQuest(q, StatusCancelled, "cancelled during cascade cooldown")
						return
					case <-time.After(cooldown):
					}
					m.mu.Lock()
					q.Model = nextModel
					q.Harness = resolveHarness(nextModel)
					m.mu.Unlock()
					continue
				}
			}
			m.terminateQuest(q, StatusFailed, runErr.Error())
			return
		}

		m.mu.Lock()
		q.Response = response
		m.mu.Unlock()
		m.terminateQuest(q, StatusCompleted, "")
		return
	}
}

// execCommand starts the command, collects stdout/stderr, and waits for exit.
func (m *Manager) execCommand(ctx context.Context, q *Quest, cmd *exec.Cmd) (response string, err error) {
	stderrPipe, pipeErr := cmd.StderrPipe()
	if pipeErr != nil {
		return "", fmt.Errorf("stderr pipe: %w", pipeErr)
	}
	stdoutPipe, pipeErr := cmd.StdoutPipe()
	if pipeErr != nil {
		return "", fmt.Errorf("stdout pipe: %w", pipeErr)
	}

	if startErr := cmd.Start(); startErr != nil {
		return "", fmt.Errorf("start: %w", startErr)
	}

	m.mu.Lock()
	q.PID = cmd.Process.Pid
	m.mu.Unlock()

	var (
		lastStderr string
		stderrMu   sync.Mutex
		stderrDone = make(chan struct{})
	)
	go func() {
		defer close(stderrDone)
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			stderrMu.Lock()
			lastStderr = scanner.Text()
			stderrMu.Unlock()
		}
	}()

	var out strings.Builder
	scanner := bufio.NewScanner(stdoutPipe)
	for scanner.Scan() {
		out.WriteString(scanner.Text())
		out.WriteByte('\n')
	}

	<-stderrDone
	waitErr := cmd.Wait()

	stderrMu.Lock()
	finalStderr := lastStderr
	stderrMu.Unlock()

	now := time.Now()
	m.mu.Lock()
	q.FinishedAt = &now
	q.LastStderr = finalStderr
	if waitErr != nil {
		code := cmd.ProcessState.ExitCode()
		q.ExitCode = &code
	} else {
		code := 0
		q.ExitCode = &code
	}
	m.mu.Unlock()

	return strings.TrimSpace(out.String()), waitErr
}

// setStatus updates the quest status and closes q.done on terminal states.
func (m *Manager) setStatus(q *Quest, status Status) {
	m.mu.Lock()
	q.Status = status
	terminal := status == StatusCompleted || status == StatusFailed ||
		status == StatusTimeout || status == StatusCancelled
	m.mu.Unlock()

	if terminal {
		q.doneOnce.Do(func() { close(q.done) })
	}
}

// terminateQuest sets FinishedAt and Error, then calls setStatus.
func (m *Manager) terminateQuest(q *Quest, status Status, errMsg string) {
	now := time.Now()
	m.mu.Lock()
	if q.FinishedAt == nil {
		q.FinishedAt = &now
	}
	if errMsg != "" && q.Error == "" {
		q.Error = errMsg
	}
	m.mu.Unlock()
	m.setStatus(q, status)
}

// watchRally waits for all rally quests to finish, handling FailFast cancellation.
func (m *Manager) watchRally(ctx context.Context, group *Group, quests []*Quest, sessionID string) {
	defer close(group.done)

	for _, q := range quests {
		select {
		case <-ctx.Done():
			// Parent context cancelled — cancel remaining quests.
			for _, remaining := range quests {
				m.mu.Lock()
				cancel := remaining.cancel
				m.mu.Unlock()
				if cancel != nil {
					cancel()
				}
			}
			return
		case <-q.done:
			if group.FailFast {
				m.mu.Lock()
				status := q.Status
				m.mu.Unlock()
				if status == StatusFailed || status == StatusTimeout || status == StatusCancelled {
					// Cancel all other quests in the group.
					for _, other := range quests {
						if other.ID == q.ID {
							continue
						}
						m.mu.Lock()
						cancel := other.cancel
						m.mu.Unlock()
						if cancel != nil {
							cancel()
						}
					}
					return
				}
			}
		}
	}
}

// runChain executes quests sequentially, stopping on failure.
func (m *Manager) runChain(ctx context.Context, group *Group, quests []*Quest, requests []QuestRequest, sessionID string) {
	defer close(group.done)

	for i, q := range quests {
		select {
		case <-ctx.Done():
			m.terminateQuest(q, StatusCancelled, "cancelled")
			// Cancel all remaining quests.
			for _, remaining := range quests[i+1:] {
				m.terminateQuest(remaining, StatusCancelled, "chain cancelled")
			}
			return
		default:
		}

		timeout := m.resolveTimeout(requests[i], q.Combo)
		m.runQuest(q, timeout)

		m.mu.Lock()
		status := q.Status
		m.mu.Unlock()

		if status != StatusCompleted {
			// Cancel remaining quests — chain stops on any non-completion.
			for _, remaining := range quests[i+1:] {
				m.terminateQuest(remaining, StatusCancelled, "chain aborted")
			}
			return
		}
	}
}

// Status returns snapshots for the given quest IDs, or all quests in the session.
func (m *Manager) Status(sessionID string, questIDs []string) []QuestInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	ids := questIDs
	if len(ids) == 0 {
		ids = m.bySession[sessionID]
	}

	var infos []QuestInfo
	for _, id := range ids {
		q, ok := m.quests[id]
		if !ok || q.SessionID != sessionID {
			continue
		}
		infos = append(infos, q.Info())
	}
	return infos
}

// Cancel cancels a single quest by ID.
func (m *Manager) Cancel(sessionID, questID string) error {
	m.mu.Lock()
	q, ok := m.quests[questID]
	m.mu.Unlock()

	if !ok || q.SessionID != sessionID {
		return fmt.Errorf("quest not found: %s", questID)
	}
	if q.cancel != nil {
		q.cancel()
	}
	return nil
}

// Cleanup cancels all quests for a session and removes them from the manager.
func (m *Manager) Cleanup(sessionID string) {
	m.mu.Lock()
	ids := m.bySession[sessionID]
	delete(m.bySession, sessionID)
	for _, id := range ids {
		q, ok := m.quests[id]
		if ok && q.cancel != nil {
			q.cancel()
		}
		delete(m.quests, id)
	}
	m.mu.Unlock()
}
