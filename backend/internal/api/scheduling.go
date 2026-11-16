package api

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

// dependencyRef is one dependency column value on an item: a set of
// predecessor tasks plus the condition used to decide when the item can start.
type dependencyRef struct {
	ColumnID string
	Mode     string
	ItemIDs  []primitive.ObjectID
}

// parseDependencyValue accepts both the canonical object form
// {"itemIds":["..."],"mode":"all"} and legacy/simple forms such as a single id
// or an array of ids.
func parseDependencyValue(value any) ([]string, string) {
	mode := "all"
	var raw any = value

	switch v := value.(type) {
	case map[string]any:
		mode = normalizeDependencyMode(v["mode"])
		raw = firstDependencyField(v, "itemIds", "ids", "items")
	case primitive.M:
		mode = normalizeDependencyMode(v["mode"])
		raw = firstDependencyField(v, "itemIds", "ids", "items")
	case primitive.D:
		fields := make(map[string]any, len(v))
		for _, e := range v {
			fields[e.Key] = e.Value
		}
		mode = normalizeDependencyMode(fields["mode"])
		raw = firstDependencyField(fields, "itemIds", "ids", "items")
	}

	return uniqueStrings(toStrings(raw)), mode
}

func firstDependencyField(values map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			return value
		}
	}
	return nil
}

func normalizeDependencyMode(value any) string {
	mode, _ := value.(string)
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "any", "or":
		return "any"
	default:
		return "all"
	}
}

