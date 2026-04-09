// Package cmd implements the storybook-daemon CLI using cobra.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "storybook-daemon",
	Short: "A persistent background daemon for multi-persona agent simulation",
	Long: `storybook-daemon runs one or more persona's inner lives as a background process.
It maintains attention economies, fires periodic thought cycles, and
connects to external bodies (git repos, games, apps, MCP servers) to observe and act.`,
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
