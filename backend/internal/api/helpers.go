package api

import (
	"crypto/rand"
	"encoding/hex"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

func shortID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func column(id, title, typ string, width int, labels ...models.Label) models.Column {
	return models.Column{ID: id, Title: title, Type: typ, Width: width, Labels: labels}
}

func label(id, name, color string) models.Label {
	return models.Label{ID: id, Name: name, Color: color}
}

// Default label palettes, shared by templates and new columns.
func statusLabels() []models.Label {
	return []models.Label{
		label("backlog", "Backlog", "#c4c4c4"),
		label("working", "Working on it", "#fdab3d"),
		label("review", "In review", "#579bfc"),
		label("done", "Done", "#00c875"),
		label("stuck", "Stuck", "#e2445c"),
	}
}

func priorityLabels() []models.Label {
	return []models.Label{
		label("critical", "Critical", "#e2445c"),
		label("high", "High", "#fdab3d"),
		label("medium", "Medium", "#ffcb00"),
		label("low", "Low", "#579bfc"),
	}
}

func stageLabels() []models.Label {
	return []models.Label{
		label("now", "Now", "#579bfc"),
		label("next", "Next", "#a25ddc"),
		label("later", "Later", "#c4c4c4"),
	}
}

func defaultColumnWidth(typ string) int {
	switch typ {
	case "text":
		return 220
	case "numbers":
		return 90
	case "checkbox":
		return 90
	case "date":
		return 145
	case "people":
		return 145
	case "priority":
		return 120
	default:
		return 150
	}
}

func defaultLabelsFor(typ string) []models.Label {
	switch typ {
	case "status":
		return statusLabels()
	case "priority":
		return priorityLabels()
	default:
		return nil
	}
}

func isDoneColumn(col models.Column) bool {
	if col.Type != "status" {
		return false
	}
	for _, l := range col.Labels {
		n := strings.ToLower(strings.TrimSpace(l.Name))
		if n == "done" || n == "completed" || n == "launched" {
			return true
		}
	}
	return false
}

func itemIsDone(board *models.Board, item *models.Item) bool {
	for _, col := range board.Columns {
		if !isDoneColumn(col) {
			continue
		}
		val, _ := item.Values[col.ID].(string)
		for _, l := range col.Labels {
			if l.ID == val {
				n := strings.ToLower(strings.TrimSpace(l.Name))
				if n == "done" || n == "completed" || n == "launched" {
					return true
				}
			}
		}
	}
	return false
}

func itemInProgress(board *models.Board, item *models.Item) bool {
	for _, col := range board.Columns {
		if col.Type != "status" {
			continue
		}
		val, _ := item.Values[col.ID].(string)
		for _, l := range col.Labels {
			if l.ID == val {
				n := strings.ToLower(strings.TrimSpace(l.Name))
				if strings.Contains(n, "progress") || strings.Contains(n, "working") || strings.Contains(n, "review") {
					return true
				}
			}
		}
	}
	return false
}

func itemPeopleIDs(item *models.Item) []string {
	var out []string
	for _, v := range item.Values {
		switch val := v.(type) {
		case []string:
			out = append(out, val...)
		case []any:
			for _, x := range val {
				if s, ok := x.(string); ok {
					out = append(out, s)
				}
			}
		case primitive.A:
			for _, x := range val {
				if s, ok := x.(string); ok {
					out = append(out, s)
				}
			}
		case string:
			out = append(out, val)
		}
	}
	return out
}

func itemHasPerson(item *models.Item, userID string) bool {
	for _, id := range itemPeopleIDs(item) {
		if id == userID {
			return true
		}
	}
	return false
}

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func validEmail(email string) bool { return len(email) <= 254 && emailRe.MatchString(email) }

func regexEscape(s string) string { return regexp.QuoteMeta(s) }

func cleanName(s string) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) > 200 {
		r := []rune(s)
		s = string(r[:200])
	}
	return s
}

func ptrTime(t time.Time) *time.Time { return &t }
