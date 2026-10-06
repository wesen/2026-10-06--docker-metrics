package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Client is a minimal Docker Engine API client. It speaks the versioned REST
// API over a unix socket, plain TCP, or an SSH tunnel. We implement it directly
// rather than depending on the whole moby client so that only the four
// endpoints we need are pulled in and so the collector is trivially fakeable.
type Client struct {
	ep      Endpoint
	http    *http.Client
	base    string
	mu      sync.Mutex
	version string // e.g. "v1.47"; empty until negotiated
	server  string // daemon version, e.g. "27.0.3"
}

// NewClient builds a client for the endpoint. It does not perform any network
// I/O; call Ping or Negotiate for that.
func NewClient(ep Endpoint) (*Client, error) {
	transport, base, err := transportFor(ep)
	if err != nil {
		return nil, err
	}
	return &Client{
		ep:   ep,
		http: &http.Client{Transport: transport, Timeout: 0},
		base: base,
	}, nil
}

func transportFor(ep Endpoint) (*http.Transport, string, error) {
	switch ep.Kind {
	case "unix":
		dialer := func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", ep.Path)
		}
		return &http.Transport{DialContext: dialer}, "http://docker", nil
	case "tcp":
		scheme := "http"
		if strings.HasPrefix(ep.URI, "https://") {
			scheme = "https"
		}
		base := ep.Host
		if base == "" {
			base = strings.TrimPrefix(strings.TrimPrefix(ep.URI, "tcp://"), "http://")
			base = strings.TrimPrefix(base, "https://")
		}
		return &http.Transport{Proxy: http.ProxyFromEnvironment}, scheme + "://" + base, nil
	case "ssh":
		dialer, err := sshDialer(ep)
		if err != nil {
			return nil, "", err
		}
		return &http.Transport{DialContext: dialer}, "http://docker", nil
	default:
		return nil, "", fmt.Errorf("unsupported docker endpoint kind %q", ep.Kind)
	}
}

// sshDialer returns a DialContext that opens an SSH connection to the remote and
// then dials the Docker unix socket on the far side (equivalent to what the
// docker CLI does for ssh:// hosts).
func sshDialer(ep Endpoint) (func(context.Context, string, string) (net.Conn, error), error) {
	user := ep.User
	if user == "" {
		user = os.Getenv("USER")
	}
	auth, err := sshAuthMethods()
	if err != nil {
		return nil, err
	}
	hostKey, err := hostKeyCallback()
	if err != nil {
		return nil, err
	}
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            auth,
		HostKeyCallback: hostKey,
		Timeout:         10 * time.Second,
	}
	addr := ep.Host
	if !strings.Contains(addr, ":") {
		addr += ":22"
	}
	sock := ep.Path
	if sock == "" {
		sock = DefaultUnixSocket
	}
	return func(ctx context.Context, _, _ string) (net.Conn, error) {
		d := net.Dialer{}
		raw, err := d.DialContext(ctx, "tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("ssh dial %s: %w", addr, err)
		}
		cc, chans, reqs, err := ssh.NewClientConn(raw, addr, cfg)
		if err != nil {
			raw.Close()
			return nil, fmt.Errorf("ssh handshake %s: %w", addr, err)
		}
		sc := ssh.NewClient(cc, chans, reqs)
		conn, err := sc.Dial("unix", sock)
		if err != nil {
			sc.Close()
			return nil, fmt.Errorf("ssh dial %s: %w", sock, err)
		}
		return conn, nil
	}, nil
}

