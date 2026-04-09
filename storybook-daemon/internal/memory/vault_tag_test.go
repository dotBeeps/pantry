package memory

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writePrivateFileWithTag writes a private note directly to disk with a specific tag,
// bypassing vault.Write() — used to test that SearchByTag excludes private notes.
// Copied from the pattern in vault_private_test.go.
func writePrivateFileWithTag(t *testing.T, v *Vault, key, content, tag string) {
	t.Helper()
	raw := fmt.Sprintf(
		"---\nkey: %s\nkind: observation\nprivate: true\npinned: false\ntags:\n  - %s\ncreated: 2025-01-15T00:00:00Z\nupdated: 2025-01-15T00:00:00Z\n---\n\n%s\n",
		key, tag, content,
	)
	path := filepath.Join(v.VaultDir(), key+".md")
	require.NoError(t, os.WriteFile(path, []byte(raw), 0o600))
}

func TestSearchByTag_FindsTaggedNote(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("tagged-note", KindObservation, "content", []string{"work", "consent/medium"}, false, TierUnset)
	require.NoError(t, err)

	results, err := v.SearchByTag("consent/medium", 0)
	require.NoError(t, err)

	keys := make([]string, 0, len(results))
	for _, n := range results {
		keys = append(keys, n.Frontmatter.Key)
	}
	assert.Contains(t, keys, "tagged-note")
}

func TestSearchByTag_ExcludesUntaggedNote(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("has-tag", KindObservation, "with tag", []string{"mytag"}, false, TierUnset)
	require.NoError(t, err)
	_, err = v.Write("no-tag", KindObservation, "without tag", nil, false, TierUnset)
	require.NoError(t, err)

	results, err := v.SearchByTag("mytag", 0)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "has-tag", results[0].Frontmatter.Key)
}

func TestSearchByTag_ExcludesPrivateNote(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	writePrivateFileWithTag(t, v, "private-tagged", "secret content", "secret-tag")

	results, err := v.SearchByTag("secret-tag", 0)
	require.NoError(t, err)
	assert.Empty(t, results, "private notes must not appear in SearchByTag results")
}

func TestSearchByTag_Limit(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	for i := range 5 {
		key := fmt.Sprintf("common-note-%d", i)
		_, err = v.Write(key, KindObservation, "content", []string{"common"}, false, TierUnset)
		require.NoError(t, err)
	}

	results, err := v.SearchByTag("common", 3)
	require.NoError(t, err)
	assert.Len(t, results, 3)
}

func TestSearchByTag_CaseInsensitive(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("mixed-case-note", KindObservation, "content", []string{"MyTag"}, false, TierUnset)
	require.NoError(t, err)

	results, err := v.SearchByTag("mytag", 0)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "mixed-case-note", results[0].Frontmatter.Key)
}

func TestSearchByTag_NoMatches(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("some-note", KindObservation, "content", []string{"other"}, false, TierUnset)
	require.NoError(t, err)

	results, err := v.SearchByTag("nonexistent", 0)
	require.NoError(t, err)
	assert.Empty(t, results)
}

func TestWrite_AutoAppliesTierTag(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	note, err := v.Write("tier-note", KindObservation, "content", []string{"existing"}, false, TierMedium)
	require.NoError(t, err)
	require.NotNil(t, note)

	assert.Contains(t, note.Frontmatter.Tags, "existing")
	assert.Contains(t, note.Frontmatter.Tags, "consent/medium")
}

func TestWrite_TierUnset_NoTierTag(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	note, err := v.Write("unset-tier-note", KindObservation, "content", []string{"existing"}, false, TierUnset)
	require.NoError(t, err)
	require.NotNil(t, note)

	for _, tag := range note.Frontmatter.Tags {
		assert.NotContains(t, tag, "consent/", "no consent tag should be added for TierUnset")
	}
}

func TestWrite_TierInFrontmatter(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("high-tier-note", KindObservation, "sensitive content", nil, false, TierHigh)
	require.NoError(t, err)

	note, err := v.Get("high-tier-note")
	require.NoError(t, err)
	require.NotNil(t, note)
	assert.Equal(t, TierHigh, note.Frontmatter.Tier)
}
