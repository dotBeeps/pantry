package cmd

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/storybook"
)

var (
	flagRunAllPersonas string
	flagRunAllAll      bool
)

var runAllCmd = &cobra.Command{
	Use:   "run-all",
	Short: "Run daemons for multiple personas concurrently",
	Long: `Starts daemons for multiple personas in parallel.

Specify personas by name with --personas, or use --all to discover
every YAML in ~/.config/storybook-daemon/personas/.`,
	Example: `  storybook-daemon run-all --personas ember,maren
  storybook-daemon run-all --all
  storybook-daemon run-all --all --verbose`,
	RunE: func(cmd *cobra.Command, args []string) error {
		names, err := resolvePersonaNames()
		if err != nil {
			return err
		}

		level := slog.LevelInfo
		if flagVerbose {
			level = slog.LevelDebug
		}
		log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

		sb := storybook.New(names, log)
		return sb.Run(context.Background())
	},
}

func resolvePersonaNames() ([]string, error) {
	if flagRunAllAll && flagRunAllPersonas != "" {
		return nil, errors.New("--all and --personas are mutually exclusive")
	}
	if !flagRunAllAll && flagRunAllPersonas == "" {
		return nil, errors.New("one of --all or --personas is required")
	}

	if flagRunAllAll {
		names, err := storybook.DiscoverPersonas()
		if err != nil {
			return nil, fmt.Errorf("discovering personas: %w", err)
		}
		return names, nil
	}

	names := strings.Split(flagRunAllPersonas, ",")
	for i, n := range names {
		names[i] = strings.TrimSpace(n)
	}
	return names, nil
}

func init() {
	rootCmd.AddCommand(runAllCmd)
	runAllCmd.Flags().StringVar(&flagRunAllPersonas, "personas", "", "Comma-separated persona names (e.g. ember,maren)")
	runAllCmd.Flags().BoolVar(&flagRunAllAll, "all", false, "Discover and run all personas in the config directory")
	runAllCmd.Flags().BoolVarP(&flagVerbose, "verbose", "v", false, "Enable debug logging")
}