func toStrings(value any) []string {
	switch v := value.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		return []string{v}
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		return out
	case primitive.A:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func canonicalDependencyValue(ids []string, mode string) map[string]any {
	if mode != "any" {
		mode = "all"
	}
	return map[string]any{"itemIds": ids, "mode": mode}
}

func itemDependencyRefs(board *models.Board, item *models.Item) []dependencyRef {
	refs := make([]dependencyRef, 0)
	for _, column := range board.Columns {
		if column.Type != "dependency" {
			continue
		}
		rawIDs, mode := parseDependencyValue(item.Values[column.ID])
		ids := make([]primitive.ObjectID, 0, len(rawIDs))
		seen := map[primitive.ObjectID]bool{}
		for _, rawID := range rawIDs {
			id, err := primitive.ObjectIDFromHex(rawID)
			if err != nil || id == item.ID || seen[id] {
				continue
			}
			seen[id] = true
			ids = append(ids, id)
		}
		if len(ids) > 0 {
			refs = append(refs, dependencyRef{ColumnID: column.ID, Mode: mode, ItemIDs: ids})
		}
	}
	return refs
}

func isStartDateColumn(column *models.Column) bool {
	title := strings.ToLower(column.Title)
	id := strings.ToLower(column.ID)
	return strings.Contains(title, "start") || strings.Contains(title, "begin") || strings.HasPrefix(id, "start")
}

func isEndDateColumn(column *models.Column) bool {
	title := strings.ToLower(column.Title)
	for _, token := range []string{"due", "end", "target", "launch", "deadline", "ship"} {
		if strings.Contains(title, token) {
			return true
		}
	}
	return false
}

// scheduleDateColumns mirrors the Gantt date-column discovery in the frontend.
func scheduleDateColumns(board *models.Board) (start, end *models.Column) {
	dates := make([]*models.Column, 0)
	for i := range board.Columns {
		if board.Columns[i].Type == "date" {
			dates = append(dates, &board.Columns[i])
		}
	}
	for _, column := range dates {
		if isStartDateColumn(column) {
			start = column
			break
		}
	}
	for _, column := range dates {
		if column == start {
			continue
		}
		if isEndDateColumn(column) {
			end = column
			break
		}
	}
	if end == nil {
		for _, column := range dates {
			if column != start {
				end = column
				break
			}
		}
	}
	if start == nil && end == nil && len(dates) > 0 {
		end = dates[0]
	}
	return start, end
}

func parseItemDate(value any) (time.Time, bool) {
	raw, ok := value.(string)
	if !ok || len(raw) < 10 {
		return time.Time{}, false
	}
	date, err := time.Parse("2006-01-02", raw[:10])
	if err != nil {
		return time.Time{}, false
	}
	return date, true
}

func formatScheduleDate(date time.Time) string {
	return date.Format("2006-01-02")
}

type scheduledItem struct {
	Start    time.Time
	End      time.Time
	Finish   time.Time // effective finish used by successors
	Auto     bool
	OK       bool // the item has a schedulable start/end range
	FinishOK bool // the finish time is known even if the item has no dates
}

type scheduledItemResolver func(primitive.ObjectID) scheduledItem

func baseItemSchedule(item *models.Item, startCol, endCol *models.Column) scheduledItem {
	var start, end time.Time
	var startOK, endOK bool
	if startCol != nil {
		start, startOK = parseItemDate(item.Values[startCol.ID])
	}
	if endCol != nil {
		end, endOK = parseItemDate(item.Values[endCol.ID])
	}
	if !startOK && !endOK {
		return scheduledItem{}
	}
	if !startOK {
		start = end.AddDate(0, 0, -6)
	}
	if !endOK {
		end = start
	}
	if start.After(end) {
		start, end = end, start
	}
	return scheduledItem{Start: start, End: end, Finish: end, OK: true, FinishOK: true}
}

func dependencyEarliestStart(refs []dependencyRef, resolve scheduledItemResolver) (time.Time, bool) {
	var overall time.Time
	for _, ref := range refs {
		var groupEnd time.Time
		groupOK := false
		missing := false
		for _, id := range ref.ItemIDs {
			predecessor := resolve(id)
			if !predecessor.FinishOK {
				missing = true
				continue
			}
			if !groupOK ||
				(ref.Mode == "all" && predecessor.Finish.After(groupEnd)) ||
				(ref.Mode == "any" && predecessor.Finish.Before(groupEnd)) {
				groupEnd = predecessor.Finish
				groupOK = true
			}
		}
		if !groupOK || (ref.Mode == "all" && missing) {
			return time.Time{}, false
		}
		if overall.IsZero() || groupEnd.After(overall) {
			overall = groupEnd
		}
	}
	if overall.IsZero() {
		return time.Time{}, false
	}
	return overall.AddDate(0, 0, 1), true
}

// computeSchedules returns the projected finish-to-start schedule for every
// dated item. Dependencies never mutate stored item values; the schedule is a
// read-time projection so moving a predecessor earlier also moves successors.
func computeSchedules(board *models.Board, items []models.Item) map[primitive.ObjectID]scheduledItem {
	startCol, endCol := scheduleDateColumns(board)
	byID := make(map[primitive.ObjectID]*models.Item, len(items))
	for i := range items {
		byID[items[i].ID] = &items[i]
	}
	cache := make(map[primitive.ObjectID]scheduledItem, len(items))
	visiting := map[primitive.ObjectID]bool{}

	var resolve scheduledItemResolver
	resolve = func(id primitive.ObjectID) scheduledItem {
		if cached, ok := cache[id]; ok {
			return cached
		}
		if visiting[id] {
			return scheduledItem{}
		}
		item, ok := byID[id]
		if !ok {
			return scheduledItem{}
		}
		visiting[id] = true
		defer delete(visiting, id)

		result := baseItemSchedule(item, startCol, endCol)
		done := itemIsDone(board, item)
		if done && item.CompletedAt != nil {
			result.Finish = time.Date(item.CompletedAt.Year(), item.CompletedAt.Month(), item.CompletedAt.Day(), 0, 0, 0, 0, time.UTC)
			result.FinishOK = true
		}
		if result.OK {
			refs := itemDependencyRefs(board, item)
			if !done && len(refs) > 0 {
				if earliest, ok := dependencyEarliestStart(refs, resolve); ok && earliest.After(result.Start) {
					durationDays := int(result.End.Sub(result.Start).Hours()/24) + 1
					result.Start = earliest
					result.End = earliest.AddDate(0, 0, durationDays-1)
					result.Finish = result.End
					result.Auto = true
				}
			}
		}
		cache[id] = result
		return result
	}

	for id := range byID {
		resolve(id)
	}
	return cache
}

func (s *Server) applySchedule(board *models.Board, items []models.Item) {
	if len(items) == 0 {
		return
	}
	schedules := computeSchedules(board, items)
	for i := range items {
		schedule, ok := schedules[items[i].ID]
		if !ok || !schedule.OK {
			items[i].Schedule = nil
			continue
		}
		items[i].Schedule = &models.ItemSchedule{
			Start: formatScheduleDate(schedule.Start),
			End:   formatScheduleDate(schedule.End),
			Auto:  schedule.Auto,
		}
	}
}

// dependencyGraphHasCycle checks the board with an optional override for one
// item's values, so a PATCH can be rejected before it creates a loop.
func dependencyGraphHasCycle(board *models.Board, items []models.Item, overrideID primitive.ObjectID, overrideValues map[string]any) bool {
	byID := make(map[primitive.ObjectID]*models.Item, len(items))
	for i := range items {
		byID[items[i].ID] = &items[i]
	}
	state := make(map[primitive.ObjectID]int, len(items))
	var visit func(primitive.ObjectID) bool
	visit = func(id primitive.ObjectID) bool {
		switch state[id] {
		case 1:
			return true
		case 2:
			return false
		}
		item, ok := byID[id]
		if !ok {
			return false
		}
		state[id] = 1
		values := item.Values
		if id == overrideID {
			values = overrideValues
		}
		for _, ref := range itemDependencyRefs(board, &models.Item{ID: id, Values: values}) {
			for _, predecessorID := range ref.ItemIDs {
				if visit(predecessorID) {
					return true
				}
			}
		}
		state[id] = 2
		return false
	}
	for id := range byID {
		if visit(id) {
			return true
		}
	}
	return false
}

// removeDependencyReferences drops deleted item ids from every dependency cell
// on the board so stale links do not linger in the UI.
func (s *Server) removeDependencyReferences(ctx context.Context, boardID primitive.ObjectID, removed map[string]bool) {
	if len(removed) == 0 {
		return
	}
	var board models.Board
	if err := s.db.Database.Collection("boards").FindOne(ctx, bson.M{"_id": boardID}).Decode(&board); err != nil {
		return
	}
	dependencyColumns := make(map[string]bool)
	for _, column := range board.Columns {
		if column.Type == "dependency" {
			dependencyColumns[column.ID] = true
		}
	}
	if len(dependencyColumns) == 0 {
		return
	}
	items := []models.Item{}
	cur, err := s.db.Database.Collection("items").Find(ctx, bson.M{"boardId": boardID})
	if err == nil {
		_ = cur.All(ctx, &items)
	}
	for _, item := range items {
		set := bson.M{}
		unset := bson.M{}
		for columnID := range dependencyColumns {
			rawIDs, mode := parseDependencyValue(item.Values[columnID])
			if len(rawIDs) == 0 {
				continue
			}
			kept := make([]string, 0, len(rawIDs))
			changed := false
			for _, rawID := range rawIDs {
				if removed[rawID] {
					changed = true
					continue
				}
				kept = append(kept, rawID)
			}
			if !changed {
				continue
			}
			if len(kept) == 0 {
				unset["values."+columnID] = ""
			} else {
				set["values."+columnID] = canonicalDependencyValue(kept, mode)
			}
		}
		if len(set) == 0 && len(unset) == 0 {
			continue
		}
		update := bson.M{}
		if len(set) > 0 {
			update["$set"] = set
		}
		if len(unset) > 0 {
			update["$unset"] = unset
		}
		_, _ = s.db.Database.Collection("items").UpdateOne(ctx, bson.M{"_id": item.ID}, update)
	}
}

// validateDependencyUpdate checks that every new dependency points at an item
// on the same board and that the resulting graph stays acyclic.
func validateDependencyUpdate(board *models.Board, items []models.Item, item *models.Item, proposedValues map[string]any) string {
	byID := make(map[primitive.ObjectID]bool, len(items))
	for i := range items {
		byID[items[i].ID] = true
	}
	hasDependencyColumn := false
	for _, column := range board.Columns {
		if column.Type != "dependency" {
			continue
		}
		hasDependencyColumn = true
		rawIDs, _ := parseDependencyValue(proposedValues[column.ID])
		for _, rawID := range rawIDs {
			id, err := primitive.ObjectIDFromHex(rawID)
			if err != nil {
				return "dependency task not found"
			}
			if id == item.ID {
				return "a task cannot depend on itself"
			}
			if !byID[id] {
				return "dependency task not found"
			}
		}
	}
	if !hasDependencyColumn {
		return ""
	}
	if dependencyGraphHasCycle(board, items, item.ID, proposedValues) {
		return "dependency cycle detected"
	}
	return ""
}
