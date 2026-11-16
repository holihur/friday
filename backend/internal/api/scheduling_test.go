package api

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

func testScheduleBoard() *models.Board {
	return &models.Board{Columns: []models.Column{
		{ID: "status", Title: "Status", Type: "status"},
		{ID: "start", Title: "Start date", Type: "date"},
		{ID: "due", Title: "Due date", Type: "date"},
		{ID: "dependencies", Title: "Dependencies", Type: "dependency"},
	}}
}

func testItem(id primitive.ObjectID, start, end string, dependencies any) models.Item {
	values := map[string]any{"start": start, "due": end}
	if dependencies != nil {
		values["dependencies"] = dependencies
	}
	return models.Item{ID: id, Values: values}
}

func TestParseDependencyValue(t *testing.T) {
	ids, mode := parseDependencyValue(map[string]any{"itemIds": []any{"a", "b", "a"}, "mode": "any"})
	if mode != "any" || len(ids) != 2 || ids[0] != "a" || ids[1] != "b" {
		t.Fatalf("unexpected parsed dependency: ids=%v mode=%s", ids, mode)
	}

	ids, mode = parseDependencyValue(primitive.A{"c"})
	if mode != "all" || len(ids) != 1 || ids[0] != "c" {
		t.Fatalf("unexpected legacy dependency: ids=%v mode=%s", ids, mode)
	}
}

func TestComputeSchedulesAllMustFinish(t *testing.T) {
	board := testScheduleBoard()
	a, b, c := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	items := []models.Item{
		testItem(a, "2024-01-01", "2024-01-05", nil),
		testItem(b, "2024-01-01", "2024-01-03", map[string]any{"itemIds": []string{a.Hex()}, "mode": "all"}),
		testItem(c, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{b.Hex()}, "mode": "all"}),
	}
	schedules := computeSchedules(board, items)

	if got := schedules[b]; !got.OK || !got.Auto || formatScheduleDate(got.Start) != "2024-01-06" || formatScheduleDate(got.End) != "2024-01-08" {
		t.Fatalf("unexpected successor schedule: %+v", got)
	}
	if got := schedules[c]; !got.OK || !got.Auto || formatScheduleDate(got.Start) != "2024-01-09" || formatScheduleDate(got.End) != "2024-01-10" {
		t.Fatalf("unexpected cascaded schedule: %+v", got)
	}
}

func TestComputeSchedulesAnyOneFinishes(t *testing.T) {
	board := testScheduleBoard()
	a, b, c := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	items := []models.Item{
		testItem(a, "2024-01-01", "2024-01-02", nil),
		testItem(b, "2024-01-01", "2024-01-05", nil),
		testItem(c, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{a.Hex(), b.Hex()}, "mode": "any"}),
	}
	schedules := computeSchedules(board, items)

	if got := schedules[c]; !got.OK || !got.Auto || formatScheduleDate(got.Start) != "2024-01-03" || formatScheduleDate(got.End) != "2024-01-04" {
		t.Fatalf("unexpected any-finish schedule: %+v", got)
	}
}

func TestComputeSchedulesAllRequiresEveryDate(t *testing.T) {
	board := testScheduleBoard()
	a, b := primitive.NewObjectID(), primitive.NewObjectID()
	items := []models.Item{
		testItem(a, "2024-01-01", "2024-01-02", nil),
		{ID: b, Values: map[string]any{"start": "2024-01-01", "due": "2024-01-02", "dependencies": map[string]any{"itemIds": []string{a.Hex()}, "mode": "all"}}},
	}
	// Give each item a new dependency target so the missing item can be separate.
	missing := primitive.NewObjectID()
	items[1].Values["dependencies"] = map[string]any{"itemIds": []string{a.Hex(), missing.Hex()}, "mode": "all"}
	schedules := computeSchedules(board, items)

	got := schedules[b]
	if got.Auto {
		t.Fatalf("all-mode dependency with a missing task must not auto-shift: %+v", got)
	}
}

func TestDependencyGraphHasCycle(t *testing.T) {
	board := testScheduleBoard()
	a, b := primitive.NewObjectID(), primitive.NewObjectID()
	items := []models.Item{
		testItem(a, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{b.Hex()}, "mode": "all"}),
		testItem(b, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{a.Hex()}, "mode": "all"}),
	}
	if !dependencyGraphHasCycle(board, items, primitive.NilObjectID, nil) {
		t.Fatal("expected dependency cycle")
	}
}

func TestApplyScheduleAddsProjection(t *testing.T) {
	board := testScheduleBoard()
	a, b := primitive.NewObjectID(), primitive.NewObjectID()
	items := []models.Item{
		testItem(a, "2024-01-01", "2024-01-05", nil),
		testItem(b, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{a.Hex()}, "mode": "all"}),
	}
	s := &Server{}
	s.applySchedule(board, items)
	if items[1].Schedule == nil || !items[1].Schedule.Auto {
		t.Fatalf("expected projected schedule, got %+v", items[1].Schedule)
	}
	if items[1].Schedule.Start != "2024-01-06" || items[1].Schedule.End != "2024-01-07" {
		t.Fatalf("unexpected projected dates: %+v", items[1].Schedule)
	}
}

func TestComputeSchedulesUsesCompletionTime(t *testing.T) {
	board := testScheduleBoard()
	board.Columns[0].Labels = statusLabels()
	board.Columns[0].Title = "Status"
	a, b := primitive.NewObjectID(), primitive.NewObjectID()
	completedAt := time.Date(2024, 1, 3, 12, 0, 0, 0, time.UTC)
	items := []models.Item{
		{ID: a, Values: map[string]any{"status": "done", "start": "2024-01-01", "due": "2024-01-10"}, CompletedAt: &completedAt},
		testItem(b, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{a.Hex()}, "mode": "all"}),
	}
	schedules := computeSchedules(board, items)
	if got := schedules[b]; !got.OK || !got.Auto || formatScheduleDate(got.Start) != "2024-01-04" || formatScheduleDate(got.End) != "2024-01-05" {
		t.Fatalf("expected successor to use actual completion date, got %+v", got)
	}
	if got := schedules[a]; got.Auto {
		t.Fatalf("completed item should not be auto-shifted: %+v", got)
	}
}

func TestComputeSchedulesUsesCompletionTimeWithoutDates(t *testing.T) {
	board := testScheduleBoard()
	board.Columns[0].Labels = statusLabels()
	a, b := primitive.NewObjectID(), primitive.NewObjectID()
	completedAt := time.Date(2024, 1, 3, 12, 0, 0, 0, time.UTC)
	items := []models.Item{
		{ID: a, Values: map[string]any{"status": "done"}, CompletedAt: &completedAt},
		testItem(b, "2024-01-01", "2024-01-02", map[string]any{"itemIds": []string{a.Hex()}, "mode": "all"}),
	}
	schedules := computeSchedules(board, items)
	if got := schedules[b]; !got.OK || !got.Auto || formatScheduleDate(got.Start) != "2024-01-04" {
		t.Fatalf("expected dated successor to schedule from a completed undated task, got %+v", got)
	}
}
