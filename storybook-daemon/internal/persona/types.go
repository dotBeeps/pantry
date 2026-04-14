// Package persona defines the data model for a storybook-daemon persona configuration.
package persona

// Persona is the top-level persona YAML structure.
type Persona struct {
	Persona    Config            `yaml:"persona"`
	LLM        LLMConfig         `yaml:"llm"`
	Attention  AttentionConfig   `yaml:"attention"`
	Costs      CostConfig        `yaml:"costs"`
	Nerves     []NerveConfig     `yaml:"nerves"`
	Interfaces []InterfaceConfig `yaml:"interfaces"`
	Contracts  []Contract        `yaml:"contracts"`
}

// LLMConfig configures the pi session for this persona.
type LLMConfig struct {
	// Model is the pi model identifier (e.g. "claude-sonnet-4-6").
	Model string `yaml:"model"`
	// Thinking sets the pi thinking level: off, low, medium, high.
	Thinking string `yaml:"thinking"`
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
	Pool               int     `yaml:"pool"`                // starting attention units
	Rate               int     `yaml:"rate"`                // regeneration per hour
	Floor              int     `yaml:"floor"`               // never dispatch below this
	ThoughtInterval    string  `yaml:"thought_interval"`    // duration string e.g. "15m"
	Variance           float64 `yaml:"variance"`            // jitter factor e.g. 0.2 = ±20%
	ConversationBudget int     `yaml:"conversation_budget"` // token budget for conversation ledger (default 2000)
}

// CostConfig maps action names to their attention costs.
type CostConfig struct {
	Beat int `yaml:"beat"` // flat cost per thought cycle
}

// NerveConfig describes a connected nerve (sensory connector) the persona senses through.
type NerveConfig struct {
	ID      string  `yaml:"id"`
	Path    string  `yaml:"path"`
	Type    string  `yaml:"type"`   // hoard | minecraft | app | api
	Weight  float64 `yaml:"weight"` // fraction of attention budget claimed
	Enabled bool    `yaml:"enabled"`
}

// InterfaceConfig describes a psi interface the persona exposes to the world.
// Unlike bodies, interfaces are communication surfaces (dot's chat, MCP tools)
// rather than external systems the daemon senses from.
type InterfaceConfig struct {
	ID      string `yaml:"id"`
	Path    string `yaml:"path"`
	Type    string `yaml:"type"` // sse | mcp
	Enabled bool   `yaml:"enabled"`
}

// Contract is a simple rule applied after each thought cycle.
type Contract struct {
	ID      string `yaml:"id"`
	Rule    string `yaml:"rule"`
	Enabled bool   `yaml:"enabled"`
}
