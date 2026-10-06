package cli

import "github.com/spf13/cobra"

func newRunCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "run <file.js>", Short: "Run a dashboard JS file", Args: cobra.MinimumNArgs(1)}
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		return errNotImplemented("run")
	}
	return cmd
}
