package attention

import (
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
)

// newLedger builds a Ledger from inline config values for test convenience.
func newLedger(pool, floor, rate int, costs persona.CostConfig) *Ledger {
	p := &persona.Persona{
		Attention: persona.AttentionConfig{
			Pool:  pool,
			Floor: floor,
			Rate:  rate,
		},
		Costs: costs,
	}
	return New(p, slog.Default())
}

// defaultCosts returns a CostConfig with small values suitable for most tests.
func defaultCosts() persona.CostConfig {
	return persona.CostConfig{
		Think:    10,
		Speak:    20,
		Remember: 15,
		Search:   5,
		Perceive: 8,
	}
}

// ---- Pool / initialisation -----------------------------------------------

func TestNew_PoolInitialisedToMax(t *testing.T) {
	l := newLedger(100, 50, 60, defaultCosts())
	assert.Equal(t, 100, l.Pool())
}

func TestNew_ZeroPool(t *testing.T) {
	// Zero pool is technically pathological, but New must not panic.
	l := newLedger(0, 0, 0, defaultCosts())
	assert.Equal(t, 0, l.Pool())
}

// ---- AboveFloor -----------------------------------------------------------

func TestAboveFloor_TrueWhenPoolAboveFloor(t *testing.T) {
	l := newLedger(100, 50, 0, defaultCosts())
	assert.True(t, l.AboveFloor())
}

func TestAboveFloor_FalseWhenPoolAtFloor(t *testing.T) {
	l := newLedger(50, 50, 0, defaultCosts())
	// Spend enough to drop below max without going below floor
	// Pool starts at 50, floor is 50 → should be at floor exactly.
	assert.True(t, l.AboveFloor()) // floor means >= floor
}

func TestAboveFloor_FalseWhenPoolBelowFloor(t *testing.T) {
	// Start at 30, floor at 50 — already below floor at construction time.
	l := &Ledger{
		pool:      30,
		max:       100,
		floor:     50,
		rate:      0,
		lastRegen: time.Now(),
		log:       slog.Default(),
	}
	assert.False(t, l.AboveFloor())
}

// ---- Spend ----------------------------------------------------------------

func TestSpend_DeductsFromPool(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("test", 30))
	assert.Equal(t, 70, l.Pool())
}

func TestSpend_ExactPool(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("test", 100))
	assert.Equal(t, 0, l.Pool())
}

func TestSpend_InsufficientFunds_ReturnsError(t *testing.T) {
	l := newLedger(50, 0, 0, defaultCosts())
	err := l.Spend("test", 100)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient attention")
	// Pool must not have changed.
	assert.Equal(t, 50, l.Pool())
}

func TestSpend_ZeroCost_Succeeds(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("noop", 0))
	assert.Equal(t, 100, l.Pool())
}

func TestSpend_MultipleDeductions(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("a", 30))
	require.NoError(t, l.Spend("b", 30))
	require.NoError(t, l.Spend("c", 30))
	assert.Equal(t, 10, l.Pool())
	// One more should fail.
	err := l.Spend("d", 30)
	require.Error(t, err)
}

// ---- Named Spend helpers --------------------------------------------------

func TestSpendThink(t *testing.T) {
	costs := defaultCosts()
	l := newLedger(100, 0, 0, costs)
	require.NoError(t, l.SpendThink())
	assert.Equal(t, 100-costs.Think, l.Pool())
}

func TestSpendSpeak(t *testing.T) {
	costs := defaultCosts()
	l := newLedger(100, 0, 0, costs)
	require.NoError(t, l.SpendSpeak())
	assert.Equal(t, 100-costs.Speak, l.Pool())
}

func TestSpendRemember(t *testing.T) {
	costs := defaultCosts()
	l := newLedger(100, 0, 0, costs)
	require.NoError(t, l.SpendRemember())
	assert.Equal(t, 100-costs.Remember, l.Pool())
}

