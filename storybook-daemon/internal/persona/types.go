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

// LLMConfig configures the LLM provider for this persona.
// If Provider is empty, "anthropic" is used as the default.
type LLMConfig struct {
	// Provider selects the backend: "anthropic" or "llamacli".
	Provider string `yaml:"provider"`
	// Model is the model identifier for the anthropic provider (e.g. "claude-haiku-4-5").
	// Ignored by llamacli.
	Model string `yaml:"model"`
	// MaxTokens is the maximum number of tokens to generate (default: 1024 for anthropic, 2048 for llamacli).
	MaxTokens int `yaml:"max_tokens"`

	// Fields below are llamacli-specific.

	// BinaryPath is the path to the llama-cli binary (default: ~/AI/llama.cpp/build-rocm/bin/llama-cli).
	BinaryPath string `yaml:"binary_path"`
	// ModelPath is the path to the GGUF model file.
	ModelPath string `yaml:"model_path"`
	// GPULayers is the number of layers to offload to GPU (default: 999 = all).
	GPULayers int `yaml:"gpu_layers"`
	// Threads is the number of CPU threads for generation (default: 0 = llama.cpp default).
	Threads int `yaml:"threads"`
	// ContextSize is the context window in tokens (default: 0 = model default).
	ContextSize int `yaml:"context_size"`
	// Temperature controls randomness (default: 0.7).
	Temperature float64 `yaml:"temperature"`
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
	Type    string `yaml:"type"` // doggy | mcp
	Enabled bool   `yaml:"enabled"`
}

// Contract is a simple rule applied after each thought cycle.
type Contract struct {
	ID      string `yaml:"id"`
	Rule    string `yaml:"rule"`
	Enabled bool   `yaml:"enabled"`
}
