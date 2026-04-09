package cmd

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/spf13/cobra"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/daemon"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
)

var (
	flagPersona string
	flagVerbose bool
)

var runCmd = &cobra.Command{
	Use:   "run",
	Short: "Run the daemon for a named persona",
	Long: `Starts the daemon for the named persona.

The persona config is loaded from ~/.config/storybook-daemon/personas/<name>.yaml.
Credentials are loaded from pi's OAuth store (~/.pi/agent/auth.json).
Run 'pi login' first if you haven't already.`,
	Example: `  storybook-daemon run --persona ember
  storybook-daemon run --persona ember --verbose`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if flagPersona == "" {
			return errors.New("--persona is required")
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
