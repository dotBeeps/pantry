package quest

import (
	"context"
	"testing"
	"time"
)

func TestIntegrationMockDispatchCompletes(t *testing.T) {
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "silly-kobold-scout",
			Task:    "echo quest-result-payload",
			Harness: "mock",
		}},
	}

	infos, _, err := m.Dispatch(context.Background(), "int-session", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 1 {
		t.Fatalf("got %d quests", len(infos))
	}

	questID := infos[0].QuestID

	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quest did not complete within 5s")
		default:
		}

		statuses := m.Status("int-session", []string{questID})
		if len(statuses) == 1 && statuses[0].Status == StatusCompleted {
			if statuses[0].Summary != "quest-result-payload" {
				t.Errorf("response = %q, want %q", statuses[0].Summary, "quest-result-payload")
			}
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestIntegrationTimeoutKillsProcess(t *testing.T) {
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:      "silly-kobold-scout",
			Task:      "sleep 60",
			Harness:   "mock",
			TimeoutMs: 200,
		}},
	}

	infos, _, err := m.Dispatch(context.Background(), "timeout-session", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	deadline := time.After(3 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quest did not timeout within 3s")
		default:
		}

		statuses := m.Status("timeout-session", []string{infos[0].QuestID})
		if len(statuses) == 1 && (statuses[0].Status == StatusTimeout || statuses[0].Status == StatusFailed) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}
