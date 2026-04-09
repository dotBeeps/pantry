package soul

import (
	"log/slog"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestVault(t *testing.T) *memory.Vault {
	t.Helper()
	v, err := memory.Open(t.TempDir(), slog.Default())
	require.NoError(t, err)
	return v
}

func TestMemoryAudit_ID(t *testing.T) {
	vault := newTestVault(t)
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())
	assert.Equal(t, "memory-transparency", audit.ID())
}

func TestMemoryAudit_NoWrites(t *testing.T) {
	vault := newTestVault(t)
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())
	assert.Nil(t, audit.Verify())
}

func TestMemoryAudit_SingleWrite(t *testing.T) {
	vault := newTestVault(t)
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())

	_, err := vault.Write("test-note", memory.KindObservation, "hello world", nil, false, memory.TierUnset)
	require.NoError(t, err)

	assert.Nil(t, audit.Verify())
}

func TestMemoryAudit_MultipleWrites(t *testing.T) {
	vault := newTestVault(t)
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())

	_, err := vault.Write("note-one", memory.KindObservation, "first", nil, false, memory.TierUnset)
	require.NoError(t, err)
	_, err = vault.Write("note-two", memory.KindDecision, "second", nil, false, memory.TierUnset)
	require.NoError(t, err)
	_, err = vault.Write("note-three", memory.KindInsight, "third", nil, false, memory.TierUnset)
	require.NoError(t, err)

	assert.Nil(t, audit.Verify())
}

func TestMemoryAudit_DrainClearsWrites(t *testing.T) {
	vault := newTestVault(t)
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())

	_, err := vault.Write("some-note", memory.KindFragment, "content", nil, false, memory.TierUnset)
	require.NoError(t, err)

	// First Verify drains the write and journals it.
	assert.Nil(t, audit.Verify())

	// Second Verify: the journal creation triggered a hook write (new note via Write).
	// That write gets drained here, journaled to an existing entry via Append(writeFile),
	// which does NOT trigger hooks — so writes are fully drained after this call.
	assert.Nil(t, audit.Verify())

	// Third Verify: nothing left to drain.
	assert.Nil(t, audit.Verify())
}

func TestMemoryAudit_JournalEntryCreated(t *testing.T) {
	vault := newTestVault(t)
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())

	_, err := vault.Write("memory-subject", memory.KindWondering, "is this real?", nil, false, memory.TierUnset)
	require.NoError(t, err)

	require.Nil(t, audit.Verify())

	journalKey := "daily-journal/" + time.Now().Format("2006-01-02")
	note, err := vault.Get(journalKey)
	require.NoError(t, err)
	assert.NotNil(t, note)
}

func TestMemoryAudit_HookRegisteredAtCreation(t *testing.T) {
	vault := newTestVault(t)
	// Hook is registered inside newMemoryAudit — writes after this point are captured.
	audit := newMemoryAudit("memory-transparency", vault, slog.Default())

	// Write directly to vault after audit creation — hook must be live.
	_, err := vault.Write("post-creation-note", memory.KindObservation, "written after audit created", nil, false, memory.TierUnset)
	require.NoError(t, err)

	// Verify must find the write (hook was live), journal it, and return nil.
	assert.Nil(t, audit.Verify())
}
