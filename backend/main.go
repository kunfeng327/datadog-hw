package main

import (
	"log"
	"net/http"
	"time"

	"datadog-demo/backend/datadog"
	"datadog-demo/backend/handlers"

	"gopkg.in/DataDog/dd-trace-go.v1/ddtrace/tracer"
)

const addr = ":9000"

func main() {
	datadog.Init() // 启动 Datadog 上报（未配置 DD_API_KEY 时自动降级为本地日志）

	tracer.Start(
		tracer.WithService("rock-3d-backend"),
		tracer.WithEnv("development"),
		tracer.WithServiceVersion("1.0.0"),
	)
	defer tracer.Stop()

	srv := &http.Server{
		Addr:         addr,
		Handler:      handlers.NewMux(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Printf("backend listening on http://localhost%s", addr)
	log.Fatal(srv.ListenAndServe())
}
