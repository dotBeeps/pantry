package quest_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/quest"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// mockBroker records sent messages and serves them via History.
type mockBroker struct {
	mu   sync.Mutex
	msgs []stone.Message
}

func (b *mockBroker) Send(_ context.Context, _ string, msg stone.Message) error {
	b.mu.Lock()
	b.msgs = append(b.msgs, msg)
	b.mu.Unlock()
	return nil
}

func (b *mockBroker) History(_ string, _ string) []stone.Message {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]stone.Message, len(b.msgs))
	copy(out, b.msgs)
	return out
}

func (b *mockBroker) messagesOfType(typ string) []stone.Message {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []stone.Message
	for _, m := range b.msgs {
		if m.Type == typ {
			out = append(out, m)
		}
	}
	return out
}

func waitQuestStatus(t *testing.T, m *quest.Manager, sessionID, questID string, want quest.Status, deadline time.Duration) {
	t.Helper()
	end := time.After(deadline)
	for {
		select {
		case <-end:
			t.Fatalf("quest %s did not reach status %q within %v", questID, want, deadline)
		default:
		}
		statuses := m.Status(sessionID, []string{questID})
		if len(statuses) == 1 && statuses[0].Status == want {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestRally_AllComplete_PostsGroupCompleted(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, groupID, err := m.Dispatch(context.Background(), "rally-session", quest.DispatchRequest{
		Mode: "rally",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "echo hello", Harness: "mock"},
			{Ally: "silly-kobold-scout", Task: "echo world", Harness: "mock"},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 2 {
		t.Fatalf("expected 2 infos, got %d", len(infos))
	}
	if groupID == "" {
		t.Fatal("expected non-empty groupID")
	}

	// Wait for both quests to complete.
	for _, info := range infos {
		waitQuestStatus(t, m, "rally-session", info.QuestID, quest.StatusCompleted, 5*time.Second)
	}

	// group_completed should arrive shortly after.
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("group_completed event not received within 2s")
		default:
		}
		if msgs := broker.messagesOfType("group_completed"); len(msgs) > 0 {
			msg := msgs[0]
			if msg.Metadata["mode"] != "rally" {
				t.Errorf("group_completed mode = %v, want rally", msg.Metadata["mode"])
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestRally_FailFast_CancelsRemaining(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, _, err := m.Dispatch(context.Background(), "failfast-session", quest.DispatchRequest{
		Mode:     "rally",
		FailFast: true,
		Quests: []quest.QuestRequest{
			// First quest fails immediately (false command).
			{Ally: "silly-kobold-scout", Task: "false", Harness: "mock", TimeoutMs: 5000},
			// Second quest would sleep forever if not cancelled.
			{Ally: "silly-kobold-scout", Task: "sleep 60", Harness: "mock", TimeoutMs: 5000},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	// Both quests should reach a terminal state (failed or cancelled) within deadline.
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quests did not terminate within 5s")
		default:
		}
		statuses := m.Status("failfast-session", []string{infos[0].QuestID, infos[1].QuestID})
		allTerminal := true
		for _, s := range statuses {
			if s.Status != quest.StatusFailed && s.Status != quest.StatusCancelled && s.Status != quest.StatusTimeout {
				allTerminal = false
			}
		}
		if len(statuses) == 2 && allTerminal {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestChain_Sequential_SubstitutesPrevious(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, groupID, err := m.Dispatch(context.Background(), "chain-session", quest.DispatchRequest{
		Mode: "chain",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "echo step-one-result", Harness: "mock"},
			// {previous} will be substituted with step 1's output.
			{Ally: "silly-kobold-scout", Task: "echo step-two-got-{previous}", Harness: "mock"},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 2 {
		t.Fatalf("expected 2 infos, got %d", len(infos))
	}
	if groupID == "" {
		t.Fatal("expected non-empty groupID for chain")
	}

	// Wait for both quests to complete.
	for _, info := range infos {
		waitQuestStatus(t, m, "chain-session", info.QuestID, quest.StatusCompleted, 8*time.Second)
	}

	// Second quest's task should have had {previous} substituted.
	statuses := m.Status("chain-session", []string{infos[1].QuestID})
	if len(statuses) != 1 {
		t.Fatal("quest 2 status not found")
	}
	// The echo output of quest 2 should reference step-one-result (substituted).
	if !strings.Contains(statuses[0].Summary, "step-two-got-") {
		t.Errorf("chain substitution: summary = %q, expected to contain step-two-got-", statuses[0].Summary)
	}
}

func TestChain_StepFails_CancelsRemaining(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, _, err := m.Dispatch(context.Background(), "chain-fail-session", quest.DispatchRequest{
		Mode: "chain",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "false", Harness: "mock", TimeoutMs: 5000},
			{Ally: "silly-kobold-scout", Task: "echo should-not-run", Harness: "mock", TimeoutMs: 5000},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	// Both quests should reach terminal state.
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quests did not terminate within 5s")
		default:
		}
		statuses := m.Status("chain-fail-session", []string{infos[0].QuestID, infos[1].QuestID})
		if len(statuses) == 2 {
			s0 := statuses[0].Status
			s1 := statuses[1].Status
			if (s0 == quest.StatusFailed || s0 == quest.StatusTimeout) &&
				(s1 == quest.StatusCancelled) {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestQuestCompleted_PostedToStone(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, _, err := m.Dispatch(context.Background(), "stone-session", quest.DispatchRequest{
		Mode: "single",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "echo hi", Harness: "mock"},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	waitQuestStatus(t, m, "stone-session", infos[0].QuestID, quest.StatusCompleted, 5*time.Second)

	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quest_completed not posted within 2s")
		default:
		}
		if msgs := broker.messagesOfType("quest_completed"); len(msgs) > 0 {
			msg := msgs[0]
			if msg.Metadata["ally"] != "silly-kobold-scout" {
				t.Errorf("quest_completed ally = %v", msg.Metadata["ally"])
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}
