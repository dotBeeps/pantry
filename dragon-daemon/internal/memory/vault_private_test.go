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

// writePrivateFile writes a private note directly to disk, bypassing vault.Write().
func writePrivateFile(t *testing.T, v *Vault, key, content string) {
	t.Helper()
	raw := fmt.Sprintf("---\nkey: %s\nkind: observation\nprivate: true\npinned: false\ncreated: 2025-01-15T00:00:00Z\nupdated: 2025-01-15T00:00:00Z\n---\n\n%s\n", key, content)
	path := filepath.Join(v.VaultDir(), key+".md")
	require.NoError(t, os.WriteFile(path, []byte(raw), 0o600))
}

// TestVault_PrivateNote_GetReturnsErrPrivate asserts that Get returns ErrPrivate
// (and a nil note) when the target note is marked private: true.
func TestVault_PrivateNote_GetReturnsErrPrivate(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	writePrivateFile(t, v, "secret-note", "private content")

	n, err := v.Get("secret-note")
	assert.Nil(t, n)
	assert.ErrorIs(t, err, ErrPrivate)
}

// TestVault_PublicNote_GetUnaffected asserts that private-shelf enforcement
// does not affect normal public notes.
func TestVault_PublicNote_GetUnaffected(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("public-note", KindObservation, "public content", nil, false, TierUnset)
	require.NoError(t, err)

	n, err := v.Get("public-note")
	require.NoError(t, err)
	require.NotNil(t, n)
	assert.Equal(t, "public content", n.Content)
}

// TestVault_PrivateNote_SearchExcluded asserts that private notes are invisible
// to Search even when their content matches the query.
func TestVault_PrivateNote_SearchExcluded(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	writePrivateFile(t, v, "private-search", "findme secret")

	_, err = v.Write("public-search", KindObservation, "findme secret", nil, false, TierUnset)
	require.NoError(t, err)

	results, err := v.Search("findme", 10)
	require.NoError(t, err)

	keys := make([]string, 0, len(results))
	for _, n := range results {
		keys = append(keys, n.Frontmatter.Key)
	}

	assert.NotContains(t, keys, "private-search", "private note must not appear in search results")
	assert.Contains(t, keys, "public-search", "public note must appear in search results")
}

// TestVault_PrivateNote_PinnedExcluded asserts that a private note marked pinned: true
// is still excluded from Pinned() results.
func TestVault_PrivateNote_PinnedExcluded(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	// Write a private note with pinned: true directly to disk.
	raw := "---\nkey: private-pinned\nkind: observation\nprivate: true\npinned: true\ncreated: 2025-01-15T00:00:00Z\nupdated: 2025-01-15T00:00:00Z\n---\n\npinned private content\n"
	path := filepath.Join(v.VaultDir(), "private-pinned.md")
	require.NoError(t, os.WriteFile(path, []byte(raw), 0o600))

	_, err = v.Write("public-pinned", KindObservation, "pinned public content", nil, true, TierUnset)
	require.NoError(t, err)

	results, err := v.Pinned()
	require.NoError(t, err)

	keys := make([]string, 0, len(results))
	for _, n := range results {
		keys = append(keys, n.Frontmatter.Key)
	}

	assert.NotContains(t, keys, "private-pinned", "private pinned note must not appear in Pinned()")
	assert.Contains(t, keys, "public-pinned", "public pinned note must appear in Pinned()")
}

// TestVault_PrivateNote_WriteBlockedOnOverwrite asserts that attempting to overwrite
// a private note via Write returns ErrPrivate.
func TestVault_PrivateNote_WriteBlockedOnOverwrite(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	writePrivateFile(t, v, "private-existing", "original private content")

	_, err = v.Write("private-existing", KindObservation, "new content", nil, false, TierUnset)
	assert.ErrorIs(t, err, ErrPrivate)
}

// TestVault_PrivateNote_WriteHookNotFired asserts that when Write is blocked by ErrPrivate,
// the registered OnWrite hook is never invoked.
func TestVault_PrivateNote_WriteHookNotFired(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	hookCalls := 0
	v.OnWrite(func(_ WriteRecord) {
		hookCalls++
	})

	writePrivateFile(t, v, "hook-private-note", "private hook test content")

	_, err = v.Write("hook-private-note", KindObservation, "attempted overwrite", nil, false, TierUnset)
	assert.ErrorIs(t, err, ErrPrivate, "Write must return ErrPrivate")
	assert.Equal(t, 0, hookCalls, "OnWrite hook must not fire when Write is blocked by ErrPrivate")
}

// TestVault_OnPrivateAccess_FiredOnGet asserts that registered OnPrivateAccess hooks
// are invoked when Get encounters a private note.
func TestVault_OnPrivateAccess_FiredOnGet(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	writePrivateFile(t, v, "hook-test", "sensitive content")

	var accessed []string
	v.OnPrivateAccess(func(key string) {
		accessed = append(accessed, key)
	})

	_, _ = v.Get("hook-test")

	assert.Equal(t, []string{"hook-test"}, accessed, "OnPrivateAccess hook must be called with the accessed key")
}

// TestVault_OnPrivateAccess_NotFiredOnPublic asserts that OnPrivateAccess hooks
// are NOT invoked when Get retrieves a normal public note.
func TestVault_OnPrivateAccess_NotFiredOnPublic(t *testing.T) {
	v, err := Open(t.TempDir(), slog.Default())
	require.NoError(t, err)

	_, err = v.Write("public-hook-test", KindObservation, "public content", nil, false, TierUnset)
	require.NoError(t, err)

	hookCalled := false
	v.OnPrivateAccess(func(_ string) {
		hookCalled = true
	})

	n, err := v.Get("public-hook-test")
	require.NoError(t, err)
	require.NotNil(t, n)

	assert.False(t, hookCalled, "OnPrivateAccess hook must not fire for public notes")
}
