// Package persona defines the data model for a storybook-daemon persona configuration.
package persona

// Persona is the top-level persona YAML structure.
type Persona struct {
	Persona   Config          `yaml:"persona"`
	Attention AttentionConfig `yaml:"attention"`
	Costs     CostConfig      `yaml:"costs"`
	Bodies    []BodyConfig    `yaml:"bodies"`
	Contracts []Contract      `yaml:"contracts"`
}

// Config holds character identity settings.
type Config struct {
	Name         string `yaml:"name"`
	Flavor       string `yaml:"flavor"`
	Voice        string `yaml:"voice"`         // second-person | first-person
	MemoryScope  string `yaml:"memory_scope"`  // session | rolling | archive
	SystemPrompt string `yaml:"system_prompt"` // optional override; otherwise generated from name/flavor
}

// AttentionConfig holds attention economy parameters.
type AttentionConfig struct {
	Pool            int     `yaml:"pool"`             // starting attention units
	Rate            int     `yaml:"rate"`             // regeneration per hour
	Floor           int     `yaml:"floor"`            // never dispatch below this
	ThoughtInterval string  `yaml:"thought_interval"` // duration string e.g. "15m"
	Variance        float64 `yaml:"variance"`         // jitter factor e.g. 0.2 = ±20%
}

// CostConfig maps action names to their attention costs.
type CostConfig struct {
	Think    int `yaml:"think"`    // baseline thought
	Speak    int `yaml:"speak"`    // external voice output
	Remember int `yaml:"remember"` // explicit memory write
	Search   int `yaml:"search"`   // memory retrieval
	Perceive int `yaml:"perceive"` // voluntary attention to sense stream
}

// BodyConfig describes a connected body (external system) the persona inhabits.
type BodyConfig struct {
	ID      string  `yaml:"id"`
	Path    string  `yaml:"path"`
	Type    string  `yaml:"type"`   // hoard | minecraft | app | api
	Weight  float64 `yaml:"weight"` // fraction of attention budget claimed
	Enabled bool    `yaml:"enabled"`
}

// Contract is a simple rule applied after each thought cycle.
type Contract struct {
	ID      string `yaml:"id"`
	Rule    string `yaml:"rule"`
	Enabled bool   `yaml:"enabled"`
}
