// Package cmd implements the dragon-daemon CLI using cobra.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "dragon-daemon",
	Short: "A persistent background daemon for dragon persona simulation",
	Long: `dragon-daemon runs a persona's inner life as a background process.
It maintains an attention economy, fires periodic thought cycles, and
connects to external bodies (git repos, games, apps) to observe and act.`,
}

// Execute runs the root command.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
