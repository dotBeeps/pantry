package leylines

import (
	"fmt"
	"sync"
	"time"
)

const (
	maxEventHistory  = 64
	commandTimeout   = 90 * time.Second
)

// GoalResult is the outcome of a dispatched command — resolved when Leylines
// emits goal:completed or goal:failed for the corresponding cmdId.
type GoalResult struct {
	Completed bool
	Event     EventMessage // the final goal:completed or goal:failed event
}

// Session holds the live state received from Leylines and manages pending
// command futures so the HTTP API can block until a goal resolves.
//
// All exported methods are safe to call from multiple goroutines.
type Session struct {
	mu sync.RWMutex

	// Latest handshake — nil until first connect.
	Handshake *HandshakeMessage

	// Latest player state — nil until first state broadcast.
	State *PlayerState

	// Rolling window of recent events for LLM context.
	Events []EventMessage

	// Pending command channels keyed by cmdId.
	// Closed and removed when the goal resolves or times out.
	pending map[string]chan GoalResult
}

// NewSession creates an empty Session.
func NewSession() *Session {
	return &Session{
		pending: make(map[string]chan GoalResult),
	}
}

// UpdateHandshake stores the latest handshake.
func (s *Session) UpdateHandshake(h HandshakeMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Handshake = &h
}

// UpdateState stores the latest player state.
func (s *Session) UpdateState(p PlayerState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.State = &p
}

// AppendEvent adds an event to the rolling history and resolves any pending
// command futures that are waiting on this cmdId.
func (s *Session) AppendEvent(ev EventMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Rolling history
	s.Events = append(s.Events, ev)
	if len(s.Events) > maxEventHistory {
		s.Events = s.Events[len(s.Events)-maxEventHistory:]
	}

	// Resolve pending command if this is a terminal goal event
	if ev.CmdID == "" {
		return
	}
	switch ev.Event {
	case "goal:completed", "goal:failed":
		if ch, ok := s.pending[ev.CmdID]; ok {
			ch <- GoalResult{
				Completed: ev.Event == "goal:completed",
				Event:     ev,
			}
			close(ch)
			delete(s.pending, ev.CmdID)
		}
	}
}

// RegisterPending registers a channel that will receive the GoalResult for
// cmdId. The caller must call WaitForResult to consume the result.
func (s *Session) RegisterPending(cmdID string) <-chan GoalResult {
	ch := make(chan GoalResult, 1)
	s.mu.Lock()
	s.pending[cmdID] = ch
	s.mu.Unlock()
	return ch
}

// CancelPending removes a pending command without sending a result.
// Use when the command could not be sent to Leylines.
func (s *Session) CancelPending(cmdID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, ok := s.pending[cmdID]; ok {
		close(ch)
		delete(s.pending, cmdID)
	}
}

// SnapshotHandshake returns a copy of the current handshake, or false if none.
func (s *Session) SnapshotHandshake() (HandshakeMessage, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.Handshake == nil {
		return HandshakeMessage{}, false
	}
	return *s.Handshake, true
}

// SnapshotState returns a copy of the current player state, or false if none.
func (s *Session) SnapshotState() (PlayerState, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.State == nil {
		return PlayerState{}, false
	}
	return *s.State, true
}

// RecentEvents returns a copy of the recent event history.
func (s *Session) RecentEvents() []EventMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]EventMessage, len(s.Events))
	copy(out, s.Events)
	return out
}

// WaitForResult blocks until the goal resolves or [commandTimeout] elapses.
// Returns an error if the command timed out or was not registered.
func WaitForResult(ch <-chan GoalResult) (GoalResult, error) {
	select {
	case result, ok := <-ch:
		if !ok {
			return GoalResult{}, fmt.Errorf("command cancelled before result")
		}
		return result, nil
	case <-time.After(commandTimeout):
		return GoalResult{}, fmt.Errorf("command timed out after %s", commandTimeout)
	}
}
