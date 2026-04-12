package quest

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// watchSingle waits for a single quest to finish and posts quest_completed.
func (m *Manager) watchSingle(ctx context.Context, q *Quest, sessionID string) {
	<-q.done
	m.postQuestCompleted(ctx, q)
}

// watchRally monitors all quests in a rally group. When all quests reach terminal
// state it posts group_completed. If FailFast is set, the first failure cancels remaining quests.
func (m *Manager) watchRally(ctx context.Context, group *Group, quests []*Quest, sessionID string) {
	var wg sync.WaitGroup
	var failed atomic.Int64

	for _, q := range quests {
		q := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-q.done
			m.mu.Lock()
			status := q.Status
			m.mu.Unlock()
			if status == StatusFailed || status == StatusTimeout {
				failed.Add(1)
				if group.FailFast {
					for _, other := range quests {
						if other.ID != q.ID {
							_ = m.Cancel(q.SessionID, other.ID)
						}
					}
				}
			}
			m.postQuestCompleted(ctx, q)
		}()
	}

	wg.Wait()

	f := int(failed.Load())
	s := len(quests) - f
	m.postGroupCompleted(ctx, group, sessionID, s, f)
	close(group.done)
}

// runChain runs chain quests sequentially, threading output via {previous} substitution.
// On any step failure, remaining quests are cancelled.
func (m *Manager) runChain(ctx context.Context, group *Group, quests []*Quest, requests []QuestRequest, sessionID string) {
	succeeded := 0
	failed := 0
	var previous string

	for i, q := range quests {
		qr := requests[i]

		// Substitute {previous} into the task before running.
		m.mu.Lock()
		q.Task = strings.ReplaceAll(q.Task, "{previous}", previous)
		m.mu.Unlock()

		timeout := m.resolveTimeout(qr, q.Combo)
		m.runQuest(q, timeout)

		m.mu.Lock()
		status := q.Status
		m.mu.Unlock()

		if status != StatusCompleted {
			failed++
			// Cancel and mark remaining quests as cancelled.
			for _, remaining := range quests[i+1:] {
				m.terminateQuest(remaining, StatusCancelled, "chain step failed")
				m.postQuestCompleted(ctx, remaining)
			}
			m.postQuestCompleted(ctx, q)
			m.postGroupCompleted(ctx, group, sessionID, succeeded, failed)
			close(group.done)
			return
		}

		succeeded++
		previous = m.resolveOutput(ctx, q, sessionID)
		m.postQuestCompleted(ctx, q)
	}

	m.postGroupCompleted(ctx, group, sessionID, succeeded, failed)
	close(group.done)
}

// resolveOutput determines the best output string for a completed quest.
// Resolution order: stone result message → pi session log → stdout.
func (m *Manager) resolveOutput(ctx context.Context, q *Quest, sessionID string) string {
	// 1. Stone result message from ally.
	if m.broker != nil {
		msgs := m.broker.History(sessionID, "")
		for i := len(msgs) - 1; i >= 0; i-- {
			msg := msgs[i]
			if msg.From == q.Ally && msg.Type == "result" && msg.Content != "" {
				return msg.Content
			}
		}
	}

	// 2. Pi session log (JSONL at q.SessionPath).
	if q.SessionPath != "" {
		if content := readLastAssistantFromSession(q.SessionPath); content != "" {
			return content
		}
	}

	// 3. Stdout fallback (claude --print gives clean text; pi --mode text also works).
	m.mu.Lock()
	resp := q.Response
	m.mu.Unlock()
	return resp
}

// readLastAssistantFromSession scans a pi JSONL session file and returns the content
// of the last assistant message. Returns "" if the file is missing or has no assistant turn.
func readLastAssistantFromSession(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var last string
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		var line map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			continue
		}
		if role, _ := line["role"].(string); role == "assistant" {
			if content, _ := line["content"].(string); content != "" {
				last = content
			}
		}
	}
	return last
}

// postQuestCompleted posts a quest_completed stone event for a finished quest.
// No-op if broker is nil.
func (m *Manager) postQuestCompleted(ctx context.Context, q *Quest) {
	if m.broker == nil {
		return
	}
	m.mu.Lock()
	elapsed := int64(0)
	if q.FinishedAt != nil {
		elapsed = q.FinishedAt.Sub(q.StartedAt).Milliseconds()
	}
	exitCode := 0
	if q.ExitCode != nil {
		exitCode = *q.ExitCode
	}
	summary := q.Response
	if q.Error != "" {
		summary = q.Error
	}
	if len(summary) > 500 {
		summary = summary[:500]
	}
	sessionID := q.SessionID
	groupID := q.GroupID
	ally := q.Ally
	questID := q.ID
	status := string(q.Status)
	m.mu.Unlock()

	msg := stone.Message{
		From:       "quest-manager",
		Addressing: "primary-agent",
		Type:       "quest_completed",
		Content:    summary,
		Metadata: map[string]any{
			"quest_id":   questID,
			"ally":       ally,
			"status":     status,
			"exit_code":  exitCode,
			"elapsed_ms": elapsed,
			"group_id":   groupID,
		},
	}
	_ = m.broker.Send(ctx, sessionID, msg)
}

// postGroupCompleted posts a group_completed stone event.
// No-op if broker is nil.
func (m *Manager) postGroupCompleted(ctx context.Context, group *Group, sessionID string, succeeded, failed int) {
	if m.broker == nil {
		return
	}
	total := succeeded + failed
	content := fmt.Sprintf("%s completed: %d/%d succeeded", group.Mode, succeeded, total)
	msg := stone.Message{
		From:       "quest-manager",
		Addressing: "primary-agent",
		Type:       "group_completed",
		Content:    content,
		Metadata: map[string]any{
			"group_id":  group.ID,
			"mode":      group.Mode,
			"total":     total,
			"succeeded": succeeded,
			"failed":    failed,
		},
	}
	_ = m.broker.Send(ctx, sessionID, msg)
}
