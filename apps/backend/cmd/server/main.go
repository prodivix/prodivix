package main

import (
	"log"

	backend "github.com/Prodivix/prodivix/apps/backend"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

func main() {
	cfg, err := backendconfig.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}
	server, err := backend.NewServer(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		if closeErr := server.Close(); closeErr != nil {
			log.Printf("close database: %v", closeErr)
		}
	}()
	if runErr := server.Run(); runErr != nil {
		log.Fatal(runErr)
	}
}
