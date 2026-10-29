package api

import (
	"context"
	"strings"
	"testing"

	"friday/backend/internal/models"
)

func TestValidateAIBaseURL(t *testing.T) {
	ctx := context.Background()
	if _, err := validateAIBaseURL(ctx, "ftp://example.com", false); err == nil {
		t.Fatal("ftp must be rejected")
	}
	if _, err := validateAIBaseURL(ctx, "https://user:pass@example.com/v1", false); err == nil {
		t.Fatal("credentials in URL must be rejected")
	}
	if _, err := validateAIBaseURL(ctx, "http://localhost:11434/v1", false); err == nil {
		t.Fatal("localhost must be rejected when private endpoints are disabled")
	}
	if got, err := validateAIBaseURL(ctx, "http://localhost:11434/v1", true); err != nil || !strings.HasSuffix(got, "/v1") {
		t.Fatalf("local endpoint should be accepted when enabled: %q %v", got, err)
	}
}

func TestFindLabelAndDateColumn(t *testing.T) {
	col := models.Column{Type: "status", Labels: []models.Label{{ID: "done", Name: "Done"}}}
	if findLabel(&col, "done") == nil || findLabel(&col, "DONE") == nil {
		t.Fatal("label lookup must be case-insensitive")
	}
	if findLabel(&col, "missing") != nil {
		t.Fatal("unknown label must not resolve")
	}
	board := &models.Board{Columns: []models.Column{
		{ID: "notes", Type: "text"},
		{ID: "start", Type: "date", Title: "Start date"},
		{ID: "due", Type: "date", Title: "Due date"},
	}}
	if c := findDateColumn(board); c == nil || c.ID != "due" {
		t.Fatalf("expected due date column, got %#v", c)
	}
}
