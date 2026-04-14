package persona

import (
	"errors"
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Load reads and validates a persona YAML file at the given path.
func Load(path string) (*Persona, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading persona file: %w", err)
	}

	var p Persona
	if err := yaml.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("parsing persona YAML: %w", err)
	}

	if err := validate(&p); err != nil {
		return nil, fmt.Errorf("invalid persona: %w", err)
	}

	return &p, nil
}

// LoadFromDir loads the named persona from the standard config directory.
// It looks for <name>.yaml in ~/.config/storybook-daemon/personas/.
func LoadFromDir(name string) (*Persona, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolving home dir: %w", err)
	}
	path := fmt.Sprintf("%s/.config/storybook-daemon/personas/%s.yaml", home, name)
	return Load(path)
}

// ThoughtInterval parses the attention.thought_interval duration.
func (p *Persona) ThoughtInterval() (time.Duration, error) {
	d, err := time.ParseDuration(p.Attention.ThoughtInterval)
	if err != nil {
		return 0, fmt.Errorf("parsing thought_interval %q: %w", p.Attention.ThoughtInterval, err)
	}
	return d, nil
}

// validate checks required fields and sane defaults.
func validate(p *Persona) error {
	if p.Persona.Name == "" {
		return errors.New("persona.name is required")
	}
	if p.Attention.Pool <= 0 {
		return errors.New("attention.pool must be > 0")
	}
	if p.Attention.Rate < 0 {
		return errors.New("attention.rate must be >= 0")
	}
	if p.Attention.ThoughtInterval == "" {
		return errors.New("attention.thought_interval is required")
	}
	if _, err := time.ParseDuration(p.Attention.ThoughtInterval); err != nil {
		return fmt.Errorf("attention.thought_interval must be a valid duration: %w", err)
	}
	if p.Attention.Variance < 0 || p.Attention.Variance >= 1 {
		return errors.New("attention.variance must be in [0, 1)")
	}
	applyDefaults(p)
	return nil
}

// applyDefaults fills in zero-value fields with sensible defaults.
func applyDefaults(p *Persona) {
	if p.Costs.Beat == 0 {
		p.Costs.Beat = 15
	}
	if p.Attention.Floor == 0 {
		p.Attention.Floor = 50
	}
	if p.LLM.Model == "" {
		p.LLM.Model = "claude-sonnet-4-6"
	}
	if p.LLM.Thinking == "" {
		p.LLM.Thinking = "medium"
	}
}
