package api

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

type templateGroup struct {
	Title string
	Color string
}

type templateDef struct {
	Columns []models.Column
	Groups  []templateGroup
}

func boardTemplate(name string) templateDef {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "blank":
		return templateDef{
			Columns: []models.Column{
				column("status", "Status", "status", 150, statusLabels()...),
				column("notes", "Notes", "text", 240),
			},
			Groups: []templateGroup{{Title: "Group 1", Color: "#6161ff"}},
		}
	case "roadmap":
		return templateDef{
			Columns: []models.Column{
				column("stage", "Stage", "status", 145, stageLabels()...),
				column("people_owner", "Owner", "people", 145),
				column("priority", "Priority", "priority", 120, priorityLabels()...),
				column("start", "Start date", "date", 145),
				column("target", "Target date", "date", 145),
				column("notes", "Notes", "text", 240),
			},
			Groups: []templateGroup{
				{Title: "Now", Color: "#579bfc"},
				{Title: "Next", Color: "#a25ddc"},
				{Title: "Later", Color: "#c4c4c4"},
			},
		}
	case "sprint":
		return templateDef{
			Columns: []models.Column{
				column("status", "Status", "status", 150, statusLabels()...),
				column("people_owner", "Owner", "people", 145),
				column("priority", "Priority", "priority", 120, priorityLabels()...),
				column("start", "Start date", "date", 145),
				column("due", "Due date", "date", 145),
				column("points", "Story points", "numbers", 100),
			},
			Groups: []templateGroup{
				{Title: "Sprint backlog", Color: "#6161ff"},
				{Title: "In flight", Color: "#fdab3d"},
				{Title: "Shipped", Color: "#00c875"},
			},
		}
	default: // project
		return templateDef{
			Columns: []models.Column{
				column("status", "Status", "status", 150, statusLabels()...),
				column("people_owner", "Owner", "people", 145),
				column("priority", "Priority", "priority", 120, priorityLabels()...),
				column("start", "Start date", "date", 145),
				column("due", "Due date", "date", 145),
				column("effort", "Effort", "numbers", 90),
				column("approved", "Approved", "checkbox", 90),
			},
			Groups: []templateGroup{
				{Title: "To do", Color: "#579bfc"},
				{Title: "In progress", Color: "#fdab3d"},
				{Title: "Done", Color: "#00c875"},
			},
		}
	}
}

func (s *Server) createBoardDoc(ctx context.Context, owner *models.User, workspaceID primitive.ObjectID, name, color, icon, template string) (*models.Board, []models.Group, error) {
	if strings.TrimSpace(name) == "" {
		name = "Untitled board"
	}
	if color == "" {
		color = "#6161ff"
	}
	if icon == "" {
		icon = "📋"
	}
	def := boardTemplate(template)
	now := time.Now()
	board := &models.Board{
		ID:          primitive.NewObjectID(),
		WorkspaceID: workspaceID,
		Visibility:  BoardVisibilityWorkspace,
		Name:        cleanName(name),
		Color:       color,
		Icon:        icon,
		OwnerID:     owner.ID,
		Members:     []models.BoardMember{{UserID: owner.ID, Role: "owner"}},
		Columns:     def.Columns,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := s.db.Database.Collection("boards").InsertOne(ctx, board); err != nil {
		return nil, nil, err
	}
	groups := make([]models.Group, 0, len(def.Groups))
	docs := make([]any, 0, len(def.Groups))
	for i, tg := range def.Groups {
		g := models.Group{
			ID:        primitive.NewObjectID(),
			BoardID:   board.ID,
			Title:     tg.Title,
			Color:     tg.Color,
			Position:  float64((i + 1) * 1024),
			CreatedAt: now,
			UpdatedAt: now,
		}
		groups = append(groups, g)
		docs = append(docs, g)
	}
	if len(docs) > 0 {
		if _, err := s.db.Database.Collection("groups").InsertMany(ctx, docs); err != nil {
			return nil, nil, err
		}
	}
	s.logActivity(ctx, board.ID, primitive.NilObjectID, owner, "created board", "", "")
	return board, groups, nil
}
