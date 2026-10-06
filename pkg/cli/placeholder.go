package cli

import "fmt"

func errNotImplemented(what string) error {
	return fmt.Errorf("`%s` is not implemented yet", what)
}
