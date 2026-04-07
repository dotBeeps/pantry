// Package soul implements the dragon-soul — ethical contract enforcement.
// It parses persona contracts and evaluates them at runtime, gating
// thought cycles when rules are violated and auditing them after.
//
// Enforcement has two phases:
//   - Gates run pre-beat to block thought cycles (e.g. minimum-rest)
//   - Audits run post-beat to verify integrity (e.g. attention-honesty)
package soul

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrDeclarative indicates a contract rule that is acknowledged but not
// mechanically enforceable (e.g. "never fabricate attention metrics").
var ErrDeclarative = errors.New("declarative rule: not mechanically enforceable")

// Gate is a pre-beat rule that can block a thought cycle.
type Gate interface {
	ID() string
	Check(now time.Time) *Violation
}

// Audit is a post-beat rule that verifies integrity after a thought cycle.
type Audit interface {
	ID() string
	Verify() *Violation
}

// Violation describes a contract that is currently violated.
type Violation struct {
	RuleID  string
	Message string
	Until   time.Time // when the violation expires (zero if unknown)
}

// ParseGate parses a contract rule string into a pre-beat gate.
// Returns ErrDeclarative for rules that aren't mechanically enforceable.
func ParseGate(id, rule string) (Gate, error) {
	if strings.HasPrefix(rule, "minimum-rest:") {
		return parseMinimumRest(id, rule)
	}
	return nil, ErrDeclarative
}

// --- minimum-rest gate ---

// minimumRest enforces a quiet period where no thought cycles run.
type minimumRest struct {
	id    string
	start clockTime // e.g. 23:00
	end   clockTime // e.g. 06:00
}

// clockTime is a wall-clock hour:minute without date.
type clockTime struct {
	hour, min int
}

func (ct clockTime) String() string {
	return fmt.Sprintf("%02d:%02d", ct.hour, ct.min)
}

// asToday returns the clockTime as a time.Time on the same date as ref.
func (ct clockTime) asToday(ref time.Time) time.Time {
	return time.Date(ref.Year(), ref.Month(), ref.Day(), ct.hour, ct.min, 0, 0, ref.Location())
}

// ID returns the contract identifier.
func (r *minimumRest) ID() string { return r.id }

// Check evaluates whether the current time falls within the rest window.
func (r *minimumRest) Check(now time.Time) *Violation {
	if !r.inWindow(now) {
		return nil
	}

	end := r.end.asToday(now)
	if r.crossesMidnight() && now.Hour() >= r.start.hour {
		end = end.AddDate(0, 0, 1)
	}

	return &Violation{
		RuleID:  r.id,
		Message: fmt.Sprintf("dragon-soul: rest period active (%s–%s)", r.start, r.end),
		Until:   end,
	}
}

func (r *minimumRest) inWindow(now time.Time) bool {
	nowMins := now.Hour()*60 + now.Minute()
	startMins := r.start.hour*60 + r.start.min
	endMins := r.end.hour*60 + r.end.min

	if r.crossesMidnight() {
		return nowMins >= startMins || nowMins < endMins
	}
	return nowMins >= startMins && nowMins < endMins
}

func (r *minimumRest) crossesMidnight() bool {
	return r.start.hour*60+r.start.min > r.end.hour*60+r.end.min
}

func parseMinimumRest(id, rule string) (*minimumRest, error) {
	parts := strings.SplitN(rule, ":", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid minimum-rest rule: %q", rule)
	}

	timeRange := strings.TrimSpace(parts[1])
	times := strings.SplitN(timeRange, "-", 2)
	if len(times) != 2 {
		return nil, fmt.Errorf("invalid time range in minimum-rest rule: %q", timeRange)
	}

	start, err := parseClockTime(strings.TrimSpace(times[0]))
	if err != nil {
		return nil, fmt.Errorf("invalid start time: %w", err)
	}
	end, err := parseClockTime(strings.TrimSpace(times[1]))
	if err != nil {
		return nil, fmt.Errorf("invalid end time: %w", err)
	}

	return &minimumRest{id: id, start: start, end: end}, nil
}

func parseClockTime(s string) (clockTime, error) {
	var h, m int
	n, err := fmt.Sscanf(s, "%d:%d", &h, &m)
	if err != nil || n != 2 || h < 0 || h > 23 || m < 0 || m > 59 {
		return clockTime{}, fmt.Errorf("invalid clock time %q (expected HH:MM)", s)
	}
	return clockTime{hour: h, min: m}, nil
}
