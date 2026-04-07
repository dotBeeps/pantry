package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "soulgem",
	Short: "D3-SoulGem — Dragon Cubed agent orchestrator",
	Long: `SoulGem connects to D3-Leylines over WebSocket, synthesizes pi tool
definitions from the capability handshake, and exposes an HTTP API that
the pi extension uses to dispatch LLM tool calls to Minecraft.`,
}

// Execute runs the root command. Called from main.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
