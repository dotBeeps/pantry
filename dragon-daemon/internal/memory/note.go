// Package memory implements an Obsidian-compatible markdown vault for persona memory.
package memory

import "time"

// Kind classifies the type of memory being stored.
type Kind string

const (
	KindObservation Kind = "observation"
	KindDecision    Kind = "decision"
	KindInsight     Kind = "insight"
	KindWondering   Kind = "wondering" // half-formed things; held loosely
	KindFragment    Kind = "fragment"  // things that don't fit yet
)

// Frontmatter is the YAML header of a memory note.
type Frontmatter struct {
	Key     string   `yaml:"key"`
	Kind    Kind     `yaml:"kind"`
	Tags    []string `yaml:"tags,omitempty"`
	Pinned  bool     `yaml:"pinned"`
	Created string   `yaml:"created"`
	Updated string   `yaml:"updated"`
}

// Note is a single memory entry.
type Note struct {
	Frontmatter Frontmatter
	Content     string
}

// CreatedAt parses the Created timestamp.
func (n *Note) CreatedAt() (time.Time, error) {
	return time.Parse(time.RFC3339, n.Frontmatter.Created)
}

// UpdatedAt parses the Updated timestamp.
func (n *Note) UpdatedAt() (time.Time, error) {
	return time.Parse(time.RFC3339, n.Frontmatter.Updated)
}

// Summary returns a compact representation for injection into the sensory snapshot.
func (n *Note) Summary() string {
	if len(n.Content) > 300 {
		return n.Content[:300] + " [...]"
	}
	return n.Content
}
