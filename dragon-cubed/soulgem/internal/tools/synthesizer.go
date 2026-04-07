// Package tools synthesizes pi tool definitions from a Leylines capability handshake.
// Tools are generated dynamically — agents only see what Leylines has loaded.
package tools

import (
	"dev.dragoncubed/soulgem/internal/leylines"
)

// ToolParam describes a single JSON Schema parameter for a tool.
type ToolParam struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

// ToolDefinition is the pi-compatible tool schema sent to the extension.
type ToolDefinition struct {
	Name        string               `json:"name"`
	Description string               `json:"description"`
	// Capability + action route this tool call back to Leylines.
	Capability  string               `json:"capability"`
	Action      string               `json:"action"`
	Parameters  map[string]ToolParam `json:"parameters"`
	Required    []string             `json:"required"`
}

// SynthesizeFromHandshake builds the full set of ToolDefinitions from a Leylines
// capability handshake. Core capabilities and extension capabilities are both covered.
func SynthesizeFromHandshake(h leylines.HandshakeMessage) []ToolDefinition {
	var tools []ToolDefinition

	// Core capabilities — always present when Leylines is connected
	for _, cap := range h.CoreCapabilities {
		if t, ok := coreToolFor(cap); ok {
			tools = append(tools, t)
		}
	}

	// Extension capabilities
	for _, ext := range h.Extensions {
		for _, cap := range ext.Capabilities {
			if t, ok := extensionToolFor(ext.ID, cap); ok {
				tools = append(tools, t)
			}
		}
	}

	return tools
}

// ── Core capability tools ─────────────────────────────────────────────────────

func coreToolFor(capability string) (ToolDefinition, bool) {
	switch capability {
	case "chat":
		return ToolDefinition{
			Name:        "send_chat",
			Description: "Send a chat message as the Minecraft player.",
			Capability:  "chat",
			Action:      "send",
			Parameters: map[string]ToolParam{
				"message": {Type: "string", Description: "The message to send in chat."},
			},
			Required: []string{"message"},
		}, true

	case "world_query":
		return ToolDefinition{
			Name:        "query_block",
			Description: "Query the block type at a world position.",
			Capability:  "world_query",
			Action:      "block_at",
			Parameters: map[string]ToolParam{
				"x": {Type: "integer", Description: "Block X coordinate."},
				"y": {Type: "integer", Description: "Block Y coordinate."},
				"z": {Type: "integer", Description: "Block Z coordinate."},
			},
			Required: []string{"x", "y", "z"},
		}, true
	}

	return ToolDefinition{}, false
}

// ── Extension capability tools ────────────────────────────────────────────────

func extensionToolFor(extensionID, capability string) (ToolDefinition, bool) {
	switch extensionID {
	case "d3-rumble":
		return rumbleToolFor(capability)
	}
	return ToolDefinition{}, false
}

func rumbleToolFor(capability string) (ToolDefinition, bool) {
	switch capability {
	case "pathfind":
		return ToolDefinition{
			Name:        "pathfind",
			Description: "Navigate the player to an exact block position using Baritone pathfinding. Blocks until the goal is reached or fails.",
			Capability:  "d3-rumble",
			Action:      "pathfind",
			Parameters: map[string]ToolParam{
				"x": {Type: "integer", Description: "Target X coordinate."},
				"y": {Type: "integer", Description: "Target Y coordinate."},
				"z": {Type: "integer", Description: "Target Z coordinate."},
			},
			Required: []string{"x", "y", "z"},
		}, true

	case "pathfind_near":
		return ToolDefinition{
			Name:        "pathfind_near",
			Description: "Navigate the player to within a given range of a position.",
			Capability:  "d3-rumble",
			Action:      "pathfind_near",
			Parameters: map[string]ToolParam{
				"x":     {Type: "integer", Description: "Target X coordinate."},
				"y":     {Type: "integer", Description: "Target Y coordinate."},
				"z":     {Type: "integer", Description: "Target Z coordinate."},
				"range": {Type: "integer", Description: "Acceptable arrival radius in blocks (default 3)."},
			},
			Required: []string{"x", "y", "z"},
		}, true

	case "pathfind_xz":
		return ToolDefinition{
			Name:        "pathfind_xz",
			Description: "Navigate to an XZ coordinate at any Y level.",
			Capability:  "d3-rumble",
			Action:      "pathfind_xz",
			Parameters: map[string]ToolParam{
				"x": {Type: "integer", Description: "Target X coordinate."},
				"z": {Type: "integer", Description: "Target Z coordinate."},
			},
			Required: []string{"x", "z"},
		}, true

	case "mine":
		return ToolDefinition{
			Name:        "mine",
			Description: "Mine specific block types using Baritone. Blocks until the quantity is collected or mining fails.",
			Capability:  "d3-rumble",
			Action:      "mine",
			Parameters: map[string]ToolParam{
				"blocks":   {Type: "array",   Description: "Block registry names to mine, e.g. [\"minecraft:diamond_ore\", \"minecraft:deepslate_diamond_ore\"]."},
				"quantity": {Type: "integer", Description: "Number of blocks to collect (0 = mine indefinitely until cancelled)."},
			},
			Required: []string{"blocks"},
		}, true

	case "cancel":
		return ToolDefinition{
			Name:        "cancel_goal",
			Description: "Cancel the current Baritone goal (pathfinding or mining).",
			Capability:  "d3-rumble",
			Action:      "cancel",
			Parameters:  map[string]ToolParam{},
			Required:    []string{},
		}, true
	}

	return ToolDefinition{}, false
}
