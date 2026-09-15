package main

import (
	"log"
	"net/http"
	"time"

	"datadog-demo/backend/handlers"
)

const addr = ":9000"

func main() {
	srv := &http.Server{
		Addr:         addr,
		Handler:      handlers.NewMux(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Printf("backend listening on http://localhost%s", addr)
	log.Fatal(srv.ListenAndServe())
}
