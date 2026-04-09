// Package body defines the Body interface — the contract between the daemon
// and each external system the persona inhabits.
package body

import (
	"context"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// Body is a connected external system that the persona can sense and act within.
// Each body provides a state summary for the sensory aggregator and can execute
// tool calls routed to it by the thought cycle.
type Body interface {
	// ID returns the body's configured identifier (matches persona YAML).
	ID() string

	// Type returns the body type string (e.g. "hoard", "minecraft").
	Type() string

	// Start initializes the body's runtime resources (watchers, connections).
	// Called once after construction, before the dragon-heart starts beating.
	Start(ctx context.Context) error

	// Stop shuts down the body's runtime resources.
	// Called during daemon shutdown.
	Stop() error

	// State returns the current state summary for inclusion in the sensory snapshot.
	State(ctx context.Context) (sensory.BodyState, error)

	// Execute runs a body-specific action routed from the thought cycle.
	// name is the tool call name, args are the parsed arguments.
	// Returns the result string to enqueue as a perceptual event.
	Execute(ctx context.Context, name string, args map[string]any) (string, error)

	// Tools returns the list of tool definitions this body exposes to the LLM.
	// These are merged with built-in persona tools before each thought cycle.
	Tools() []ToolDef

	// Events returns a channel of sensory events pushed by this body.
	// The dragon-heart: events on this channel trigger immediate thought cycles.
	// Returns nil if this body does not produce asynchronous events.
	Events() <-chan sensory.Event
}

// ToolDef describes a tool that a body (or the persona itself) exposes to the LLM.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"` // JSON Schema object
}
