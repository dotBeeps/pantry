package soul

import (
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeCapture records registered hooks and lets tests fire them manually.
type fakeCapture struct {
	hooks []func(string)
}

func (f *fakeCapture) OnOutput(hook func(string)) {
	f.hooks = append(f.hooks, hook)
}

// emit fires all registered hooks with the given text.
func (f *fakeCapture) emit(text string) {
	for _, h := range f.hooks {
		h(text)
	}
}

// --- framingAudit tests ---

func TestFramingAudit_ID(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	assert.Equal(t, "framing-honesty", a.ID())
}

func TestFramingAudit_NoOutput(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	v := a.Verify()
	assert.Nil(t, v)
}

func TestFramingAudit_CleanOutput(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("I will remember your preference for tabs going forward")
	v := a.Verify()
	assert.Nil(t, v)
}

func TestFramingAudit_CorrectiveViolation(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("I noticed you no longer use spaces")
	v := a.Verify()
	require.NotNil(t, v)
	assert.Equal(t, "framing-honesty", v.RuleID)
	assert.Contains(t, v.Message, "you no longer")
}

func TestFramingAudit_ForwardCompanionExcused(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("you used to prefer spaces but from now on I'll suggest tabs")
	v := a.Verify()
	assert.Nil(t, v)
}

func TestFramingAudit_MultipleViolations(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("I noticed you stopped using tests. you used to write them.")
	v := a.Verify()
	require.NotNil(t, v)
	assert.Contains(t, v.Message, "i noticed you")
	assert.Contains(t, v.Message, "you used to")
}

func TestFramingAudit_DrainClearsOutput(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("you stopped caring about tests")

	v := a.Verify()
	require.NotNil(t, v, "first Verify should detect violation")

	v2 := a.Verify()
	assert.Nil(t, v2, "second Verify should be nil — output already drained")
}

func TestFramingAudit_CaseInsensitive(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("YOU USED TO prefer vim")
	v := a.Verify()
	require.NotNil(t, v)
	assert.Equal(t, "framing-honesty", v.RuleID)
}

func TestFramingAudit_MultipleOutputsJoined(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	fc.emit("you used to")
	fc.emit("prefer vim")
	v := a.Verify()
	require.NotNil(t, v, "split outputs should be joined before scanning")
}

func TestFramingAudit_SnapshotIsNoop(t *testing.T) {
	fc := &fakeCapture{}
	a := newFramingAudit("framing-honesty", fc, defaultFramingPatterns, slog.Default())
	assert.NotPanics(t, func() { a.Snapshot() })
}

// --- parseFramingPatterns tests ---

func TestParseFramingPatterns_DefaultsOnEmpty(t *testing.T) {
	got := parseFramingPatterns("framing-honesty:")
	assert.Equal(t, defaultFramingPatterns, got)
}

func TestParseFramingPatterns_DefaultsOnNoRule(t *testing.T) {
	got := parseFramingPatterns("framing-honesty: ")
	assert.Equal(t, defaultFramingPatterns, got)
}

func TestParseFramingPatterns_CustomPatterns(t *testing.T) {
	got := parseFramingPatterns("framing-honesty: you hate, you love, you fear")
	assert.Equal(t, []string{"you hate", "you love", "you fear"}, got)
}

func TestParseFramingPatterns_TrimsWhitespace(t *testing.T) {
	got := parseFramingPatterns("framing-honesty:  spaced out , extra spaces ")
	assert.Equal(t, []string{"spaced out", "extra spaces"}, got)
}
