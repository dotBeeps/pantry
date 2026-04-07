// Package obsidian implements the Obsidian CLI integration for vault discovery and note management.
package obsidian

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"
)

// Client wraps the official Obsidian CLI binary (obsidian 1.12+).
// The CLI communicates with a running Obsidian instance.
// All operations require Obsidian to be running; the first command
// will launch Obsidian automatically if it is not already open.
type Client struct {
	binary  string // path to obsidian binary, default "obsidian"
	vault   string // vault name to target, empty = active vault
	timeout time.Duration
	log     *slog.Logger
}

// NewClient creates a new Obsidian CLI client.
// binary is the path to the obsidian binary (pass "obsidian" for PATH lookup).
// vault is the vault name to target (pass "" to use the active vault).
func NewClient(binary, vault string, timeout time.Duration, log *slog.Logger) *Client {
	if binary == "" {
		binary = "obsidian"
	}
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	return &Client{
		binary:  binary,
		vault:   vault,
		timeout: timeout,
		log:     log,
	}
}

// Available returns true if the obsidian binary is found in PATH.
// It does NOT require Obsidian to be running.
func (c *Client) Available() bool {
	_, err := exec.LookPath(c.binary)
	return err == nil
}

// run executes an obsidian CLI command and returns trimmed stdout.
// If vault is set, it is prepended as "vault=<name>" before all other args.
func (c *Client) run(ctx context.Context, args ...string) (string, error) {
	full := args
	if c.vault != "" {
		full = append([]string{"vault=" + c.vault}, args...)
	}
	//nolint:gosec // G204: binary is from config, not user input; args are constructed internally
	cmd := exec.CommandContext(ctx, c.binary, full...)
	out, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return "", fmt.Errorf("obsidian %s: %w: %s", strings.Join(full, " "), err, string(exitErr.Stderr))
		}
		return "", fmt.Errorf("obsidian %s: %w", strings.Join(full, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

// SearchByTag returns vault-relative file paths whose tags include the given tag.
// tag should be without the "#" prefix, e.g. "consent/high" not "#consent/high".
// Uses Obsidian's indexed search: obsidian search query="tag:#<tag>" format=json
// Returns an empty slice (not an error) when no files match.
func (c *Client) SearchByTag(ctx context.Context, tag string, limit int) ([]string, error) {
	query := "tag:#" + tag
	args := []string{"search", "query=" + query, "format=json"}
	if limit > 0 {
		args = append(args, fmt.Sprintf("limit=%d", limit))
	}
	out, err := c.run(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("searching by tag %q: %w", tag, err)
	}
	if out == "" || out == "null" {
		return []string{}, nil
	}
	var paths []string
	if err := json.Unmarshal([]byte(out), &paths); err != nil {
		return nil, fmt.Errorf("parsing search results for tag %q: %w", tag, err)
	}
	return paths, nil
}

// TagInfo holds a tag name and the number of notes it appears in.
type TagInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Tags returns all tags in the vault with their occurrence counts.
// Uses: obsidian tags format=json counts
func (c *Client) Tags(ctx context.Context) ([]TagInfo, error) {
	out, err := c.run(ctx, "tags", "format=json", "counts")
	if err != nil {
		return nil, fmt.Errorf("listing vault tags: %w", err)
	}
	if out == "" || out == "null" {
		return []TagInfo{}, nil
	}
	var tags []TagInfo
	if err := json.Unmarshal([]byte(out), &tags); err != nil {
		return nil, fmt.Errorf("parsing tags output: %w", err)
	}
	return tags, nil
}

// SetProperty sets a frontmatter property on a note.
// path is the vault-relative path, e.g. "notes/my-note.md".
// Uses: obsidian property:set name=<name> value=<value> path=<path>
func (c *Client) SetProperty(ctx context.Context, path, name, value string) error {
	_, err := c.run(ctx,
		"property:set",
		"name="+name,
		"value="+value,
		"path="+path,
	)
	if err != nil {
		return fmt.Errorf("setting property %q on %q: %w", name, path, err)
	}
	return nil
}

// ReadProperty reads a frontmatter property value from a note.
// path is the vault-relative path, e.g. "notes/my-note.md".
// Uses: obsidian property:read name=<name> path=<path>
func (c *Client) ReadProperty(ctx context.Context, path, name string) (string, error) {
	out, err := c.run(ctx,
		"property:read",
		"name="+name,
		"path="+path,
	)
	if err != nil {
		return "", fmt.Errorf("reading property %q from %q: %w", name, path, err)
	}
	return out, nil
}
