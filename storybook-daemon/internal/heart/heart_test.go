package heart_test

import (
	"context"
	"errors"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/heart"
	"github.com/stretchr/testify/assert"
)

// nopLog returns a discarded logger to keep test output clean.
func nopLog() *slog.Logger {
	return slog.New(slog.NewTextHandler(nopWriter{}, nil))
}

type nopWriter struct{}

func (nopWriter) Write(p []byte) (int, error) { return len(p), nil }

// runWithTimeout runs h.Run in a goroutine and cancels after the given duration.
// Returns when Run exits.
func runWithTimeout(h *heart.Heart, d time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	h.Run(ctx)
}

// --- Construction ---

func TestNew_ReturnsNonNil(t *testing.T) {
	h := heart.New(time.Second, 0, func(ctx context.Context) error { return nil }, nopLog())
	assert.NotNil(t, h)
}

// --- First beat fires immediately on Run ---

func TestRun_FirstBeatImmediate(t *testing.T) {
	var count atomic.Int32
	h := heart.New(10*time.Second, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(ctx)
	}()

	// Give the first beat time to fire, then cancel.
	time.Sleep(20 * time.Millisecond)
	cancel()
	<-done

	assert.GreaterOrEqual(t, count.Load(), int32(1), "first beat should fire immediately on Run")
}

// --- Tick cycle: multiple beats fire over time ---

func TestRun_MultipleBeatsFire(t *testing.T) {
	var count atomic.Int32
	interval := 30 * time.Millisecond
	h := heart.New(interval, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	runWithTimeout(h, 120*time.Millisecond)

	// First beat is immediate + ~3 more from the 120 ms window.
	assert.GreaterOrEqual(t, count.Load(), int32(2), "multiple beats should fire over time")
}

// --- Shutdown: context cancellation stops the loop ---

func TestRun_StopsOnContextCancel(t *testing.T) {
	var count atomic.Int32
	h := heart.New(5*time.Millisecond, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(ctx)
	}()

	// Let a few beats fire, then cancel.
	time.Sleep(30 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// good — Run returned after cancel
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Run did not return after context cancellation")
	}

	snapshot := count.Load()

	// Wait and verify no more beats fire after cancellation.
	time.Sleep(30 * time.Millisecond)
	assert.Equal(t, snapshot, count.Load(), "no beats should fire after context is cancelled")
}

// --- Context already cancelled before Run ---

func TestRun_PreCancelledContext(t *testing.T) {
	var count atomic.Int32
	h := heart.New(time.Second, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before Run

	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(ctx)
	}()

	select {
	case <-done:
		// Run should return quickly; first beat still fires (before the loop).
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Run did not return promptly for already-cancelled context")
	}

	// The immediate first beat fires before the select, but no further beats.
	assert.LessOrEqual(t, count.Load(), int32(1))
}

// --- Nudge: event-driven beat fires before scheduled interval ---

func TestNudge_TriggersImmediateBeat(t *testing.T) {
	var count atomic.Int32
	// Long interval so only nudge-driven beats fire within the test window.
	h := heart.New(10*time.Second, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(ctx)
	}()

	// Wait for the first immediate beat, then nudge.
	time.Sleep(20 * time.Millisecond)
	before := count.Load()
	h.Nudge()

	// Give nudge time to be processed.
	time.Sleep(30 * time.Millisecond)
	after := count.Load()
	cancel()
	<-done

	assert.Greater(t, after, before, "Nudge should trigger an additional beat")
}

// --- Nudge coalescing: rapid nudges produce only one extra beat ---

func TestNudge_Coalescing(t *testing.T) {
	started := make(chan struct{})
	proceed := make(chan struct{})
	var count atomic.Int32

	h := heart.New(10*time.Second, 0, func(_ context.Context) error {
		n := count.Add(1)
		if n == 1 {
			// Signal that first beat is done.
			close(started)
			// Block until we're told to proceed, simulating a slow beat.
			<-proceed
		}
		return nil
	}, nopLog())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(ctx)
	}()

	// Wait for the first beat to start.
	<-started

	// Send two nudges while the beat is still running — only one should be buffered.
	h.Nudge()
	h.Nudge()

	// Unblock the first beat so the nudge can be processed.
	close(proceed)
	time.Sleep(50 * time.Millisecond)

	cancel()
	<-done

	// First beat + at most one coalesced nudge beat.
	assert.LessOrEqual(t, count.Load(), int32(2), "rapid nudges should coalesce into at most one beat")
}

