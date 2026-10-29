package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-test" {
			t.Fatalf("unexpected auth header: %s", got)
		}
		var req chatRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.Model != "test-model" {
			t.Fatalf("unexpected model: %s", req.Model)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": "pong"}}},
			"usage":   map[string]any{"total_tokens": 3},
		})
	}))
	defer srv.Close()
	res, err := Chat(context.Background(), Config{BaseURL: srv.URL + "/v1", APIKey: "sk-test", Model: "test-model"}, []Message{{Role: "user", Content: "ping"}}, nil, 8)
	if err != nil {
		t.Fatal(err)
	}
	if res.Message.Content != "pong" || res.Usage.TotalTokens != 3 {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestChatToolCall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"role": "assistant",
				"tool_calls": []any{map[string]any{
					"id": "call_1", "type": "function",
					"function": map[string]any{"name": "get_board", "arguments": `{"boardId":"abc"}`},
				}},
			}}},
		})
	}))
	defer srv.Close()
	res, err := Chat(context.Background(), Config{BaseURL: srv.URL + "/v1", APIKey: "sk-test", Model: "test-model"}, []Message{{Role: "user", Content: "look"}}, nil, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Message.ToolCalls) != 1 || res.Message.ToolCalls[0].Function.Name != "get_board" {
		t.Fatalf("unexpected tool calls: %+v", res.Message.ToolCalls)
	}
}

func TestChatProviderError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "bad key"}})
	}))
	defer srv.Close()
	if _, err := Chat(context.Background(), Config{BaseURL: srv.URL, APIKey: "bad", Model: "m"}, []Message{{Role: "user", Content: "x"}}, nil, 1); err == nil || err.Error() != "AI provider error: bad key" {
		t.Fatalf("unexpected error: %v", err)
	}
}
