package memory

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConsentTier_Tag(t *testing.T) {
	cases := []struct {
		tier    ConsentTier
		wantTag string
	}{
		{TierUnset, ""},
		{TierLow, "consent/low"},
		{TierMedium, "consent/medium"},
		{TierHigh, "consent/high"},
	}
	for _, tc := range cases {
		t.Run(string(tc.tier), func(t *testing.T) {
			assert.Equal(t, tc.wantTag, tc.tier.Tag())
		})
	}
}

func TestConsentTier_StringValues(t *testing.T) {
	assert.Equal(t, ConsentTier(""), TierUnset)
	assert.Equal(t, ConsentTier("low"), TierLow)
	assert.Equal(t, ConsentTier("medium"), TierMedium)
	assert.Equal(t, ConsentTier("high"), TierHigh)
}
