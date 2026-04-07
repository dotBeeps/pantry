package cmd

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"

	"dev.dragoncubed/soulgem/internal/agent"
	"dev.dragoncubed/soulgem/internal/api"
	"dev.dragoncubed/soulgem/internal/leylines"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Connect to Leylines and start the SoulGem API server",
	Long: `Connects to D3-Leylines over WebSocket and starts the HTTP API server
that the pi extension uses to get tool definitions and dispatch commands.

Example:
  soulgem serve
  soulgem serve --leylines ws://localhost:8765/leylines --api :8766`,
	RunE: runServe,
}

var (
	flagLeylines  string
	flagAPI       string
	flagPiBinary  string
	flagExtension string
)

func init() {
	serveCmd.Flags().StringVar(&flagLeylines, "leylines", "ws://localhost:8765/leylines",
		"D3-Leylines WebSocket URL")
	serveCmd.Flags().StringVar(&flagAPI, "api", ":8766",
		"SoulGem API server listen address")
	serveCmd.Flags().StringVar(&flagPiBinary, "pi", "pi",
		"Path to the pi binary for agent dispatch")
	serveCmd.Flags().StringVar(&flagExtension, "extension", "",
		"Path to soulgem.js to pass to pi (default: use globally installed extension)")
	rootCmd.AddCommand(serveCmd)
}

func runServe(cmd *cobra.Command, args []string) error {
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	session := leylines.NewSession()

	client := leylines.New(flagLeylines, leylines.Handlers{
		OnHandshake: func(h leylines.HandshakeMessage) {
			session.UpdateHandshake(h)
			caps := summariseCaps(h)
			log.Info("Leylines handshake", "version", h.Version, "capabilities", caps)
		},
		OnState: func(s leylines.StateMessage) {
			session.UpdateState(s.Player)
		},
		OnEvent: func(ev leylines.EventMessage) {
			session.AppendEvent(ev)
			if ev.CmdID != "" {
				log.Debug("goal event", "cmdId", ev.CmdID[:8], "event", ev.Event)
			}
		},
		OnError: func(e leylines.ErrorMessage) {
			session.AppendEvent(leylines.EventMessage{
				Type:  leylines.TypeEvent,
				CmdID: e.CmdID,
				Event: "leylines:error",
				Data:  map[string]interface{}{"message": e.Message},
			})
		},
		OnConnect: func() {
			log.Info("Leylines connected", "url", flagLeylines)
		},
		OnDisconnect: func(err error) {
			log.Warn("Leylines disconnected", "err", err)
		},
	}, log)

	dispatcher := agent.NewDispatcher(agent.Config{
		PiBinary:      flagPiBinary,
		ExtensionPath: flagExtension,
	}, log)

	apiServer := api.New(flagAPI, session, client, dispatcher, log)

	g, ctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		return client.Run(ctx)
	})
	g.Go(func() error {
		return apiServer.Start(ctx)
	})

	fmt.Fprintf(os.Stderr, "SoulGem running — Leylines: %s | API: http://localhost%s\n",
		flagLeylines, flagAPI)
	fmt.Fprintf(os.Stderr, "Press Ctrl+C to stop.\n")

	if err := g.Wait(); err != nil && err != context.Canceled {
		return fmt.Errorf("soulgem serve: %w", err)
	}
	return nil
}

func summariseCaps(h leylines.HandshakeMessage) string {
	var caps []string
	caps = append(caps, h.CoreCapabilities...)
	for _, ext := range h.Extensions {
		caps = append(caps, ext.Capabilities...)
	}
	result := ""
	for i, c := range caps {
		if i > 0 {
			result += ", "
		}
		result += c
	}
	return result
}
