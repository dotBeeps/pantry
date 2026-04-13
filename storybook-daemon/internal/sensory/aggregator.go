package sensory

import (
	"sync"
	"time"
)

// Aggregator assembles sensory snapshots for thought cycles.
// It maintains an event queue and merges nerve state summaries.
type Aggregator struct {
	mu         sync.Mutex
	eventQueue []Event
	maxEvents  int // how many recent events to include in a snapshot
}

// New creates an Aggregator with the given event buffer size.
func New(maxEvents int) *Aggregator {
	if maxEvents <= 0 {
		maxEvents = 20
	}
	return &Aggregator{
		maxEvents: maxEvents,
	}
}

// Enqueue adds an event to the perception queue.
func (a *Aggregator) Enqueue(e Event) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.eventQueue = append(a.eventQueue, e)
	// Trim to maxEvents (keep most recent).
	if len(a.eventQueue) > a.maxEvents {
		a.eventQueue = a.eventQueue[len(a.eventQueue)-a.maxEvents:]
	}
}

// Snapshot assembles a perceptual snapshot from current nerve states and the event queue.
// Nerve states are provided by the caller (daemon assembles them from connected nerves).
// The event queue is drained into the snapshot.
func (a *Aggregator) Snapshot(attentionPool int, nerves []NerveState) Snapshot {
	a.mu.Lock()
	events := make([]Event, len(a.eventQueue))
	copy(events, a.eventQueue)
	// Drain the queue — events are consumed by the thought cycle.
	a.eventQueue = a.eventQueue[:0]
	a.mu.Unlock()

	return Snapshot{
		Timestamp:     time.Now(),
		AttentionPool: attentionPool,
		NerveStates:   nerves,
		RecentEvents:  events,
	}
}

// Len returns the current number of queued events.
func (a *Aggregator) Len() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.eventQueue)
}
