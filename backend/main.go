package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"datadog-demo/backend/handlers"
	"datadog-demo/backend/observability"
)

const addr = ":9000"

func main() {
	// Datadog APM tracer + DogStatsD。
	// 通过环境变量配置：DD_SERVICE / DD_ENV / DD_AGENT_HOST / DD_TRACE_AGENT_URL。
	// 未运行 Agent 时自动降级，不影响本地开发。
	service := getenv("DD_SERVICE", "rock-demo-api")
	env := getenv("DD_ENV", "dev")
	observability.Start(service, env)
	defer observability.Stop()

	srv := &http.Server{
		Addr:         addr,
		Handler:      handlers.NewMux(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Printf("backend (%s/%s) listening on http://localhost%s", service, env, addr)
	log.Fatal(srv.ListenAndServe())
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
