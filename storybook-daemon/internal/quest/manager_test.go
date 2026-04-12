package quest

import (
	"context"
	"testing"
	"time"
)

func TestDispatchAndStatus(t *testing.T) {
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "silly-kobold-scout",
			Task:    "echo hello",
			Harness: "mock",
		}},
	}

	infos, _, err := m.Dispatch(context.Background(), "test-session", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 1 {
		t.Fatalf("dispatch len = %d, want 1", len(infos))
	}
	if infos[0].Ally != "silly-kobold-scout" {
		t.Errorf("ally = %q", infos[0].Ally)
	}

	time.Sleep(200 * time.Millisecond)

	statuses := m.Status("test-session", nil)
	if len(statuses) != 1 {
		t.Fatalf("status len = %d, want 1", len(statuses))
	}
	if statuses[0].Status != StatusCompleted && statuses[0].Status != StatusRunning {
		t.Errorf("status = %q, want running or completed", statuses[0].Status)
	}
}

func TestDispatchInvalidDefName(t *testing.T) {
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "invalid-name",
			Task:    "test",
			Harness: "mock",
		}},
	}

	_, _, err := m.Dispatch(context.Background(), "test-session", req)
	if err == nil {
		t.Fatal("expected error for invalid defName")
	}
}

func TestCancel(t *testing.T) {
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:      "silly-kobold-scout",
			Task:      "sleep 10",
			Harness:   "mock",
			TimeoutMs: 30_000,
		}},
	}

	infos, _, err := m.Dispatch(context.Background(), "s1", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	if err := m.Cancel("s1", infos[0].QuestID); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	statuses := m.Status("s1", []string{infos[0].QuestID})
	if len(statuses) != 1 {
		t.Fatalf("status len = %d", len(statuses))
	}
	if statuses[0].Status != StatusCancelled && statuses[0].Status != StatusFailed {
		t.Errorf("status = %q, want cancelled or failed", statuses[0].Status)
	}
}

func TestCleanup(t *testing.T) {
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:      "silly-kobold-scout",
			Task:      "sleep 10",
			Harness:   "mock",
			TimeoutMs: 30_000,
		}},
	}

	_, _, err := m.Dispatch(context.Background(), "s1", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	time.Sleep(50 * time.Millisecond)
	m.Cleanup("s1")
	time.Sleep(100 * time.Millisecond)

	statuses := m.Status("s1", nil)
	if len(statuses) != 0 {
		t.Fatalf("expected empty after cleanup, got %d", len(statuses))
	}
}
