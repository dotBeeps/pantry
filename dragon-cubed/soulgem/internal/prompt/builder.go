// Package prompt builds LLM context strings from Leylines state and event history.
package prompt

import (
	"fmt"
	"strings"

	"dev.dragoncubed/soulgem/internal/leylines"
)

// Context is the structured LLM context assembled from current Leylines state.
type Context struct {
	// PlayerSection is a human-readable description of the current player state.
	PlayerSection string

	// EventSection summarises recent events (chat, goal lifecycle).
	EventSection string

	// Full is the combined prompt-ready string.
	Full string
}

// Build assembles a Context from a player state snapshot and recent event history.
// Either argument may be zero-value — Build handles missing state gracefully.
func Build(state leylines.PlayerState, events []leylines.EventMessage) Context {
	player := buildPlayerSection(state)
	evts   := buildEventSection(events)

	parts := []string{"## Current State", player}
	if evts != "" {
		parts = append(parts, "## Recent Events", evts)
	}

	return Context{
		PlayerSection: player,
		EventSection:  evts,
		Full:          strings.Join(parts, "\n\n"),
	}
}

func buildPlayerSection(s leylines.PlayerState) string {
	if s.Dimension == "" {
		return "Player state not yet available."
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Position: (%.1f, %.1f, %.1f) facing yaw=%.0f°\n",
		s.Position.X, s.Position.Y, s.Position.Z, s.Yaw)
	fmt.Fprintf(&sb, "Health: %.0f/20 | Food: %d/20\n", s.Health, s.Food)
	fmt.Fprintf(&sb, "Dimension: %s\n", s.Dimension)

	if len(s.Inventory) > 0 {
		sb.WriteString("Inventory (non-empty slots):\n")
		for _, item := range s.Inventory {
			fmt.Fprintf(&sb, "  slot %d: %s ×%d\n", item.Slot, item.ID, item.Count)
		}
	} else {
		sb.WriteString("Inventory: empty\n")
	}

	return sb.String()
}

func buildEventSection(events []leylines.EventMessage) string {
	if len(events) == 0 {
		return ""
	}

	var sb strings.Builder
	// Show at most the 10 most recent events — keep context tight
	start := len(events) - 10
	if start < 0 {
		start = 0
	}
	for _, ev := range events[start:] {
		switch ev.Event {
		case "chat:player":
			msg, _ := ev.Data["message"].(string)
			sender, _ := ev.Data["sender"].(string)
			if sender != "" {
				fmt.Fprintf(&sb, "[chat] <%s> %s\n", sender, msg)
			} else {
				fmt.Fprintf(&sb, "[chat] %s\n", msg)
			}
		case "chat:system":
			msg, _ := ev.Data["message"].(string)
			fmt.Fprintf(&sb, "[system] %s\n", msg)
		case "goal:started":
			action, _ := ev.Data["action"].(string)
			fmt.Fprintf(&sb, "[goal] started: %s\n", action)
		case "goal:completed":
			fmt.Fprintf(&sb, "[goal] completed\n")
		case "goal:failed":
			reason, _ := ev.Data["reason"].(string)
			fmt.Fprintf(&sb, "[goal] failed: %s\n", reason)
		case "goal:progressed":
			status, _ := ev.Data["status"].(string)
			fmt.Fprintf(&sb, "[goal] %s\n", status)
		default:
			fmt.Fprintf(&sb, "[event] %s\n", ev.Event)
		}
	}
	return sb.String()
}