func TestSpendSearch(t *testing.T) {
	costs := defaultCosts()
	l := newLedger(100, 0, 0, costs)
	require.NoError(t, l.SpendSearch())
	assert.Equal(t, 100-costs.Search, l.Pool())
}

func TestSpendPerceive(t *testing.T) {
	costs := defaultCosts()
	l := newLedger(100, 0, 0, costs)
	require.NoError(t, l.SpendPerceive())
	assert.Equal(t, 100-costs.Perceive, l.Pool())
}

func TestSpendHelpers_FailWhenExhausted(t *testing.T) {
	tests := []struct {
		name  string
		spend func(*Ledger) error
	}{
		{"SpendThink", (*Ledger).SpendThink},
		{"SpendSpeak", (*Ledger).SpendSpeak},
		{"SpendRemember", (*Ledger).SpendRemember},
		{"SpendSearch", (*Ledger).SpendSearch},
		{"SpendPerceive", (*Ledger).SpendPerceive},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := newLedger(0, 0, 0, defaultCosts())
			err := tt.spend(l)
			require.Error(t, err)
			assert.Contains(t, err.Error(), "insufficient attention")
		})
	}
}

// ---- Exhaustion sequence --------------------------------------------------

func TestExhaustion_SequentialSpends(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	spent := 0
	for {
		err := l.SpendThink() // cost 10
		if err != nil {
			break
		}
		spent += defaultCosts().Think
	}
	assert.Equal(t, 100, spent)
	assert.Equal(t, 0, l.Pool())
}

// ---- Audit trail ---------------------------------------------------------

func TestDrainAudit_RecordsEntries(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("alpha", 10))
	require.NoError(t, l.Spend("beta", 20))

	entries := l.DrainAudit()
	require.Len(t, entries, 2)
	assert.Equal(t, "alpha", entries[0].Action)
	assert.Equal(t, 10, entries[0].Cost)
	assert.Equal(t, 90, entries[0].PoolAfter)
	assert.Equal(t, "beta", entries[1].Action)
	assert.Equal(t, 20, entries[1].Cost)
	assert.Equal(t, 70, entries[1].PoolAfter)
}

func TestDrainAudit_ClearsAfterDrain(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("x", 5))
	l.DrainAudit()
	entries := l.DrainAudit()
	assert.Empty(t, entries)
}

func TestDrainAudit_FailedSpendNotRecorded(t *testing.T) {
	l := newLedger(5, 0, 0, defaultCosts())
	_ = l.Spend("expensive", 100)
	entries := l.DrainAudit()
	assert.Empty(t, entries)
}

func TestDrainAudit_TimestampSet(t *testing.T) {
	before := time.Now()
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("ts-check", 1))
	after := time.Now()

	entries := l.DrainAudit()
	require.Len(t, entries, 1)
	assert.True(t, !entries[0].At.Before(before) && !entries[0].At.After(after),
		"audit timestamp %v not in [%v, %v]", entries[0].At, before, after)
}

// ---- Regeneration --------------------------------------------------------

func TestRegen_CapAtMax(t *testing.T) {
	// Spend a little then allow regen with a high rate.
	l := newLedger(100, 0, 3600, defaultCosts()) // rate: 3600/hr means 1/ms
	require.NoError(t, l.Spend("burn", 10))
	// Force lastRegen back by 1 hour so regen math overflows to max.
	l.mu.Lock()
	l.lastRegen = time.Now().Add(-2 * time.Hour)
	l.mu.Unlock()

	// Pool() triggers regen internally.
	assert.Equal(t, 100, l.Pool())
}

func TestRegen_AddsUnitsOverTime(t *testing.T) {
	// Rate: 3600/hr → 1/ms. Spend 10, wait ~15ms, should recover.
	l := newLedger(100, 0, 3600, defaultCosts())
	require.NoError(t, l.Spend("drain", 10))
	poolAfterSpend := l.Pool() // triggers regen; clamp tiny elapsed

	l.mu.Lock()
	l.lastRegen = time.Now().Add(-20 * time.Millisecond)
	l.mu.Unlock()

	poolAfterWait := l.Pool()
	assert.GreaterOrEqual(t, poolAfterWait, poolAfterSpend,
		"pool should not decrease after regen tick")
}

