// Package cli implements the docker-metrics command tree.
package cli

import (
	"github.com/spf13/cobra"
)

// NewRoot builds the root command with all subcommands attached.
func NewRoot() *cobra.Command {
	root := &cobra.Command{
		Use:   "docker-metrics",
		Short: "Poll Docker container metrics and serve them live over WebSocket",
		Long: `docker-metrics is a self-contained daemon that polls Docker container
metrics, keeps a bounded in-memory history, and serves live dashboards over
WebSocket plus a Prometheus endpoint. Dashboards are authored in JavaScript and
executed on the backend by a go-go-goja runtime.`,
		SilenceUsage: true,
	}
	root.AddCommand(
		newPollCmd(),
		newServeCmd(),
		newRunCmd(),
		newCheckCmd(),
		newLoadCmd(),
	)
	return root
}
