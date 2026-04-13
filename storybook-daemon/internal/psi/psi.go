// Package psi defines the Interface type — the contract between the daemon
// and each external surface it exposes to the outside world. Named after
// psionics: the channel through which the daemon reaches outward, and the
// world reaches in.
//
// Psi interfaces differ from bodies: bodies are external systems the daemon
// inhabits and senses from; interfaces are communication channels the daemon
// exposes — dot's chat window, a coding tool's MCP connection, etc. The
// daemon speaks *through* interfaces rather than sensing *from* them.
package psi

import (
	"context"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/soul"
)

// Interface is an external surface the persona exposes to the world.
// Unlike bodies, interfaces are not sensory — the daemon does not inhabit them.
type Interface interface {
	// ID returns the interface's configured identifier (matches persona YAML).
	ID() string

	// Type returns the interface type string (e.g. "sse", "mcp").
	Type() string

	// Start initialises the interface's runtime resources (HTTP servers, etc.).
	// Called once after construction, before the dragon-heart starts beating.
	Start(ctx context.Context) error

	// Stop shuts down the interface's runtime resources.
	Stop() error

	// Events returns a channel of inbound events pushed into the daemon by this
	// interface (e.g. a message from dot). The dragon-heart nudges immediately
	// when an event arrives. Returns nil if this interface produces no inbound events.
	Events() <-chan sensory.Event
}

// OutputSink is implemented by interfaces that can receive thought cycle output
// and relay it outward (e.g. streaming thoughts over SSE to dot).
type OutputSink interface {
	Wire(capture soul.OutputCapture)
}
