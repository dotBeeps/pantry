// Package leylines contains the wire protocol types and WebSocket client for
// communicating with D3-Leylines. Types mirror Messages.kt — keep them in sync.
package leylines

import (
	"encoding/json"
	"fmt"
)

// MessageType is the discriminator field present on every wire message.
type MessageType string

const (
	TypeHandshake MessageType = "handshake"
	TypeState     MessageType = "state"
	TypeEvent     MessageType = "event"
	TypeError     MessageType = "error"
	TypeCommand   MessageType = "command"
)

// ── Inbound (Leylines → SoulGem) ─────────────────────────────────────────────

// HandshakeMessage is sent by Leylines immediately after WebSocket upgrade.
// It lists all loaded extensions and their capabilities. SoulGem uses this
// to synthesize pi tool definitions dynamically.
type HandshakeMessage struct {
	Type             MessageType     `json:"type"`
	Version          string          `json:"version"`
	Extensions       []ExtensionInfo `json:"extensions"`
	CoreCapabilities []string        `json:"coreCapabilities"`
}

// ExtensionInfo describes a single loaded Leylines extension.
type ExtensionInfo struct {
	ID           string   `json:"id"`
	Version      string   `json:"version"`
	Capabilities []string `json:"capabilities"`
}

// Vec3 is a 3D position.
type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// ItemStack is a single inventory slot entry.
type ItemStack struct {
	Slot  int    `json:"slot"`
	ID    string `json:"id"`
	Count int    `json:"count"`
}

// PlayerState is the periodic snapshot of the local player.
type PlayerState struct {
	Position  Vec3        `json:"position"`
	Yaw       float32     `json:"yaw"`
	Pitch     float32     `json:"pitch"`
	Health    float32     `json:"health"`
	Food      int         `json:"food"`
	Dimension string      `json:"dimension"`
	Inventory []ItemStack `json:"inventory"`
}

// StateMessage carries a PlayerState snapshot.
type StateMessage struct {
	Type   MessageType `json:"type"`
	Player PlayerState `json:"player"`
}

// EventMessage carries an async event (chat, goal lifecycle, etc.).
// CmdID correlates goal events back to the originating command.
type EventMessage struct {
	Type  MessageType            `json:"type"`
	CmdID string                 `json:"cmdId,omitempty"`
	Event string                 `json:"event"`
	Data  map[string]interface{} `json:"data,omitempty"`
}

// ErrorMessage is returned when Leylines or an extension rejects a command.
type ErrorMessage struct {
	Type    MessageType `json:"type"`
	CmdID   string      `json:"cmdId,omitempty"`
	Message string      `json:"message"`
}

// ── Outbound (SoulGem → Leylines) ────────────────────────────────────────────

// CommandMessage dispatches an action to a Leylines capability.
type CommandMessage struct {
	Type       MessageType            `json:"type"`
	ID         string                 `json:"id"`
	Capability string                 `json:"capability"`
	Action     string                 `json:"action"`
	Params     map[string]interface{} `json:"params"`
}

// NewCommand is a convenience constructor that sets Type = "command".
func NewCommand(id, capability, action string, params map[string]interface{}) CommandMessage {
	if params == nil {
		params = map[string]interface{}{}
	}
	return CommandMessage{
		Type:       TypeCommand,
		ID:         id,
		Capability: capability,
		Action:     action,
		Params:     params,
	}
}

// ── Parsing ───────────────────────────────────────────────────────────────────

// envelope lets us peek at the type field without unmarshaling the full message.
type envelope struct {
	Type MessageType `json:"type"`
}

// PeekType reads the "type" field from a raw JSON message without full unmarshaling.
func PeekType(data []byte) (MessageType, error) {
	var e envelope
	if err := json.Unmarshal(data, &e); err != nil {
		return "", fmt.Errorf("peeking message type: %w", err)
	}
	return e.Type, nil
}
