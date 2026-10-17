package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"datadog-demo/backend/stats"
)

// Exercise the routed handlers, including responses copied from order-service.
// Snapshot deltas keep these assertions independent of previous requests.
func TestAPIErrorStats(t *testing.T) {
	tests := []struct {
		name           string
		method         string
		path           string
		body           string
		upstreamStatus int
		unreachable    bool
		wantStatus     int
		wantErrors     int64
		wantTotal      int64
	}{
		{"order confirmed", "POST", "/api/order", `{"itemId":"rock","quantity":1}`, 200, false, 200, 0, 1},
		{"order invalid body", "POST", "/api/order", `{`, 400, false, 400, 1, 1},
		{"order item missing", "POST", "/api/order", `{}`, 404, false, 404, 1, 1},
		{"order stock exhausted", "POST", "/api/order", `{}`, 409, false, 409, 1, 1},
		{"order upstream failure", "POST", "/api/order", `{}`, 500, false, 500, 1, 1},
		{"order service unavailable", "POST", "/api/order", `{}`, 0, true, 502, 1, 1},
		{"items unavailable", "GET", "/api/items", "", 503, false, 503, 1, 1},
		{"items available", "GET", "/api/items", "", 200, false, 200, 0, 1},
		{"invalid action JSON", "POST", "/api/action", `{`, 0, false, 400, 1, 1},
		{"unknown action", "POST", "/api/action", `{"action":"unknown"}`, 0, false, 400, 1, 1},
		{"valid action", "POST", "/api/action", `{"action":"pose"}`, 0, false, 200, 0, 1},
		{"invalid interaction JSON", "POST", "/api/interaction", `{`, 0, false, 400, 1, 1},
		{"valid interaction", "POST", "/api/interaction", `{"type":"rotate"}`, 0, false, 200, 0, 1},
		{"unknown API route", "GET", "/api/missing", "", 0, false, 404, 1, 1},
		{"unsupported API method", "GET", "/api/order", "", 0, false, 405, 1, 1},
		{"health excluded", "GET", "/health", "", 0, false, 200, 0, 0},
		{"non API error excluded", "GET", "/missing", "", 0, false, 404, 0, 0},
		{"CORS preflight", "OPTIONS", "/api/order", "", 0, false, 204, 0, 1},
	}

	handler := NewMux()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			const upstreamBody = `{"result":"upstream response"}`
			if tt.upstreamStatus != 0 || tt.unreachable {
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/order" && r.URL.Path != "/items" {
						t.Errorf("unexpected upstream path: %s", r.URL.Path)
					}
					w.WriteHeader(tt.upstreamStatus)
					_, _ = w.Write([]byte(upstreamBody))
				}))
				t.Cleanup(upstream.Close)
				t.Setenv("ORDER_SERVICE_URL", upstream.URL)
				if tt.unreachable {
					upstream.Close()
				}
			}

			_, _, _, beforeErrors, beforeTotal := stats.Get()
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body)))
			if response.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d: %s", response.Code, tt.wantStatus, response.Body.String())
			}
			if tt.upstreamStatus != 0 && response.Body.String() != upstreamBody {
				t.Errorf("proxy altered the upstream response: %s", response.Body.String())
			}
			_, _, _, afterErrors, afterTotal := stats.Get()
			if got := afterErrors - beforeErrors; got != tt.wantErrors {
				t.Errorf("error delta = %d, want %d", got, tt.wantErrors)
			}
			if got := afterTotal - beforeTotal; got != tt.wantTotal {
				t.Errorf("request delta = %d, want %d", got, tt.wantTotal)
			}

			// The same counter must be exposed to the existing frontend poll.
			snapshot := httptest.NewRecorder()
			handler.ServeHTTP(snapshot, httptest.NewRequest("GET", "/api/stats", nil))
			var data struct {
				Errors int64 `json:"errors"`
			}
			if err := json.Unmarshal(snapshot.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			if data.Errors != afterErrors {
				t.Errorf("/api/stats errors = %d, want %d", data.Errors, afterErrors)
			}
		})
	}
}

func TestAPIErrorStatsUsesCommittedStatus(t *testing.T) {
	tests := []struct {
		name         string
		bodyFirst    bool
		firstStatus  int
		secondStatus int
		wantStatus   int
		wantErrors   int64
	}{
		{"implicit success", true, 0, 500, 200, 0},
		{"explicit success", false, 200, 500, 200, 0},
		{"explicit failure", false, 409, 200, 409, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, _, before, _ := stats.Get()
			handler := withStats(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tt.bodyFirst {
					_, _ = w.Write([]byte("ok"))
				} else {
					w.WriteHeader(tt.firstStatus)
				}
				w.WriteHeader(tt.secondStatus)
			}))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest("GET", "/api/example", nil))
			if response.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", response.Code, tt.wantStatus)
			}
			_, _, _, after, _ := stats.Get()
			if got := after - before; got != tt.wantErrors {
				t.Errorf("error delta = %d, want %d", got, tt.wantErrors)
			}
		})
	}
}
