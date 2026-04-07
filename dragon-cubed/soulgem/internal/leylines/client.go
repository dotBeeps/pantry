package leylines

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	defaultReconnectDelay = 3 * time.Second
	writeTimeout          = 10 * time.Second
)

// Handlers are callbacks invoked by Client when messages arrive.
// All callbacks are called from the read goroutine — they must not block.
type Handlers struct {
	OnHandshake func(HandshakeMessage)
	OnState     func(StateMessage)
	OnEvent     func(EventMessage)
	OnError     func(ErrorMessage)
	OnConnect   func()
	OnDisconnect func(err error)
}

// Client is a reconnecting WebSocket client for D3-Leylines.
// Use [New] to construct, then [Run] to connect and process messages.
type Client struct {
	url      string
	handlers Handlers
	log      *slog.Logger

	mu   sync.Mutex
	conn *websocket.Conn
}

// New constructs a Client targeting the given WebSocket URL.
func New(url string, handlers Handlers, log *slog.Logger) *Client {
	return &Client{
		url:      url,
		handlers: handlers,
		log:      log,
	}
}

// Run connects to Leylines and reads messages until ctx is cancelled.
// On disconnect it waits [defaultReconnectDelay] and reconnects automatically.
func (c *Client) Run(ctx context.Context) error {
	for {
		if err := c.runOnce(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err() // clean shutdown
			}
			c.log.Warn("Leylines connection lost — reconnecting",
				"err", err, "delay", defaultReconnectDelay)
			if c.handlers.OnDisconnect != nil {
				c.handlers.OnDisconnect(err)
			}
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(defaultReconnectDelay):
		}
	}
}

// SendCommand sends a CommandMessage to Leylines. Safe to call from any goroutine.
func (c *Client) SendCommand(ctx context.Context, cmd CommandMessage) error {
	data, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("marshaling command: %w", err)
	}
	return c.writeRaw(data)
}

// Connected reports whether there is an active WebSocket connection.
func (c *Client) Connected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// ── Internal ──────────────────────────────────────────────────────────────────

func (c *Client) runOnce(ctx context.Context) error {
	c.log.Info("Connecting to Leylines", "url", c.url)
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, c.url, nil)
	if err != nil {
		return fmt.Errorf("dialing Leylines: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	c.log.Info("Connected to Leylines")
	if c.handlers.OnConnect != nil {
		c.handlers.OnConnect()
	}

	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		conn.Close()
	}()

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		_, data, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("reading from Leylines: %w", err)
		}
		c.dispatch(data)
	}
}

func (c *Client) writeRaw(data []byte) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return fmt.Errorf("not connected to Leylines")
	}
	if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
		return fmt.Errorf("setting write deadline: %w", err)
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) dispatch(data []byte) {
	msgType, err := PeekType(data)
	if err != nil {
		c.log.Warn("dropping unparseable message", "err", err)
		return
	}

	switch msgType {
	case TypeHandshake:
		var msg HandshakeMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.log.Warn("failed to parse handshake", "err", err)
			return
		}
		c.log.Info("Leylines handshake received",
			"version", msg.Version,
			"extensions", len(msg.Extensions),
			"core", len(msg.CoreCapabilities))
		if c.handlers.OnHandshake != nil {
			c.handlers.OnHandshake(msg)
		}

	case TypeState:
		var msg StateMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.log.Warn("failed to parse state", "err", err)
			return
		}
		if c.handlers.OnState != nil {
			c.handlers.OnState(msg)
		}

	case TypeEvent:
		var msg EventMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.log.Warn("failed to parse event", "err", err)
			return
		}
		if c.handlers.OnEvent != nil {
			c.handlers.OnEvent(msg)
		}

	case TypeError:
		var msg ErrorMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.log.Warn("failed to parse error message", "err", err)
			return
		}
		c.log.Warn("Leylines error", "cmdId", msg.CmdID, "message", msg.Message)
		if c.handlers.OnError != nil {
			c.handlers.OnError(msg)
		}

	default:
		c.log.Warn("unknown message type", "type", msgType)
	}
}