func sshAuthMethods() ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if conn, err := net.Dial("unix", sock); err == nil {
			methods = append(methods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
		}
	}
	home, _ := os.UserHomeDir()
	for _, name := range []string{"id_ed25519", "id_rsa", "id_ecdsa"} {
		path := filepath.Join(home, ".ssh", name)
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		signer, err := ssh.ParsePrivateKey(b)
		if err != nil {
			continue
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if len(methods) == 0 {
		return nil, fmt.Errorf("no ssh credentials found (agent or ~/.ssh/id_*)")
	}
	return methods, nil
}

func hostKeyCallback() (ssh.HostKeyCallback, error) {
	home, _ := os.UserHomeDir()
	for _, name := range []string{"known_hosts", "known_hosts2"} {
		path := filepath.Join(home, ".ssh", name)
		if _, err := os.Stat(path); err == nil {
			return knownhosts.New(path)
		}
	}
	// Fall back to the system-wide known_hosts if present.
	for _, path := range []string{"/etc/ssh/ssh_known_hosts"} {
		if _, err := os.Stat(path); err == nil {
			return knownhosts.New(path)
		}
	}
	return nil, fmt.Errorf("no known_hosts file found; cannot verify %s host key", "ssh")
}

// Endpoint returns the endpoint this client talks to.
func (c *Client) Endpoint() Endpoint { return c.ep }

// ServerVersion returns the daemon version reported by /version (empty until
// Negotiate has run).
func (c *Client) ServerVersion() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.server
}

// Name returns the short host label.
func (c *Client) Name() string { return c.ep.Name }

func (c *Client) url(path string) string {
	if c.version != "" {
		return c.base + "/" + c.version + path
	}
	return c.base + path
}

// Ping checks the daemon is reachable.
func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/_ping", nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("docker ping %s: status %d", c.ep.Name, resp.StatusCode)
	}
	return nil
}

// Negotiate reads /version once and pins the API version for later calls.
func (c *Client) Negotiate(ctx context.Context) (string, error) {
	var v struct {
		APIVersion string `json:"ApiVersion"`
		Version    string `json:"Version"`
	}
	if err := c.get(ctx, c.base+"/version", &v); err != nil {
		return "", err
	}
	if v.APIVersion != "" {
		c.mu.Lock()
		c.version = "v" + strings.TrimPrefix(v.APIVersion, "v")
		c.server = v.Version
		c.mu.Unlock()
	}
	return v.Version, nil
}

func (c *Client) get(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return &APIError{Status: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}
	if out == nil {
		io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// APIError is a non-2xx response from the Docker daemon.
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("docker api error: status %d: %s", e.Status, e.Body)
}

// List returns all containers (running and stopped).
func (c *Client) List(ctx context.Context) ([]ListContainer, error) {
	var out []ListContainer
	if err := c.get(ctx, c.url("/containers/json?all=1"), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Stats returns one stats snapshot for a container.
func (c *Client) Stats(ctx context.Context, id string) (*Stats, error) {
	var out Stats
	if err := c.get(ctx, c.url("/containers/"+id+"/stats?stream=0"), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Events opens the daemon event stream. The caller must close the body.
func (c *Client) Events(ctx context.Context, since int64) (io.ReadCloser, error) {
	url := c.url("/events")
	if since > 0 {
		url += fmt.Sprintf("?since=%d", since)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, &APIError{Status: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}
	return resp.Body, nil
}

// Restart restarts a container.
func (c *Client) Restart(ctx context.Context, id string, timeoutSeconds int) error {
	return c.post(ctx, c.url(fmt.Sprintf("/containers/%s/restart?t=%d", id, timeoutSeconds)))
}

// Stop stops a container.
func (c *Client) Stop(ctx context.Context, id string, timeoutSeconds int) error {
	return c.post(ctx, c.url(fmt.Sprintf("/containers/%s/stop?t=%d", id, timeoutSeconds)))
}

// Start starts a container.
func (c *Client) Start(ctx context.Context, id string) error {
	return c.post(ctx, c.url("/containers/"+id+"/start"))
}

func (c *Client) post(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 400 {
		return &APIError{Status: resp.StatusCode}
	}
	return nil
}

// Event is one Docker daemon event.
type Event struct {
	Type   string `json:"Type"`
	Action string `json:"Action"`
	Actor  struct {
		ID         string            `json:"ID"`
		Attributes map[string]string `json:"Attributes"`
	} `json:"Actor"`
	Time int64 `json:"time"`
}