// --- Beat error: logged but heart keeps beating ---

func TestRun_BeatErrorDoesNotStop(t *testing.T) {
	var count atomic.Int32
	interval := 20 * time.Millisecond
	h := heart.New(interval, 0, func(_ context.Context) error {
		count.Add(1)
		return errors.New("simulated beat error")
	}, nopLog())

	runWithTimeout(h, 80*time.Millisecond)

	assert.GreaterOrEqual(t, count.Load(), int32(2), "heart should keep beating even when BeatFunc returns errors")
}

// --- Beat receives the context from Run ---

func TestRun_BeatReceivesContext(t *testing.T) {
	type key struct{}
	ctx := context.WithValue(context.Background(), key{}, "marker")

	received := make(chan context.Context, 1)
	h := heart.New(10*time.Second, 0, func(ctx context.Context) error {
		select {
		case received <- ctx:
		default:
		}
		return nil
	}, nopLog())

	cancelCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(cancelCtx)
	}()

	select {
	case got := <-received:
		assert.Equal(t, "marker", got.Value(key{}), "BeatFunc should receive the context passed to Run")
	case <-time.After(200 * time.Millisecond):
		t.Fatal("BeatFunc was not called")
	}

	cancel()
	<-done
}

// --- Zero variance: interval is exact ---

func TestRun_ZeroVariance_ExactInterval(t *testing.T) {
	var count atomic.Int32
	interval := 25 * time.Millisecond
	h := heart.New(interval, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	runWithTimeout(h, 90*time.Millisecond)

	// With 90 ms window: beat 1 at t=0, beat 2 at ~25ms, beat 3 at ~50ms, beat 4 at ~75ms.
	c := count.Load()
	assert.GreaterOrEqual(t, c, int32(3))
	assert.LessOrEqual(t, c, int32(5), "beat count should be predictable with zero variance")
}

// --- With variance: still fires within reasonable bounds ---

func TestRun_WithVariance_StillFires(t *testing.T) {
	var count atomic.Int32
	// 20 ms interval, ±20% jitter → 16–24 ms range.
	h := heart.New(20*time.Millisecond, 0.2, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	runWithTimeout(h, 150*time.Millisecond)

	// Conservative lower bound: at least 3 beats (first + 2 more in 150ms).
	assert.GreaterOrEqual(t, count.Load(), int32(3), "jitter should not prevent beats from firing")
}

// --- Table-driven: various intervals and beat counts ---

func TestRun_BeatCountsOverTime(t *testing.T) {
	tests := []struct {
		name     string
		interval time.Duration
		window   time.Duration
		minBeats int32
	}{
		{"fast ticks", 15 * time.Millisecond, 60 * time.Millisecond, 3},
		{"slow ticks", 50 * time.Millisecond, 60 * time.Millisecond, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var count atomic.Int32
			h := heart.New(tt.interval, 0, func(_ context.Context) error {
				count.Add(1)
				return nil
			}, nopLog())

			runWithTimeout(h, tt.window)
			assert.GreaterOrEqual(t, count.Load(), tt.minBeats,
				"beat count should meet minimum for interval=%v window=%v", tt.interval, tt.window)
		})
	}
}

// --- Rapid start/stop ---

func TestRun_RapidStartStop(t *testing.T) {
	for i := range 5 {
		_ = i
		h := heart.New(5*time.Millisecond, 0, func(_ context.Context) error { return nil }, nopLog())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		h.Run(ctx)
		cancel()
	}
	// No panic, no deadlock — test passes if we reach here.
}

// --- Nudge before Run: buffered nudge fires on first loop iteration ---

func TestNudge_BeforeRun_Coalesced(t *testing.T) {
	var count atomic.Int32
	h := heart.New(10*time.Second, 0, func(_ context.Context) error {
		count.Add(1)
		return nil
	}, nopLog())

	// Pre-fill the nudge channel.
	h.Nudge()
	h.Nudge() // second should be dropped (buffer=1)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		h.Run(ctx)
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()
	<-done

	// First immediate beat + at most one from the pre-buffered nudge.
	assert.LessOrEqual(t, count.Load(), int32(2))
}
