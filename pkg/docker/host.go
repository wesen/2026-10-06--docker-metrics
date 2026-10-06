package docker

import (
	"fmt"
	"net/url"
	"strings"
)

// DefaultUnixSocket is where the local Docker daemon listens by default.
const DefaultUnixSocket = "/var/run/docker.sock"

// Endpoint describes how to reach one Docker Engine API.
type Endpoint struct {
	// Name is the short host label used in selectors and labels ("local",
	// "prod-1"). Parsed from the URI.
	Name string
	// URI is the normalized endpoint, e.g. "unix:///var/run/docker.sock",
	// "tcp://prod-3:2375" or "ssh://ops@prod-1".
	URI string
	// Kind is "unix", "tcp" or "ssh".
	Kind string
	// Host is the host[:port] used for tcp/ssh dialing.
	Host string
	// Path is the socket path for unix endpoints (and ssh tunnels).
	Path string
	// User is the SSH user, when Kind == "ssh".
	User string
}

// ParseHost turns a DOCKER_HOST-style string into an Endpoint. An empty string
// means the local unix socket. Bare hostnames are treated as tcp endpoints.
func ParseHost(h string) (Endpoint, error) {
	h = strings.TrimSpace(h)
	if h == "" {
		return Endpoint{Name: "local", URI: "unix://" + DefaultUnixSocket, Kind: "unix", Path: DefaultUnixSocket}, nil
	}
	u, err := url.Parse(h)
	if err != nil {
		return Endpoint{}, fmt.Errorf("parse docker host %q: %w", h, err)
	}
	switch u.Scheme {
	case "unix":
		p := u.Path
		if p == "" {
			p = DefaultUnixSocket
		}
		return Endpoint{Name: "local", URI: "unix://" + p, Kind: "unix", Path: p}, nil
	case "tcp", "http", "https":
		host := u.Host
		if host == "" {
			host = u.Path
		}
		name := stripPort(host)
		if isLocal(name) {
			name = "local"
		}
		scheme := "tcp"
		if u.Scheme == "http" || u.Scheme == "https" {
			scheme = u.Scheme
		}
		return Endpoint{Name: name, URI: scheme + "://" + host, Kind: "tcp", Host: host}, nil
	case "ssh":
		name := stripPort(u.Host)
		if name == "" {
			return Endpoint{}, fmt.Errorf("ssh endpoint %q has no host", h)
		}
		user := ""
		if u.User != nil {
			user = u.User.Username()
		}
		p := u.Path
		if p == "" {
			p = DefaultUnixSocket
		}
		return Endpoint{Name: name, URI: h, Kind: "ssh", Host: u.Host, Path: p, User: user}, nil
	default:
		// No scheme: treat as host[:port].
		host := h
		name := stripPort(host)
		if isLocal(name) {
			name = "local"
		}
		return Endpoint{Name: name, URI: "tcp://" + host, Kind: "tcp", Host: host}, nil
	}
}

func stripPort(hostPort string) string {
	if i := strings.LastIndex(hostPort, ":"); i >= 0 && !strings.Contains(hostPort[i:], "]") {
		return hostPort[:i]
	}
	return hostPort
}

func isLocal(name string) bool {
	switch name {
	case "", "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}
