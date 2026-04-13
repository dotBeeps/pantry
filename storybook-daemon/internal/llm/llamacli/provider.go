// Package llamacli implements llm.Provider by spawning llama-cli as a subprocess.
// Each Run call launches a fresh process in single-turn mode — no persistent process.
package llamacli

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/llm"
)

// Config holds configuration for the llama-cli subprocess provider.
type Config struct {
	// BinaryPath is the absolute path to the llama-cli binary.
	BinaryPath string
	// ModelPath is the absolute path to the GGUF model file.
	ModelPath string
	// GPULayers is the number of model layers to offload to GPU (-ngl).
	// Set to a large number (e.g. 999) to offload all layers.
	GPULayers int
	// Threads is the number of CPU threads used during generation.
	Threads int
	// ContextSize is the context window size in tokens (0 = use model default).
	ContextSize int
	// MaxTokens is the maximum number of tokens to generate.
	MaxTokens int
	// Temperature controls generation randomness (0.0–2.0).
	Temperature float64
}

// Provider spawns llama-cli in single-turn, non-interactive mode.
// Tool calls are not dispatched by this provider (v1). The model's output is
// parsed for DeepSeek R1-style <think>...</think> blocks: think content is
// discarded (or streamed separately) and the reply after </think> is passed
// to onText.
type Provider struct {
	cfg Config
	log *slog.Logger
}

// New creates a Provider with the given configuration.
func New(cfg Config, log *slog.Logger) *Provider {
	return &Provider{cfg: cfg, log: log}
}

// Run spawns llama-cli, waits for completion, and passes parsed reply to onText.
// tools and dispatch are accepted for interface compatibility but ignored in v1.
func (p *Provider) Run(
	ctx context.Context,
	system string,
	userContext string,
	_ []llm.Tool,
	onText func(string),
	_ func(llm.ToolCall) (string, bool),
) error {
	args := p.buildArgs(system, userContext)

	p.log.Debug("spawning llama-cli",
		"binary", p.cfg.BinaryPath,
		"model", p.cfg.ModelPath,
		"gpu_layers", p.cfg.GPULayers,
		"max_tokens", p.cfg.MaxTokens,
	)

	cmd := exec.CommandContext(ctx, p.cfg.BinaryPath, args...)

	// Pin to the discrete GPU (device 0 = 7900 XTX). Without this, ROCm detects
	// the iGPU (gfx1036 APU) alongside the dGPU and llama-cli segfaults.
	// Filter existing vars to avoid duplicates, then set at both HIP and ROCr layers.
	env := make([]string, 0, len(os.Environ())+2)
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "HIP_VISIBLE_DEVICES=") &&
			!strings.HasPrefix(e, "ROCR_VISIBLE_DEVICES=") {
			env = append(env, e)
		}
	}
	env = append(env, "HIP_VISIBLE_DEVICES=0", "ROCR_VISIBLE_DEVICES=0")
	cmd.Env = env

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("creating stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("creating stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting llama-cli: %w", err)
	}

	// Drain stderr in background — GGML/ROCm init messages are noisy.
	go p.drainStderr(stderr)

	// Read full stdout output.
	raw, err := io.ReadAll(stdout)
	if err != nil {
		return fmt.Errorf("reading llama-cli stdout: %w", err)
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("llama-cli exited with error: %w", err)
	}

	output := string(raw)
	p.log.Debug("llama-cli inference complete", "output_bytes", len(raw))

	// Parse DeepSeek R1 output: <think>...</think> inner monologue + reply.
	_, reply := SplitThinkBlock(output)
	reply = strings.TrimSpace(reply)

	if onText != nil && reply != "" {
		onText(reply)
	}
	return nil
}

// buildArgs constructs the llama-cli argument list.
func (p *Provider) buildArgs(system, userContext string) []string {
	args := []string{
		"-m", p.cfg.ModelPath,
		"--simple-io",
		"--no-display-prompt",
		"--log-colors", "off",
		"--single-turn",
		"--jinja",
	}

	if system != "" {
		args = append(args, "-sys", system)
	}
	if userContext != "" {
		args = append(args, "-p", userContext)
	}
	if p.cfg.GPULayers > 0 {
		args = append(args, "-ngl", strconv.Itoa(p.cfg.GPULayers))
	}
	if p.cfg.Threads > 0 {
		args = append(args, "-t", strconv.Itoa(p.cfg.Threads))
	}
	if p.cfg.ContextSize > 0 {
		args = append(args, "-c", strconv.Itoa(p.cfg.ContextSize))
	}
	if p.cfg.MaxTokens > 0 {
		args = append(args, "-n", strconv.Itoa(p.cfg.MaxTokens))
	}
	if p.cfg.Temperature > 0 {
		args = append(args, "--temp", strconv.FormatFloat(p.cfg.Temperature, 'f', 2, 64))
	}

	return args
}

// drainStderr reads and logs stderr lines at debug level.
func (p *Provider) drainStderr(r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if line != "" {
			p.log.Debug("llama-cli stderr", "line", line)
		}
	}
}

// SplitThinkBlock splits DeepSeek R1 output into the inner monologue and reply.
// DeepSeek R1 emits: <think>monologue</think>actual reply
// If no think block is present, the full output is returned as the reply.
func SplitThinkBlock(output string) (think, reply string) {
	const openTag = "<think>"
	const closeTag = "</think>"

	start := strings.Index(output, openTag)
	if start == -1 {
		return "", output
	}
	end := strings.Index(output, closeTag)
	if end == -1 {
		// Unclosed block — treat everything after <think> as inner monologue.
		return strings.TrimSpace(output[start+len(openTag):]), ""
	}
	think = strings.TrimSpace(output[start+len(openTag) : end])
	reply = strings.TrimSpace(output[end+len(closeTag):])
	return think, reply
}
