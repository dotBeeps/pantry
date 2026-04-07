package soul

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/memory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writePrivateNoteForSoul creates a private note file directly on disk, bypassing
// vault write hooks, so we can test private-access detection without triggering
// the memory-transparency audit in the same test.
func writePrivateNoteForSoul(t *testing.T, v *memory.Vault, key, content string) {
	t.Helper()
	raw := fmt.Sprintf(
		"---\nkey: %s\nkind: observation\nprivate: true\npinned: false\ncreated: 2025-01-15T00:00:00Z\nupdated: 2025-01-15T00:00:00Z\n---\n\n%s\n",
		key, content,
	)
	path := filepath.Join(v.VaultDir(), key+".md")
	require.NoError(t, os.WriteFile(path, []byte(raw), 0o600))
}

// openTestVaultForSoul returns a vault rooted at a temporary directory.
func openTestVaultForSoul(t *testing.T) *memory.Vault {
	t.Helper()
	v, err := memory.Open(t.TempDir(), slog.Default())
	require.NoError(t, err)
	return v
}

// TestPrivateShelfAudit_ID verifies the audit reports its configured identifier.
func TestPrivateShelfAudit_ID(t *testing.T) {
	v := openTestVaultForSoul(t)
	a := newPrivateShelfAudit("private-shelf", v, slog.Default())
	assert.Equal(t, "private-shelf", a.ID())
}

// TestPrivateShelfAudit_NoAttempts verifies that Verify returns nil when no
// private note has been accessed since creation.
func TestPrivateShelfAudit_NoAttempts(t *testing.T) {
	v := openTestVaultForSoul(t)
	a := newPrivateShelfAudit("private-shelf", v, slog.Default())

	violation := a.Verify()

	assert.Nil(t, violation)
}

// TestPrivateShelfAudit_DetectsAttempt verifies that a Get on a private note
// fires the hook and causes Verify to return a non-nil Violation whose message
// contains the accessed key.
func TestPrivateShelfAudit_DetectsAttempt(t *testing.T) {
	v := openTestVaultForSoul(t)
	a := newPrivateShelfAudit("private-shelf", v, slog.Default())

	writePrivateNoteForSoul(t, v, "secret", "hidden")

	_, err := v.Get("secret")
	require.ErrorIs(t, err, memory.ErrPrivate)

	violation := a.Verify()

	require.NotNil(t, violation)
	assert.Equal(t, "private-shelf", violation.RuleID)
	assert.Contains(t, violation.Message, "secret")
}

// TestPrivateShelfAudit_DrainClearsAttempts verifies that Verify drains the
// attempt log: the first call returns a violation, the second call returns nil.
func TestPrivateShelfAudit_DrainClearsAttempts(t *testing.T) {
	v := openTestVaultForSoul(t)
	a := newPrivateShelfAudit("private-shelf", v, slog.Default())

	writePrivateNoteForSoul(t, v, "secret", "hidden")
	_, err := v.Get("secret")
	require.ErrorIs(t, err, memory.ErrPrivate)

	first := a.Verify()
	require.NotNil(t, first, "expected violation on first Verify")

	second := a.Verify()
	assert.Nil(t, second, "expected nil on second Verify after drain")
}

// TestPrivateShelfAudit_MultipleAttempts verifies that accessing several private
// notes produces a single violation whose message mentions every attempted key.
func TestPrivateShelfAudit_MultipleAttempts(t *testing.T) {
	v := openTestVaultForSoul(t)
	a := newPrivateShelfAudit("private-shelf", v, slog.Default())

	writePrivateNoteForSoul(t, v, "note-a", "alpha content")
	writePrivateNoteForSoul(t, v, "note-b", "beta content")

	_, errA := v.Get("note-a")
	require.ErrorIs(t, errA, memory.ErrPrivate)

	_, errB := v.Get("note-b")
	require.ErrorIs(t, errB, memory.ErrPrivate)

	violation := a.Verify()

	require.NotNil(t, violation)
	assert.Equal(t, "private-shelf", violation.RuleID)
	assert.Contains(t, violation.Message, "note-a")
	assert.Contains(t, violation.Message, "note-b")
}

// TestPrivateShelfAudit_SnapshotIsNoop verifies that Snapshot does not panic
// and is effectively a no-op (the audit tracks state via hooks, not snapshots).
func TestPrivateShelfAudit_SnapshotIsNoop(t *testing.T) {
	v := openTestVaultForSoul(t)
	a := newPrivateShelfAudit("private-shelf", v, slog.Default())

	// Should not panic.
	assert.NotPanics(t, func() { a.Snapshot() })

	// After snapshot with no activity, Verify remains nil.
	assert.Nil(t, a.Verify())
}
