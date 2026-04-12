package quest_test

import (
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/quest"
)

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name      string
		stderr    string
		exitCode  int
		retryable bool
		cooldown  time.Duration
	}{
		{"rate limit 429", "error 429 rate limit exceeded", 1, true, 30 * time.Second},
		{"rate limit text", "rate limit reached for model", 1, true, 30 * time.Second},
		{"server error 500", "internal server error 500", 1, true, 10 * time.Second},
		{"server error 502", "502 bad gateway", 1, true, 10 * time.Second},
		{"server error 503", "503 service unavailable", 1, true, 10 * time.Second},
		{"server error 504", "gateway timeout 504", 1, true, 10 * time.Second},
		{"auth error", "unauthorized 401", 1, false, 0},
		{"not found", "404 model not found", 1, false, 0},
		{"clean exit", "", 0, false, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			retryable, cooldown := quest.IsRetryable(tt.stderr, tt.exitCode)
			if retryable != tt.retryable {
				t.Errorf("retryable = %v, want %v", retryable, tt.retryable)
			}
			if tt.retryable && cooldown != tt.cooldown {
				t.Errorf("cooldown = %v, want %v", cooldown, tt.cooldown)
			}
		})
	}
}

func TestCooldownTracker_FreshProviderNotCooled(t *testing.T) {
	tracker := quest.NewCooldownTracker()
	if tracker.IsCooledDown("anthropic") {
		t.Error("fresh provider should not be cooled down")
	}
}

func TestCooldownTracker_RecordedProviderIsCooled(t *testing.T) {
	tracker := quest.NewCooldownTracker()
	tracker.Record("anthropic", 100*time.Millisecond)
	if !tracker.IsCooledDown("anthropic") {
		t.Error("provider should be cooled down after Record")
	}
}

func TestCooldownTracker_CooldownExpires(t *testing.T) {
	tracker := quest.NewCooldownTracker()
	tracker.Record("anthropic", 50*time.Millisecond)
	time.Sleep(100 * time.Millisecond)
	if tracker.IsCooledDown("anthropic") {
		t.Error("cooldown should have expired")
	}
}

func TestCascader_NextModel_SkipsFirst(t *testing.T) {
	c := quest.NewCascader()
	// kobold cascade: zai → github-copilot → anthropic → google
	next, ok := c.NextModel("kobold", "zai/glm-4.5-air")
	if !ok {
		t.Fatal("expected a next model")
	}
	if next == "zai/glm-4.5-air" {
		t.Error("next model should not be the same as failed model")
	}
}

func TestCascader_NextModel_SkipsCooled(t *testing.T) {
	c := quest.NewCascader()
	// Cool down the second model's provider
	c.RecordFailure("github-copilot/claude-haiku-4.5", 10*time.Second)
	// After failing zai, next should skip github-copilot (cooled) and go to anthropic
	next, ok := c.NextModel("kobold", "zai/glm-4.5-air")
	if !ok {
		t.Fatal("expected a next model")
	}
	if next == "github-copilot/claude-haiku-4.5" {
		t.Error("should skip cooled provider; got github-copilot model")
	}
}

func TestCascader_NextModel_Exhausted(t *testing.T) {
	c := quest.NewCascader()
	// dragon only has 2 models; after the last one there's nothing left
	_, ok := c.NextModel("dragon", "anthropic/claude-opus-4-6")
	if ok {
		t.Error("should be exhausted after last model in chain")
	}
}

func TestCascader_RecordFailure_SetsCooldown(t *testing.T) {
	c := quest.NewCascader()
	c.RecordFailure("zai/glm-4.5-air", 50*time.Millisecond)
	// Next after failing zai should skip zai provider (cooled)
	next, ok := c.NextModel("kobold", "zai/glm-4.5-air")
	if !ok {
		t.Fatal("expected a next model after failure")
	}
	// next model should not be from the zai provider
	if next == "zai/glm-4.5-air" {
		t.Error("should not return the failed model")
	}
}
