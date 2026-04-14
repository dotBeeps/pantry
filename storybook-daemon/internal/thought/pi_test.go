package thought

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestShouldBlockEnv(t *testing.T) {
	tests := []struct {
		key     string
		blocked bool
	}{
		{"HOME", false},
		{"PATH", false},
		{"ANTHROPIC_API_KEY", true},
		{"MY_SECRET", true},
		{"MY_TOKEN", true},
		{"MY_PASSWORD", true},
		{"MY_CREDENTIAL", true},
		{"AWS_ACCESS_KEY_ID", true},
		{"GITHUB_TOKEN", true},
		{"OPENAI_API_KEY", true},
		{"AZURE_SUBSCRIPTION_ID", true},
		{"GCP_PROJECT", true},
		{"HOARD_STONE_PORT", false},
		{"TERM", false},
	}
	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			assert.Equal(t, tt.blocked, shouldBlockEnv(tt.key))
		})
	}
}

func TestBuildPiEnv(t *testing.T) {
	env := buildPiEnv(9432)

	found := false
	for _, kv := range env {
		if kv == "HOARD_STONE_PORT=9432" {
			found = true
		}
	}
	assert.True(t, found, "HOARD_STONE_PORT=9432 should be in env")
}
