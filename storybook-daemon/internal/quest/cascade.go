package quest

import (
	"strings"
	"sync"
	"time"
)

// IsRetryable inspects subprocess stderr and exit code to determine whether a
// quest failure is transient and should trigger a cascade retry.
func IsRetryable(stderr string, exitCode int) (retryable bool, cooldown time.Duration) {
	lower := strings.ToLower(stderr)
	if strings.Contains(lower, "429") || strings.Contains(lower, "rate limit") {
		return true, 30 * time.Second
	}
	for _, code := range []string{"500", "502", "503", "504"} {
		if strings.Contains(lower, code) {
			return true, 10 * time.Second
		}
	}
	return false, 0
}

// providerOf extracts the provider prefix from a model string.
// "zai/glm-4.5-air" → "zai", "anthropic/claude-haiku-4-5" → "anthropic".
func providerOf(model string) string {
	provider, _, _ := strings.Cut(model, "/")
	return provider
}

// CooldownTracker records per-provider cooldown deadlines.
// Cooldowns are account-wide (not per-session), so a single tracker lives on the Manager.
type CooldownTracker struct {
	mu        sync.Mutex
	providers map[string]time.Time // provider → cooled-until
}

// NewCooldownTracker creates an empty tracker.
func NewCooldownTracker() *CooldownTracker {
	return &CooldownTracker{providers: make(map[string]time.Time)}
}

// IsCooledDown reports whether the given provider is still within its cooldown window.
func (t *CooldownTracker) IsCooledDown(provider string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	until, ok := t.providers[provider]
	return ok && time.Now().Before(until)
}

// Record marks the provider as cooled for the given duration.
func (t *CooldownTracker) Record(provider string, dur time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.providers[provider] = time.Now().Add(dur)
}

// Cascader manages model cascade retries with cooldown tracking.
// One Cascader lives on the Manager (account-wide, not per-session).
type Cascader struct {
	cooldowns *CooldownTracker
}

// NewCascader creates a Cascader with a fresh cooldown tracker.
func NewCascader() *Cascader {
	return &Cascader{cooldowns: NewCooldownTracker()}
}

// NextModel returns the next model to try after failedModel within the noun's
// cascade chain, skipping any providers currently in cooldown.
// Returns "", false if the cascade is exhausted.
func (c *Cascader) NextModel(noun, failedModel string) (string, bool) {
	chain := ModelCascade(noun)
	failedIdx := -1
	for i, m := range chain {
		if m == failedModel {
			failedIdx = i
			break
		}
	}
	if failedIdx < 0 {
		return "", false
	}
	for _, m := range chain[failedIdx+1:] {
		if !c.cooldowns.IsCooledDown(providerOf(m)) {
			return m, true
		}
	}
	return "", false
}

// RecordFailure marks the provider of failedModel as cooled for dur.
func (c *Cascader) RecordFailure(failedModel string, dur time.Duration) {
	c.cooldowns.Record(providerOf(failedModel), dur)
}
