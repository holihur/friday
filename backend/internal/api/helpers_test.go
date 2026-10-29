package api

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

func TestItemAssignedToHandlesBSONArrays(t *testing.T) {
	userID := primitive.NewObjectID().Hex()
	board := &models.Board{Columns: []models.Column{
		{ID: "people_owner", Title: "Owner", Type: "people"},
		{ID: "notes", Title: "Notes", Type: "text"},
	}}
	item := &models.Item{Values: map[string]any{
		"people_owner": primitive.A{userID},
		"notes":        "hello",
	}}
	if !itemAssignedTo(board, item, userID) {
		t.Fatal("expected primitive.A assignee to match")
	}
	if itemAssignedTo(board, item, primitive.NewObjectID().Hex()) {
		t.Fatal("unexpected assignee match")
	}
}

func TestItemIsDone(t *testing.T) {
	board := &models.Board{Columns: []models.Column{
		{ID: "status", Type: "status", Labels: statusLabels()},
	}}
	done := &models.Item{Values: map[string]any{"status": "done"}}
	todo := &models.Item{Values: map[string]any{"status": "working"}}
	if !itemIsDone(board, done) {
		t.Fatal("done status should count as done")
	}
	if itemIsDone(board, todo) {
		t.Fatal("working status must not count as done")
	}
}

func TestItemPeopleIDs(t *testing.T) {
	item := &models.Item{Values: map[string]any{
		"a": primitive.A{"one", "two"},
		"b": []string{"three"},
	}}
	ids := itemPeopleIDs(item)
	if len(ids) != 3 {
		t.Fatalf("expected 3 ids, got %v", ids)
	}
}
