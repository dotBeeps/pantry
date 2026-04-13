// Package sensory provides the perceptual context passed into each thought cycle.
package sensory

import "time"

// Snapshot is the perceptual context assembled for a single thought cycle.
// It represents what the persona is currently "aware of."
type Snapshot struct {
	// Timestamp is when the snapshot was assembled.
	Timestamp time.Time

	// AttentionPool is the current attention level at snapshot time.
	AttentionPool int

	// NerveStates holds a summary of each connected nerve's current state.
	NerveStates []NerveState

	// RecentEvents holds the last N perceptual events from the event queue.
	RecentEvents []Event
}

// NerveState is a summary of one connected nerve at snapshot time.
type NerveState struct {
	// ID matches the nerve's configured ID.
	ID string

	// Type is the nerve type (hoard, minecraft, etc.)
	Type string

	// Summary is a short human-readable description of the nerve's current state.
	// This is what gets injected into the LLM context.
	Summary string

	// Raw is optional structured data for use in tool call routing.
	Raw map[string]any
}

// Event is a single perceptual input that arrived since the last thought cycle.
type Event struct {
	// Source identifies where the event came from (nerve ID, system, etc.)
	Source string

	// Kind classifies the event (e.g. "file_changed", "message", "observation").
	Kind string

	// Content is the human-readable event payload.
	Content string

	// At is when the event occurred.
	At time.Time
}
