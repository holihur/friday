package api

import "testing"

func TestBoardTemplates(t *testing.T) {
	templates := []string{"project", "roadmap", "sprint", "blank", "unknown"}
	for _, name := range templates {
		def := boardTemplate(name)
		if len(def.Columns) == 0 {
			t.Fatalf("%s: expected columns", name)
		}
		if len(def.Groups) == 0 {
			t.Fatalf("%s: expected groups", name)
		}
		seen := map[string]bool{}
		for _, col := range def.Columns {
			if seen[col.ID] {
				t.Fatalf("%s: duplicate column id %q", name, col.ID)
			}
			seen[col.ID] = true
		}
		if def.Columns[0].Type != "status" {
			t.Fatalf("%s: first column should be status", name)
		}
	}
}
