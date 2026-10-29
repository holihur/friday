package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/models"
)

type BoardItem struct {
	models.Item
	BoardName    string          `json:"boardName"`
	BoardColor   string          `json:"boardColor"`
	BoardIcon    string          `json:"boardIcon"`
	BoardColumns []models.Column `json:"boardColumns"`
}

type BoardActivityItem struct {
	models.Activity
	BoardName  string `json:"boardName"`
	BoardColor string `json:"boardColor"`
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	memberships, err := s.listUserMemberships(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load people")
		return
	}
	wsFilter, err := s.workspaceIDFromQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	allowed := map[primitive.ObjectID]bool{}
	workspaceIDs := []primitive.ObjectID{}
	for _, m := range memberships {
		if wsFilter != nil && m.WorkspaceID != *wsFilter {
			continue
		}
		allowed[m.WorkspaceID] = true
		workspaceIDs = append(workspaceIDs, m.WorkspaceID)
	}
	if wsFilter != nil && !allowed[*wsFilter] {
		writeError(w, http.StatusForbidden, "you are not a member of this workspace")
		return
	}
	if len(workspaceIDs) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"users": []models.User{}})
		return
	}
	wmDocs := []models.WorkspaceMember{}
	cur, err := s.workspaceMembers().Find(r.Context(), bson.M{"workspaceId": bson.M{"$in": workspaceIDs}})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load people")
		return
	}
	_ = cur.All(r.Context(), &wmDocs)
	userIDs := []primitive.ObjectID{}
	seen := map[primitive.ObjectID]bool{}
	for _, m := range wmDocs {
		if !seen[m.UserID] {
			seen[m.UserID] = true
			userIDs = append(userIDs, m.UserID)
		}
	}
	users := []models.User{}
	cur, err = s.auth.Users().Find(r.Context(), bson.M{"_id": bson.M{"$in": userIDs}}, options.Find().SetSort(bson.D{{Key: "name", Value: 1}}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load people")
		return
	}
	_ = cur.All(r.Context(), &users)
	for i := range users {
		users[i].OIDCConnected = users[i].OIDCIssuer != ""
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) myItems(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	wsFilter, err := s.workspaceIDFromQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	boards, items, err := s.loadWorkspace(r.Context(), a.User.ID, wsFilter)
	if err != nil {
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "you are not a member of this workspace")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not load your work")
		return
	}
	out := []BoardItem{}
	userID := a.User.ID.Hex()
	for _, it := range items {
		b := boards[it.BoardID]
		if b == nil {
			continue
		}
		if itemAssignedTo(b, &it, userID) {
			out = append(out, BoardItem{Item: it, BoardName: b.Name, BoardColor: b.Color, BoardIcon: b.Icon, BoardColumns: b.Columns})
		}
	}
	if len(out) > 60 {
		out = out[:60]
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	wsFilter, err := s.workspaceIDFromQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	boardsMap, items, err := s.loadWorkspace(r.Context(), a.User.ID, wsFilter)
	if err != nil {
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "you are not a member of this workspace")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not load dashboard")
		return
	}
	boards := make([]models.Board, 0, len(boardsMap))
	for _, b := range boardsMap {
		boards = append(boards, *b)
	}
	// Sort most recently updated first.
	for i := 1; i < len(boards); i++ {
		for j := i; j > 0 && boards[j].UpdatedAt.After(boards[j-1].UpdatedAt); j-- {
			boards[j], boards[j-1] = boards[j-1], boards[j]
		}
	}

	byBoard := map[string][]models.Item{}
	done, inProgress, mine := 0, 0, 0
	userID := a.User.ID.Hex()
	myBoardItems := []BoardItem{}
	for _, it := range items {
		b := boardsMap[it.BoardID]
		if b == nil {
			continue
		}
		byBoard[it.BoardID.Hex()] = append(byBoard[it.BoardID.Hex()], it)
		if itemIsDone(b, &it) {
			done++
		}
		if itemInProgress(b, &it) {
			inProgress++
		}
		if itemAssignedTo(b, &it, userID) {
			mine++
			myBoardItems = append(myBoardItems, BoardItem{Item: it, BoardName: b.Name, BoardColor: b.Color, BoardIcon: b.Icon, BoardColumns: b.Columns})
		}
	}

	summaries := make([]models.BoardSummary, 0, len(boards))
	for _, b := range boards {
		bitems := byBoard[b.ID.Hex()]
		bDone := 0
		for i := range bitems {
			if itemIsDone(&b, &bitems[i]) {
				bDone++
			}
		}
		summaries = append(summaries, models.BoardSummary{Board: b, ItemCount: len(bitems), DoneCount: bDone})
	}
	if len(summaries) > 6 {
		summaries = summaries[:6]
	}
	if len(myBoardItems) > 5 {
		myBoardItems = myBoardItems[:5]
	}

	activity := []BoardActivityItem{}
	cur, err := s.db.Database.Collection("activities").Find(r.Context(), bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(10))
	if err == nil {
		var acts []models.Activity
		_ = cur.All(r.Context(), &acts)
		for _, act := range acts {
			b := boardsMap[act.BoardID]
			if b == nil {
				continue
			}
			activity = append(activity, BoardActivityItem{Activity: act, BoardName: b.Name, BoardColor: b.Color})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"stats": map[string]int{
			"boards":     len(boards),
			"items":      len(items),
			"myItems":    mine,
			"inProgress": inProgress,
			"done":       done,
		},
		"boards":   summaries,
		"myItems":  myBoardItems,
		"activity": activity,
	})
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) < 1 {
		writeJSON(w, http.StatusOK, map[string]any{"results": []any{}})
		return
	}
	if len([]rune(q)) > 100 {
		q = string([]rune(q)[:100])
	}
	wsFilter, err := s.workspaceIDFromQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	boardsMap, items, err := s.loadWorkspace(r.Context(), a.User.ID, wsFilter)
	if err != nil {
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "you are not a member of this workspace")
			return
		}
		writeError(w, http.StatusInternalServerError, "search failed")
		return
	}
	needle := strings.ToLower(q)
	results := []map[string]any{}
	for _, it := range items {
		if !strings.Contains(strings.ToLower(it.Name), needle) {
			continue
		}
		b := boardsMap[it.BoardID]
		if b == nil {
			continue
		}
		results = append(results, map[string]any{
			"itemId":     it.ID.Hex(),
			"name":       it.Name,
			"boardId":    b.ID.Hex(),
			"boardName":  b.Name,
			"boardColor": b.Color,
			"boardIcon":  b.Icon,
			"updatedAt":  it.UpdatedAt,
		})
		if len(results) >= 25 {
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

// ---------- helpers ----------

func (s *Server) loadWorkspace(ctx context.Context, userID primitive.ObjectID, workspaceFilter *primitive.ObjectID) (map[primitive.ObjectID]*models.Board, []models.Item, error) {
	boards, err := s.accessibleBoards(ctx, userID, workspaceFilter)
	if err != nil {
		return nil, nil, err
	}
	boardMap := make(map[primitive.ObjectID]*models.Board, len(boards))
	boardIDs := make([]primitive.ObjectID, 0, len(boards))
	for i := range boards {
		boardMap[boards[i].ID] = &boards[i]
		boardIDs = append(boardIDs, boards[i].ID)
	}
	if len(boardIDs) == 0 {
		return boardMap, []models.Item{}, nil
	}
	items := []models.Item{}
	cur, err := s.db.Database.Collection("items").Find(ctx, bson.M{"boardId": bson.M{"$in": boardIDs}}, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, nil, err
	}
	if err := cur.All(ctx, &items); err != nil {
		return nil, nil, err
	}
	return boardMap, items, nil
}

func itemAssignedTo(board *models.Board, item *models.Item, userID string) bool {
	for _, col := range board.Columns {
		if col.Type != "people" {
			continue
		}
		raw, ok := item.Values[col.ID]
		if !ok {
			continue
		}
		switch val := raw.(type) {
		case []string:
			for _, id := range val {
				if id == userID {
					return true
				}
			}
		case []any:
			for _, x := range val {
				if id, ok := x.(string); ok && id == userID {
					return true
				}
			}
		case primitive.A:
			for _, x := range val {
				if id, ok := x.(string); ok && id == userID {
					return true
				}
			}
		case string:
			if val == userID {
				return true
			}
		}
	}
	return false
}
