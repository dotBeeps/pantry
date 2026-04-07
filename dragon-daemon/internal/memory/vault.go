package memory

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"gopkg.in/yaml.v3"
)

// Vault is an Obsidian-compatible markdown vault for persona memory.
// Notes are stored as <key>.md files with YAML frontmatter.
type Vault struct {
	dir string
	log *slog.Logger
}

// Open creates a Vault rooted at dir (created if it doesn't exist).
func Open(dir string, log *slog.Logger) (*Vault, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("creating vault dir %s: %w", dir, err)
	}
	return &Vault{dir: dir, log: log}, nil
}

// VaultDir returns the path to this vault's directory.
func (v *Vault) VaultDir() string { return v.dir }

// Write creates or updates a note with the given key.
// If a note with that key already exists, its content and updated time are replaced.
func (v *Vault) Write(key string, kind Kind, content string, tags []string, pinned bool) (*Note, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	created := now

	// Check if a note with this key already exists (preserve created time).
	existing, err := v.Get(key)
	if err == nil {
		created = existing.Frontmatter.Created
	}

	fm := Frontmatter{
		Key:     key,
		Kind:    kind,
		Tags:    tags,
		Pinned:  pinned,
		Created: created,
		Updated: now,
	}

	note := &Note{
		Frontmatter: fm,
		Content:     content,
	}

	if err := v.writeFile(note); err != nil {
		return nil, err
	}

	v.log.Info("memory written",
		"key", key,
		"kind", kind,
		"pinned", pinned,
		"path", v.notePath(key),
	)
	return note, nil
}

// Get reads the note with the given key. Returns an error if not found.
func (v *Vault) Get(key string) (*Note, error) {
	path := v.notePath(key)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("note %q not found: %w", key, err)
	}
	return parseNote(data)
}

// Pinned returns all notes with pinned: true, sorted by updated desc.
func (v *Vault) Pinned() ([]*Note, error) {
	return v.filter(func(n *Note) bool { return n.Frontmatter.Pinned })
}

// Search returns notes whose content or key contains all query terms (case-insensitive).
// Searches frontmatter key, tags, and content body. Returns up to limit results.
func (v *Vault) Search(query string, limit int) ([]*Note, error) {
	terms := tokenise(query)
	if len(terms) == 0 {
		return nil, nil
	}

	results, err := v.filter(func(n *Note) bool {
		haystack := strings.ToLower(n.Frontmatter.Key + " " +
			strings.Join(n.Frontmatter.Tags, " ") + " " +
			n.Content)
		for _, t := range terms {
			if !strings.Contains(haystack, t) {
				return false
			}
		}
		return true
	})
	if err != nil {
		return nil, err
	}

	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

// filter returns all notes matching pred.
func (v *Vault) filter(pred func(*Note) bool) ([]*Note, error) {
	entries, err := os.ReadDir(v.dir)
	if err != nil {
		return nil, fmt.Errorf("reading vault dir: %w", err)
	}

	var results []*Note
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(v.dir, e.Name()))
		if err != nil {
			v.log.Warn("skipping unreadable note", "file", e.Name(), "err", err)
			continue
		}
		n, err := parseNote(data)
		if err != nil {
			v.log.Warn("skipping unparseable note", "file", e.Name(), "err", err)
			continue
		}
		if pred(n) {
			results = append(results, n)
		}
	}
	return results, nil
}

// writeFile serialises a note to disk.
func (v *Vault) writeFile(n *Note) error {
	fmBytes, err := yaml.Marshal(n.Frontmatter)
	if err != nil {
		return fmt.Errorf("marshaling frontmatter: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("---\n")
	sb.Write(fmBytes)
	sb.WriteString("---\n\n")
	sb.WriteString(n.Content)
	if !strings.HasSuffix(n.Content, "\n") {
		sb.WriteString("\n")
	}

	path := v.notePath(n.Frontmatter.Key)
	return os.WriteFile(path, []byte(sb.String()), 0o644)
}

// notePath returns the filesystem path for a given key.
func (v *Vault) notePath(key string) string {
	return filepath.Join(v.dir, slugify(key)+".md")
}

// parseNote deserialises a markdown file with YAML frontmatter.
func parseNote(data []byte) (*Note, error) {
	s := string(data)

	if !strings.HasPrefix(s, "---\n") {
		return nil, fmt.Errorf("missing frontmatter delimiter")
	}

	rest := s[4:]
	end := strings.Index(rest, "\n---\n")
	if end < 0 {
		return nil, fmt.Errorf("unclosed frontmatter")
	}

	fmRaw := rest[:end]
	body := strings.TrimPrefix(rest[end+5:], "\n")

	var fm Frontmatter
	if err := yaml.Unmarshal([]byte(fmRaw), &fm); err != nil {
		return nil, fmt.Errorf("parsing frontmatter: %w", err)
	}

	return &Note{Frontmatter: fm, Content: strings.TrimSpace(body)}, nil
}

// slugify converts a key to a safe filename (lowercase, hyphens, no special chars).
var nonSlug = regexp.MustCompile(`[^a-z0-9\-]`)

func slugify(key string) string {
	s := strings.ToLower(strings.TrimSpace(key))
	s = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return '-'
		}
		return r
	}, s)
	s = nonSlug.ReplaceAllString(s, "")
	s = regexp.MustCompile(`-{2,}`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "untitled"
	}
	return s
}

// tokenise splits a search query into lowercase terms.
func tokenise(query string) []string {
	var terms []string
	for _, t := range strings.Fields(strings.ToLower(query)) {
		if len(t) >= 2 {
			terms = append(terms, t)
		}
	}
	return terms
}
