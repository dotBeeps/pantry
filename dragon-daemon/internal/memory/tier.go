package memory

// ConsentTier classifies a note by risk level for implicit learning operations.
// Maps to the consent tier system in ETHICS.md §3.1.
type ConsentTier string

const (
	// TierUnset means no consent tier is assigned.
	TierUnset ConsentTier = ""
	// TierLow covers low-risk signals (code style, conventions). Collected silently.
	TierLow ConsentTier = "low"
	// TierMedium covers medium-risk signals (communication preferences). Requires explicit consent.
	TierMedium ConsentTier = "medium"
	// TierHigh covers high-risk signals (work/emotional patterns). Default OFF, gate-enforced.
	TierHigh ConsentTier = "high"
)

// Tag returns the vault tag for this tier, e.g. "consent/low".
// Returns empty string for TierUnset.
func (t ConsentTier) Tag() string {
	if t == TierUnset {
		return ""
	}
	return "consent/" + string(t)
}
