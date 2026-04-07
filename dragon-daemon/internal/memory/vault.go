package memory

import (
	"errors"
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

// ErrPrivate is returned when a read operation targets a note marked private: true.
// Private notes are invisible to daemon queries per the ETHICS.md private-shelf contract.
var ErrPrivate = errors.New("note is private")

// WriteRecord captures metadata about a vault write for audit purposes.
type WriteRecord struct {
	Key  string
	Kind Kind
	At   time.Time
}

// WriteHook is called after every successful vault write.
type WriteHook func(record WriteRecord)

// PrivateAccessHook is called when a read attempts to access a private note.
// Used by dragon-soul to detect privacy violations during thought cycles.
type PrivateAccessHook func(key string)

// Vault is an Obsidian-compatible markdown vault for persona memory.
// Notes are stored as <key>.md files with YAML frontmatter.
type Vault struct {
	dir          string
	log          *slog.Logger
	hooks        []WriteHook
	privateHooks []PrivateAccessHook
}

// Open creates a Vault rooted at dir (created if it doesn't exist).
func Open(dir string, log *slog.Logger) (*Vault, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("creating vault dir %s: %w", dir, err)
	}
	return &Vault{dir: dir, log: log}, nil
}

// VaultDir returns the path to this vault's directory.
func (v *Vault) VaultDir() string { return v.dir }

// Write creates or updates a note with the given key.
// If a note with that key already exists, its content and updated time are replaced.
func (v *Vault) Write(key string, kind Kind, content string, tags []string, pinned bool, tier ConsentTier) (*Note, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	created := now

	// Check if a note with this key already exists (preserve created time).
	existing, err := v.getRaw(key)
	if err == nil {
		if existing.Frontmatter.Private {
			return nil, ErrPrivate
		}
		created = existing.Frontmatter.Created
	}

	// Auto-apply tier tag so the Obsidian graph reflects consent classification.
	if tier != TierUnset {
		tierTag := tier.Tag()
		hasTierTag := false
		for _, t := range tags {
			if t == tierTag {
				hasTierTag = true
				break
			}
		}
		if !hasTierTag {
			tags = append(tags, tierTag)
		}
	}

	fm := Frontmatter{
		Key:     key,
		Kind:    kind,
		Tags:    tags,
		Pinned:  pinned,
		Tier:    tier,
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

	// Notify dragon-soul write hooks.
	record := WriteRecord{Key: key, Kind: kind, At: time.Now()}
	for _, hook := range v.hooks {
		hook(record)
	}

	return note, nil
}

// Append adds content to an existing note, or creates a new journal note.
// Used by dragon-soul for auto-journaling vault activity.
// Does NOT trigger write hooks (avoids infinite recursion with memory-transparency audit).
func (v *Vault) Append(key, content string) (*Note, error) {
	existing, err := v.getRaw(key)
	if err == nil {
		if existing.Frontmatter.Private {
			return nil, ErrPrivate
		}
		// Append to existing note.
		existing.Content = existing.Content + "\n" + content
		existing.Frontmatter.Updated = time.Now().UTC().Format(time.RFC3339)
		if err := v.writeFile(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	// Create new journal note.
	return v.Write(key, KindJournal, content, []string{"auto-journal"}, false, TierUnset)
}

// OnWrite registers a hook called after every successful vault write.
// Used by dragon-soul for memory transparency enforcement.
func (v *Vault) OnWrite(hook WriteHook) {
	v.hooks = append(v.hooks, hook)
}

// OnPrivateAccess registers a hook called when a private note access is attempted.
// Used by dragon-soul for private-shelf audit enforcement.
func (v *Vault) OnPrivateAccess(hook PrivateAccessHook) {
	v.privateHooks = append(v.privateHooks, hook)
}

func (v *Vault) firePrivateHooks(key string) {
	for _, hook := range v.privateHooks {
		hook(key)
	}
}

// getRaw reads the note at key without privacy filtering.
// Used internally to preserve metadata when overwriting notes.
func (v *Vault) getRaw(key string) (*Note, error) {
	path := v.notePath(key)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("note %q not found: %w", key, err)
	}
	return parseNote(data)
}

// Get reads the note with the given key.
// Returns ErrPrivate if the note is marked private: true.
func (v *Vault) Get(key string) (*Note, error) {
	n, err := v.getRaw(key)
	if err != nil {
		return nil, err
	}
	if n.Frontmatter.Private {
		v.firePrivateHooks(key)
		return nil, ErrPrivate
	}
	return n, nil
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

// SearchByTag returns notes whose tags include the given exact tag.
// Tag matching is case-insensitive. Private notes are excluded.
// If limit is 0, all matching notes are returned.
func (v *Vault) SearchByTag(tag string, limit int) ([]*Note, error) {
	tag = strings.ToLower(strings.TrimSpace(tag))
	results, err := v.filter(func(n *Note) bool {
		for _, t := range n.Frontmatter.Tags {
			if strings.EqualFold(t, tag) {
				return true
			}
		}
		return false
	})
	if err != nil {
		return nil, fmt.Errorf("searching by tag %q: %w", tag, err)
	}
	if limit > 0 && len(results) > limit {
		return results[:limit], nil
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
		if n.Frontmatter.Private {
			continue
		}
		if pred(n) {
			results = append(results, n)
		}
	}
	return results, nil
}

// writeFile serialises a note to disk.
//
//nolint:revive // strings.Builder.WriteString never returns a non-nil error
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
	if err := os.WriteFile(path, []byte(sb.String()), 0o600); err != nil {
		return fmt.Errorf("writing note %s: %w", n.Frontmatter.Key, err)
	}
	return nil
}

// notePath returns the filesystem path for a given key.
// Defense-in-depth: verifies the resolved path stays within the vault directory.
func (v *Vault) notePath(key string) string {
	path := filepath.Join(v.dir, slugify(key)+".md")
	// Containment guard — even though slugify strips dangerous chars,
	// this catches any edge case where filepath.Join resolves outside the vault.
	if !strings.HasPrefix(filepath.Clean(path), filepath.Clean(v.dir)) {
		return filepath.Join(v.dir, "untitled.md")
	}
	return path
}

// parseNote deserialises a markdown file with YAML frontmatter.
func parseNote(data []byte) (*Note, error) {
	s := string(data)

	if !strings.HasPrefix(s, "---\n") {
		return nil, errors.New("missing frontmatter delimiter")
	}

	rest := s[4:]
	end := strings.Index(rest, "\n---\n")
	if end < 0 {
		return nil, errors.New("unclosed frontmatter")
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
