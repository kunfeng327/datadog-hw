package main

import (
	"log"
	"net/http"
	"time"

	"datadog-demo/order-service/datadog"
	"datadog-demo/order-service/handlers"

	"gopkg.in/DataDog/dd-trace-go.v1/ddtrace/tracer"
)

const addr = ":9100"

func main() {
	datadog.Init() // 未配置 DD_API_KEY 时自动降级为本地日志

	tracer.Start(
		tracer.WithService("order-service"),
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
	log.Printf("order-service listening on http://localhost%s", addr)
	log.Fatal(srv.ListenAndServe())
}
