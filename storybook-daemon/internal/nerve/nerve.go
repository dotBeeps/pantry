// Package nerve defines the Nerve interface — the contract between the daemon
// and each external system the persona senses through.
// Nerves are sensory connectors: they carry perception inward and action outward.
package nerve

import (
	"context"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// Nerve is a connected external system that the persona can sense and act within.
// Each nerve provides a state summary for the sensory aggregator and can execute
// tool calls routed to it by the thought cycle.
type Nerve interface {
	// ID returns the nerve's configured identifier (matches persona YAML).
	ID() string

	// Type returns the nerve type string (e.g. "hoard", "minecraft").
	Type() string

	// Start initializes the nerve's runtime resources (watchers, connections).
	// Called once after construction, before the dragon-heart starts beating.
	Start(ctx context.Context) error

	// Stop shuts down the nerve's runtime resources.
	// Called during daemon shutdown.
	Stop() error

	// State returns the current state summary for inclusion in the sensory snapshot.
	State(ctx context.Context) (sensory.NerveState, error)

	// Execute runs a nerve-specific action routed from the thought cycle.
	// name is the tool call name, args are the parsed arguments.
	// Returns the result string to enqueue as a perceptual event.
	Execute(ctx context.Context, name string, args map[string]any) (string, error)

	// Tools returns the list of tool definitions this nerve exposes to the LLM.
	// These are merged with built-in persona tools before each thought cycle.
	Tools() []ToolDef

	// Events returns a channel of sensory events pushed by this nerve.
	// The dragon-heart: events on this channel trigger immediate thought cycles.
	// Returns nil if this nerve does not produce asynchronous events.
	Events() <-chan sensory.Event
}

// ToolDef describes a tool that a nerve (or the persona itself) exposes to the LLM.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"` // JSON Schema object
}
