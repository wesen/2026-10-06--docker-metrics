package cli

import "github.com/spf13/cobra"

func newServeCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "serve", Short: "Run the daemon (HTTP + WebSocket)"}
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		return errNotImplemented("serve")
	}
	return cmd
}
