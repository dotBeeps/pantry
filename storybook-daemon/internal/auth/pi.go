// Package auth handles reading and refreshing Anthropic OAuth credentials
// from pi's auth store at ~/.pi/agent/auth.json.
package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/anthropics/anthropic-sdk-go/option"
)

const (
	// clientID is pi's registered Anthropic OAuth client ID.
	clientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	tokenURL = "https://platform.claude.com/v1/oauth/token" //nolint:gosec // G101: URL constant, not a credential
)

// piAuthFile is the shape of ~/.pi/agent/auth.json.
type piAuthFile struct {
	Anthropic *anthropicCredential `json:"anthropic"`
}

// anthropicCredential holds a live OAuth credential pair.
type anthropicCredential struct {
	Type    string `json:"type"`
	Refresh string `json:"refresh"`
	Access  string `json:"access"`
	Expires int64  `json:"expires"` // milliseconds since epoch
}

// PiOAuth loads, validates, and refreshes Anthropic OAuth credentials from pi's auth store.
type PiOAuth struct {
	mu       sync.Mutex
	cred     *anthropicCredential
	authPath string
	log      *slog.Logger
}

// LoadPiOAuth reads pi's auth.json and returns a PiOAuth credential manager.
func LoadPiOAuth(log *slog.Logger) (*PiOAuth, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolving home dir: %w", err)
	}
	path := filepath.Join(home, ".pi", "agent", "auth.json")

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading pi auth file %s: %w", path, err)
	}

	var f piAuthFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parsing pi auth file: %w", err)
	}
	if f.Anthropic == nil {
		return nil, errors.New("no anthropic credentials in pi auth file — run `pi login` first")
	}
	if f.Anthropic.Type != "oauth" {
		return nil, fmt.Errorf("unexpected credential type %q (expected oauth)", f.Anthropic.Type)
	}
	if f.Anthropic.Access == "" || f.Anthropic.Refresh == "" {
		return nil, errors.New("incomplete anthropic oauth credentials in pi auth file")
	}

	return &PiOAuth{
		cred:     f.Anthropic,
		authPath: path,
		log:      log,
	}, nil
}

// GetToken returns a valid OAuth access token, refreshing if the current one is expired.
func (p *PiOAuth) GetToken(ctx context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.isExpired() {
		p.log.Info("oauth token expired, refreshing")
		if err := p.refresh(ctx); err != nil {
			return "", fmt.Errorf("refreshing oauth token: %w", err)
		}
	}

	return p.cred.Access, nil
}

// Option returns a per-call request option that injects the current access token.
// Call this fresh on each LLM request — it handles refresh automatically.
func (p *PiOAuth) Option(ctx context.Context) (option.RequestOption, error) {
	token, err := p.GetToken(ctx)
	if err != nil {
		return nil, err
	}
	return option.WithAuthToken(token), nil
}

// isExpired reports whether the access token has expired. Must be called with mu held.
func (p *PiOAuth) isExpired() bool {
	return time.Now().UnixMilli() >= p.cred.Expires
}

// refresh exchanges the refresh token for a new access token. Must be called with mu held.
func (p *PiOAuth) refresh(ctx context.Context) error {
	body, err := json.Marshal(map[string]string{
		"grant_type":    "refresh_token",
		"client_id":     clientID,
		"refresh_token": p.cred.Refresh,
	})
	if err != nil {
		return fmt.Errorf("marshaling refresh request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building refresh request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("token refresh HTTP call: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // best-effort body close

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading refresh response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("token refresh failed (HTTP %d): %s", resp.StatusCode, respBody)
	}

	var data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int64  `json:"expires_in"` // seconds
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		return fmt.Errorf("parsing refresh response: %w", err)
	}

	// 5-minute buffer on expiry, matching pi's behaviour.
	p.cred.Access = data.AccessToken
	p.cred.Refresh = data.RefreshToken
	p.cred.Expires = time.Now().UnixMilli() + data.ExpiresIn*1000 - 5*60*1000

	p.log.Info("oauth token refreshed", "expires_in", data.ExpiresIn)

	// Persist back to auth.json (atomic write via temp file).
	return p.persist()
}

// persist writes the updated credential back to auth.json atomically. Must be called with mu held.
func (p *PiOAuth) persist() error {
	existing, err := os.ReadFile(p.authPath)
	if err != nil {
		return fmt.Errorf("reading auth file for update: %w", err)
	}

	var f piAuthFile
	if err := json.Unmarshal(existing, &f); err != nil {
		return fmt.Errorf("parsing auth file for update: %w", err)
	}

	f.Anthropic = p.cred

	updated, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling updated auth: %w", err)
	}

	// Write to a temp file in the same directory, then rename (atomic on Linux).
	dir := filepath.Dir(p.authPath)
	tmp, err := os.CreateTemp(dir, ".auth-*.json.tmp")
	if err != nil {
		return fmt.Errorf("creating temp auth file: %w", err)
	}
	tmpName := tmp.Name()

	if _, err := tmp.Write(updated); err != nil {
		_ = tmp.Close()        // best-effort cleanup
		_ = os.Remove(tmpName) // best-effort cleanup
		return fmt.Errorf("writing temp auth file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName) // best-effort cleanup
		return fmt.Errorf("closing temp auth file: %w", err)
	}
	if err := os.Rename(tmpName, p.authPath); err != nil {
		_ = os.Remove(tmpName) // best-effort cleanup
		return fmt.Errorf("persisting refreshed auth: %w", err)
	}

	return nil
}
