package soul

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseMinimumRest(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		rule    string
		wantErr bool
	}{
		{
			name:    "valid same-day",
			id:      "curfew",
			rule:    "minimum-rest: 09:00-17:00",
			wantErr: false,
		},
		{
			name:    "valid cross-midnight",
			id:      "curfew",
			rule:    "minimum-rest: 23:00-06:00",
			wantErr: false,
		},
		{
			name:    "hour too large",
			id:      "curfew",
			rule:    "minimum-rest: 25:00-17:00",
			wantErr: true,
		},
		{
			name:    "minute too large",
			id:      "curfew",
			rule:    "minimum-rest: 09:60-17:00",
			wantErr: true,
		},
		{
			name:    "missing time separator",
			id:      "curfew",
			rule:    "minimum-rest: 0900-1700",
			wantErr: true,
		},
		{
			name:    "missing range",
			id:      "curfew",
			rule:    "minimum-rest: 09:00",
			wantErr: true,
		},
		{
			name:    "wrong prefix",
			id:      "curfew",
			rule:    "sleep: 09:00-17:00",
			wantErr: true,
		},
		{
			name:    "empty rule",
			id:      "curfew",
			rule:    "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseGate(tt.id, tt.rule)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestMinimumRestCheck_SameDay(t *testing.T) {
	gate, err := ParseGate("curfew", "minimum-rest: 09:00-17:00")
	require.NoError(t, err)

	endTime := time.Date(2025, 1, 15, 17, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		hour, min     int
		wantViolation bool
	}{
		{"before start", 8, 59, false},
		{"at start", 9, 0, true},
		{"mid window", 12, 0, true},
		{"just before end", 16, 59, true},
		{"at end", 17, 0, false},
		{"after end", 17, 1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Date(2025, 1, 15, tt.hour, tt.min, 0, 0, time.UTC)
			v := gate.Check(now)
			if tt.wantViolation {
				assert.NotNil(t, v)
				assert.Equal(t, "curfew", v.RuleID)
				assert.Equal(t, endTime, v.Until)
			} else {
				assert.Nil(t, v)
			}
		})
	}
}

func TestMinimumRestCheck_CrossMidnight(t *testing.T) {
	gate, err := ParseGate("curfew", "minimum-rest: 23:00-06:00")
	require.NoError(t, err)

	jan15 := func(h, m int) time.Time {
		return time.Date(2025, 1, 15, h, m, 0, 0, time.UTC)
	}
	jan16 := func(h, m int) time.Time {
		return time.Date(2025, 1, 16, h, m, 0, 0, time.UTC)
	}

	tests := []struct {
		name          string
		now           time.Time
		wantViolation bool
		wantUntil     time.Time
	}{
		{
			name:          "before start",
			now:           jan15(22, 59),
			wantViolation: false,
		},
		{
			name:          "at start pre-midnight",
			now:           jan15(23, 0),
			wantViolation: true,
			wantUntil:     jan16(6, 0),
		},
		{
			name:          "mid pre-midnight",
			now:           jan15(23, 30),
			wantViolation: true,
			wantUntil:     jan16(6, 0),
		},
		{
			name:          "at midnight",
			now:           jan16(0, 0),
			wantViolation: true,
			wantUntil:     jan16(6, 0),
		},
		{
			name:          "post midnight",
			now:           jan16(2, 30),
			wantViolation: true,
			wantUntil:     jan16(6, 0),
		},
		{
			name:          "just before end",
			now:           jan16(5, 59),
			wantViolation: true,
			wantUntil:     jan16(6, 0),
		},
		{
			name:          "at end",
			now:           jan16(6, 0),
			wantViolation: false,
		},
		{
			name:          "after end",
			now:           jan16(6, 1),
			wantViolation: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := gate.Check(tt.now)
			if tt.wantViolation {
				assert.NotNil(t, v)
				assert.Equal(t, "curfew", v.RuleID)
				assert.Equal(t, tt.wantUntil, v.Until)
			} else {
				assert.Nil(t, v)
			}
		})
	}
}

func TestMinimumRestViolationMessage(t *testing.T) {
	gate, err := ParseGate("curfew", "minimum-rest: 09:00-17:00")
	require.NoError(t, err)

	// Pick a time that is inside the window (mid window).
	now := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	v := gate.Check(now)

	require.NotNil(t, v, "expected a violation during the rest window")
	assert.NotEmpty(t, v.Message)
}
