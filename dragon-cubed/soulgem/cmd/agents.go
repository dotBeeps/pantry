package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"
)

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "Manage dispatched pi agents",
}

var agentsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all agents",
	RunE: func(cmd *cobra.Command, args []string) error {
		return agentsAPIGet("/api/agents", func(body []byte) error {
			var snaps []map[string]interface{}
			if err := json.Unmarshal(body, &snaps); err != nil {
				return fmt.Errorf("parsing response: %w", err)
			}
			if len(snaps) == 0 {
				fmt.Println("No agents.")
				return nil
			}
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tSTATUS\tSTARTED\tGOAL")
			for _, s := range snaps {
				id      := strField(s, "id")
				status  := strField(s, "status")
				started := fmtTime(strField(s, "startedAt"))
				goal    := truncate(strField(s, "goal"), 60)
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", id, status, started, goal)
			}
			return w.Flush()
		})
	},
}

var agentsStartCmd = &cobra.Command{
	Use:   "start <goal>",
	Short: "Dispatch a new pi agent with a goal",
	Args:  cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		goal := strings.Join(args, " ")
		body, err := json.Marshal(map[string]string{"goal": goal})
		if err != nil {
			return fmt.Errorf("encoding request: %w", err)
		}
		resp, err := http.Post(apiURL("/api/agents"), "application/json",
			strings.NewReader(string(body)))
		if err != nil {
			return fmt.Errorf("contacting SoulGem API: %w", err)
		}
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusCreated {
			return fmt.Errorf("dispatch failed (%d): %s", resp.StatusCode, string(respBody))
		}
		var snap map[string]interface{}
		if err := json.Unmarshal(respBody, &snap); err != nil {
			return fmt.Errorf("parsing response: %w", err)
		}
		fmt.Printf("Agent dispatched\n  id:  %s\n  pid: %v\n  goal: %s\n",
			strField(snap, "id"), snap["pid"], strField(snap, "goal"))
		return nil
	},
}

var agentsKillCmd = &cobra.Command{
	Use:   "kill <id>",
	Short: "Kill a running agent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		req, _ := http.NewRequest(http.MethodDelete, apiURL("/api/agents/"+args[0]), nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return fmt.Errorf("contacting SoulGem API: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusNoContent {
			fmt.Printf("Agent %s killed.\n", args[0])
			return nil
		}
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("kill failed (%d): %s", resp.StatusCode, string(body))
	},
}

var agentsLogsCmd = &cobra.Command{
	Use:   "logs <id>",
	Short: "Print the log buffer for an agent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return agentsAPIGet("/api/agents/"+args[0]+"/logs", func(body []byte) error {
			var resp struct {
				Logs []string `json:"logs"`
			}
			if err := json.Unmarshal(body, &resp); err != nil {
				return fmt.Errorf("parsing response: %w", err)
			}
			for _, line := range resp.Logs {
				fmt.Println(line)
			}
			return nil
		})
	},
}

// flagAPIAddr is the SoulGem API address used by agent subcommands.
var flagAPIAddr string

func init() {
	agentsCmd.PersistentFlags().StringVar(&flagAPIAddr, "api", "http://localhost:8766",
		"SoulGem API address")
	agentsCmd.AddCommand(agentsListCmd, agentsStartCmd, agentsKillCmd, agentsLogsCmd)
	rootCmd.AddCommand(agentsCmd)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func apiURL(path string) string {
	return strings.TrimRight(flagAPIAddr, "/") + path
}

func agentsAPIGet(path string, handle func([]byte) error) error {
	resp, err := http.Get(apiURL(path))
	if err != nil {
		return fmt.Errorf("contacting SoulGem API at %s: %w", apiURL(path), err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}
	return handle(body)
}

func strField(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func fmtTime(s string) string {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return s
	}
	return t.Format("15:04:05")
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
