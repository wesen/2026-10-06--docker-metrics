package main

import (
	"os"

	"github.com/go-go-golems/docker-metrics/pkg/cli"
)

func main() {
	if err := cli.NewRoot().Execute(); err != nil {
		os.Exit(1)
	}
}