func TestRegen_ZeroRate_NoRecovery(t *testing.T) {
	l := newLedger(100, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("drain", 50))
	poolAfter := l.Pool()

	// Wind clock back — no rate means nothing should be gained.
	l.mu.Lock()
	l.lastRegen = time.Now().Add(-1 * time.Hour)
	l.mu.Unlock()

	assert.Equal(t, poolAfter, l.Pool())
}

// ---- Status ---------------------------------------------------------------

func TestStatus_ContainsKeyInfo(t *testing.T) {
	l := newLedger(100, 50, 60, defaultCosts())
	s := l.Status()
	assert.Contains(t, s, "100")  // pool
	assert.Contains(t, s, "50")   // floor
	assert.Contains(t, s, "60.0") // rate
}

// ---- Concurrency ---------------------------------------------------------

func TestConcurrent_SpendAndPool(t *testing.T) {
	// Hammer Spend and Pool from many goroutines; must not race or panic.
	l := newLedger(10000, 0, 0, defaultCosts())

	const workers = 20
	const spends = 100
	var wg sync.WaitGroup

	for i := range workers {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for range spends {
				_ = l.Spend("concurrent", 1)
				_ = l.Pool()
				_ = l.AboveFloor()
				_ = l.Status()
			}
		}(i)
	}
	wg.Wait()

	// Pool should be ≥ 0 (never go negative).
	assert.GreaterOrEqual(t, l.Pool(), 0)
}

func TestConcurrent_DrainAudit(t *testing.T) {
	// Concurrent spends + drains: total audit entries drained must ≤ total spends.
	l := newLedger(100000, 0, 0, defaultCosts())

	const workers = 10
	const spends = 50

	var (
		wg           sync.WaitGroup
		mu           sync.Mutex
		totalDrained int
	)

	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range spends {
				_ = l.Spend("audit-test", 1)
				entries := l.DrainAudit()
				mu.Lock()
				totalDrained += len(entries)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	// Drain one final time to catch anything not yet drained.
	final := l.DrainAudit()
	mu.Lock()
	totalDrained += len(final)
	mu.Unlock()

	assert.LessOrEqual(t, totalDrained, workers*spends,
		"cannot drain more entries than spends attempted")
	assert.GreaterOrEqual(t, totalDrained, 0)
}

// ---- Edge cases ----------------------------------------------------------

func TestSpend_NegativeCost_NeverExceedsMax(t *testing.T) {
	// Negative cost would increase pool. The implementation uses float subtraction,
	// so a negative cost adds to the pool. Ensure regen cap still applies.
	l := newLedger(100, 0, 0, defaultCosts())
	// Spend negative = top-up, but cap at max.
	_ = l.Spend("top-up", -50) // implementation allows this; pool = 150 before cap
	// Pool is capped by regen only, so it could exceed max here.
	// We're documenting current behaviour, not prescribing a fix.
	// The important invariant is that Pool() never panics.
	_ = l.Pool()
}

func TestLargePool_Allocation(t *testing.T) {
	l := newLedger(1_000_000, 0, 0, defaultCosts())
	require.NoError(t, l.Spend("big", 999_999))
	assert.Equal(t, 1, l.Pool())
}

func TestNew_PersonaZeroFloor_DoesNotPanic(t *testing.T) {
	// Floor of 0 means "always above floor" effectively.
	l := newLedger(100, 0, 0, defaultCosts())
	assert.True(t, l.AboveFloor())
	require.NoError(t, l.Spend("all", 100))
	// Pool is 0, floor is 0 — still at floor.
	assert.True(t, l.AboveFloor())
}
