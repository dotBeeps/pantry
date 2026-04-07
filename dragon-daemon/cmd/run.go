package cmd

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/spf13/cobra"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/daemon"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/persona"
)

var (
	flagPersona string
	flagVerbose bool
)

var runCmd = &cobra.Command{
	Use:   "run",
	Short: "Run the daemon for a named persona",
	Long: `Starts the daemon for the named persona.

The persona config is loaded from ~/.config/dragon-daemon/personas/<name>.yaml.
Set ANTHROPIC_API_KEY in the environment before running.`,
	Example: `  dragon-daemon run --persona ember
  dragon-daemon run --persona ember --verbose`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if flagPersona == "" {
			return fmt.Errorf("--persona is required")
		}

		// Check for API key early.
		if os.Getenv("ANTHROPIC_API_KEY") == "" {
			return fmt.Errorf("ANTHROPIC_API_KEY environment variable is not set")
		}

		// Set up logger.
		level := slog.LevelInfo
		if flagVerbose {
			level = slog.LevelDebug
		}
		log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

		// Load persona.
		p, err := persona.LoadFromDir(flagPersona)
		if err != nil {
			return fmt.Errorf("loading persona %q: %w", flagPersona, err)
		}

		log.Info("persona loaded",
			"name", p.Persona.Name,
			"flavor", p.Persona.Flavor,
			"interval", p.Attention.ThoughtInterval,
			"bodies", len(p.Bodies),
		)

		// Run daemon.
		d := daemon.New(p, log)
		return d.Run(context.Background())
	},
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().StringVarP(&flagPersona, "persona", "p", "", "Name of the persona to run (required)")
	runCmd.Flags().BoolVarP(&flagVerbose, "verbose", "v", false, "Enable debug logging")
}
