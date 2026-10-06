package cli

import "github.com/spf13/cobra"

func newCheckCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "check <file.js>...", Short: "Validate dashboard JS files", Args: cobra.MinimumNArgs(1)}
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		return errNotImplemented("check")
	}
	return cmd
}
