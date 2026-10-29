package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/models"
)

func (s *Server) listBoards(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	a := authFrom(r)
	wsFilter, err := s.workspaceIDFromQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	boards, err := s.accessibleBoards(ctx, a.User.ID, wsFilter)
	if err != nil {
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "you are not a member of this workspace")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not load boards")
		return
	}
	if len(boards) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"boards": []models.BoardSummary{}})
		return
	}
	ids := make([]primitive.ObjectID, 0, len(boards))
	for _, b := range boards {
		ids = append(ids, b.ID)
	}
	itemCur, err := s.db.Database.Collection("items").Find(ctx, bson.M{"boardId": bson.M{"$in": ids}}, options.Find().SetProjection(bson.M{"boardId": 1, "values": 1}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load board stats")
		return
	}
	items := []models.Item{}
	if err := itemCur.All(ctx, &items); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load board stats")
		return
	}
	byBoard := map[primitive.ObjectID][]models.Item{}
	for _, it := range items {
		byBoard[it.BoardID] = append(byBoard[it.BoardID], it)
	}
	out := make([]models.BoardSummary, 0, len(boards))
	for i := range boards {
		done := 0
		for j := range byBoard[boards[i].ID] {
			if itemIsDone(&boards[i], &byBoard[boards[i].ID][j]) {
				done++
			}
		}
		out = append(out, models.BoardSummary{Board: boards[i], ItemCount: len(byBoard[boards[i].ID]), DoneCount: done})
	}
	writeJSON(w, http.StatusOK, map[string]any{"boards": out})
}

func (s *Server) getBoard(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	ctx := r.Context()
	board, access, ok := s.requireBoardAccess(w, r, boardID, "read")
	if !ok {
		return
	}

	groups := []models.Group{}
	cur, err := s.db.Database.Collection("groups").Find(ctx, bson.M{"boardId": boardID}, options.Find().SetSort(bson.D{{Key: "position", Value: 1}}))
	if err == nil {
		_ = cur.All(ctx, &groups)
	}
	items := []models.Item{}
	cur, err = s.db.Database.Collection("items").Find(ctx, bson.M{"boardId": boardID}, options.Find().SetSort(bson.D{{Key: "position", Value: 1}}))
	if err == nil {
		_ = cur.All(ctx, &items)
	}
	activity := []models.Activity{}
	cur, err = s.db.Database.Collection("activities").Find(ctx, bson.M{"boardId": boardID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(60))
	if err == nil {
		_ = cur.All(ctx, &activity)
	}
	writeJSON(w, http.StatusOK, models.BoardPayload{
		Board:    *board,
		Groups:   groups,
		Items:    items,
		Activity: activity,
		Permissions: &models.BoardPermissions{
			Role:       access.BoardRole,
			CanComment: access.CanComment,
			CanEdit:    access.CanEdit,
			CanAdmin:   access.CanAdmin,
		},
	})
}

func (s *Server) createBoard(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WorkspaceID string `json:"workspaceId"`
		Name        string `json:"name"`
		Color       string `json:"color"`
		Icon        string `json:"icon"`
		Template    string `json:"template"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "board name is required")
		return
	}
	if req.Color != "" && !hexColorRe.MatchString(req.Color) {
		writeError(w, http.StatusBadRequest, "color must be a hex color")
		return
	}
	a := authFrom(r)
	var workspaceID primitive.ObjectID
	if req.WorkspaceID != "" {
		id, err := primitive.ObjectIDFromHex(req.WorkspaceID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid workspaceId")
			return
		}
		workspaceID = id
	} else {
		memberships, err := s.listUserMemberships(r.Context(), a.User.ID)
		if err != nil || len(memberships) == 0 {
			ws, err := s.ensurePersonalWorkspace(r.Context(), a.User)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "could not resolve workspace")
				return
			}
			workspaceID = ws.ID
		} else {
			workspaceID = memberships[0].WorkspaceID
		}
	}
	role, err := s.workspaceRole(r.Context(), workspaceID, a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check workspace access")
		return
	}
	if role == "" || role == WorkspaceRoleGuest {
		writeError(w, http.StatusForbidden, "guests cannot create boards")
		return
	}
	board, groups, err := s.createBoardDoc(r.Context(), a.User, workspaceID, req.Name, req.Color, req.Icon, req.Template)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create board")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"board": board, "groups": groups})
}

func (s *Server) updateBoard(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	board, access, ok := s.requireBoardAccess(w, r, boardID, "write")
	if !ok {
		return
	}
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Color       *string `json:"color"`
		Icon        *string `json:"icon"`
		Visibility  *string `json:"visibility"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	set := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		name := cleanName(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "board name cannot be empty")
			return
		}
		set["name"] = name
	}
	if req.Description != nil {
		set["description"] = cleanName(*req.Description)
	}
	if req.Color != nil {
		if !hexColorRe.MatchString(*req.Color) {
			writeError(w, http.StatusBadRequest, "color must be a hex color")
			return
		}
		set["color"] = *req.Color
	}
	if req.Icon != nil {
		set["icon"] = cleanName(*req.Icon)
	}
	if req.Visibility != nil {
		if !access.CanAdmin {
			writeError(w, http.StatusForbidden, "only board admins can change visibility")
			return
		}
		if *req.Visibility != BoardVisibilityWorkspace && *req.Visibility != BoardVisibilityPrivate {
			writeError(w, http.StatusBadRequest, "visibility must be workspace or private")
			return
		}
		set["visibility"] = *req.Visibility
	}
	res, err := s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": board.ID}, bson.M{"$set": set})
	if err != nil || res.MatchedCount == 0 {
		writeError(w, http.StatusNotFound, "board not found")
		return
	}
	var updated models.Board
	_ = s.db.Database.Collection("boards").FindOne(r.Context(), bson.M{"_id": board.ID}).Decode(&updated)
	writeJSON(w, http.StatusOK, map[string]any{"board": updated})
}

func (s *Server) deleteBoard(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	board, access, ok := s.requireBoardAccess(w, r, boardID, "admin")
	if !ok {
		return
	}
	if !access.CanAdmin {
		writeError(w, http.StatusForbidden, "only board admins can delete a board")
		return
	}
	ctx := r.Context()
	res, err := s.db.Database.Collection("boards").DeleteOne(ctx, bson.M{"_id": board.ID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete board")
		return
	}
	if res.DeletedCount == 0 {
		writeError(w, http.StatusNotFound, "board not found")
		return
	}
	_, _ = s.db.Database.Collection("groups").DeleteMany(ctx, bson.M{"boardId": board.ID})
	_, _ = s.db.Database.Collection("items").DeleteMany(ctx, bson.M{"boardId": board.ID})
	_, _ = s.db.Database.Collection("comments").DeleteMany(ctx, bson.M{"boardId": board.ID})
	_, _ = s.db.Database.Collection("activities").DeleteMany(ctx, bson.M{"boardId": board.ID})
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Columns ----------

func (s *Server) createColumn(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	var req struct {
		Title string `json:"title"`
		Type  string `json:"type"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title = cleanName(req.Title); req.Title == "" {
		writeError(w, http.StatusBadRequest, "column title is required")
		return
	}
	switch req.Type {
	case "status", "text", "people", "date", "priority", "numbers", "checkbox":
	default:
		writeError(w, http.StatusBadRequest, "unsupported column type")
		return
	}
	board, _, ok := s.requireBoardAccess(w, r, boardID, "write")
	if !ok {
		return
	}
	col := models.Column{
		ID:     shortID("col_"),
		Title:  req.Title,
		Type:   req.Type,
		Width:  defaultColumnWidth(req.Type),
		Labels: defaultLabelsFor(req.Type),
	}
	board.Columns = append(board.Columns, col)
	if _, err := s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": boardID}, bson.M{"$set": bson.M{"columns": board.Columns, "updatedAt": time.Now()}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not add column")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"board": board, "column": col})
}

func (s *Server) updateColumn(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	columnID := r.PathValue("columnID")
	var req struct {
		Title  *string        `json:"title"`
		Width  *int           `json:"width"`
		Labels []models.Label `json:"labels"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	board, _, ok := s.requireBoardAccess(w, r, boardID, "write")
	if !ok {
		return
	}
	found := false
	for i := range board.Columns {
		if board.Columns[i].ID != columnID {
			continue
		}
		found = true
		if req.Title != nil {
			if t := cleanName(*req.Title); t != "" {
				board.Columns[i].Title = t
			}
		}
		if req.Width != nil && *req.Width >= 70 && *req.Width <= 600 {
			board.Columns[i].Width = *req.Width
		}
		if req.Labels != nil {
			for _, l := range req.Labels {
				if !hexColorRe.MatchString(l.Color) {
					writeError(w, http.StatusBadRequest, "label colors must be hex colors")
					return
				}
			}
			board.Columns[i].Labels = req.Labels
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "column not found")
		return
	}
	if _, err := s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": boardID}, bson.M{"$set": bson.M{"columns": board.Columns, "updatedAt": time.Now()}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update column")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"board": board})
}

func (s *Server) deleteColumn(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	columnID := r.PathValue("columnID")
	board, _, ok := s.requireBoardAccess(w, r, boardID, "write")
	if !ok {
		return
	}
	found := false
	cols := make([]models.Column, 0, len(board.Columns))
	for _, c := range board.Columns {
		if c.ID == columnID {
			found = true
			continue
		}
		cols = append(cols, c)
	}
	if !found {
		writeError(w, http.StatusNotFound, "column not found")
		return
	}
	if _, err := s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": boardID}, bson.M{"$set": bson.M{"columns": cols, "updatedAt": time.Now()}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete column")
		return
	}
	_, _ = s.db.Database.Collection("items").UpdateMany(r.Context(), bson.M{"boardId": boardID}, bson.M{"$unset": bson.M{"values." + columnID: ""}})
	board.Columns = cols
	writeJSON(w, http.StatusOK, map[string]any{"board": board})
}

// ---------- Groups ----------

func (s *Server) createGroup(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	var req struct {
		Title string `json:"title"`
		Color string `json:"color"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Title = cleanName(req.Title)
	if req.Title == "" {
		req.Title = "New group"
	}
	if req.Color != "" && !hexColorRe.MatchString(req.Color) {
		writeError(w, http.StatusBadRequest, "color must be a hex color")
		return
	}
	if req.Color == "" {
		req.Color = "#6161ff"
	}
	if _, _, ok := s.requireBoardAccess(w, r, boardID, "write"); !ok {
		return
	}
	// "position" is reserved in MongoDB aggregation output; use a field named "position".
	maxPos := float64(0)
	var last []models.Group
	cur, _ := s.db.Database.Collection("groups").Find(r.Context(), bson.M{"boardId": boardID}, options.Find().SetSort(bson.D{{Key: "position", Value: -1}}).SetLimit(1))
	if cur != nil {
		_ = cur.All(r.Context(), &last)
	}
	if len(last) > 0 {
		maxPos = last[0].Position
	}
	now := time.Now()
	g := models.Group{
		ID:        primitive.NewObjectID(),
		BoardID:   boardID,
		Title:     req.Title,
		Color:     req.Color,
		Position:  maxPos + 1024,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.db.Database.Collection("groups").InsertOne(r.Context(), g); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create group")
		return
	}
	_, _ = s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": boardID}, bson.M{"$set": bson.M{"updatedAt": now}})
	writeJSON(w, http.StatusCreated, map[string]any{"group": g})
}

func (s *Server) updateGroup(w http.ResponseWriter, r *http.Request) {
	groupID, ok := pathObjectID(w, r, "groupID")
	if !ok {
		return
	}
	var req struct {
		Title     *string  `json:"title"`
		Color     *string  `json:"color"`
		Collapsed *bool    `json:"collapsed"`
		Position  *float64 `json:"position"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	set := bson.M{"updatedAt": time.Now()}
	if req.Title != nil {
		t := cleanName(*req.Title)
		if t == "" {
			writeError(w, http.StatusBadRequest, "group title cannot be empty")
			return
		}
		set["title"] = t
	}
	if req.Color != nil {
		if !hexColorRe.MatchString(*req.Color) {
			writeError(w, http.StatusBadRequest, "color must be a hex color")
			return
		}
		set["color"] = *req.Color
	}
	if req.Collapsed != nil {
		set["collapsed"] = *req.Collapsed
	}
	if req.Position != nil {
		set["position"] = *req.Position
	}
	var existing models.Group
	if err := s.db.Database.Collection("groups").FindOne(r.Context(), bson.M{"_id": groupID}).Decode(&existing); err != nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	if _, _, ok := s.requireBoardAccess(w, r, existing.BoardID, "write"); !ok {
		return
	}
	var g models.Group
	err := s.db.Database.Collection("groups").FindOneAndUpdate(r.Context(), bson.M{"_id": groupID}, bson.M{"$set": set}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&g)
	if err != nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	_, _ = s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": g.BoardID}, bson.M{"$set": bson.M{"updatedAt": time.Now()}})
	writeJSON(w, http.StatusOK, map[string]any{"group": g})
}

func (s *Server) deleteGroup(w http.ResponseWriter, r *http.Request) {
	groupID, ok := pathObjectID(w, r, "groupID")
	if !ok {
		return
	}
	var g models.Group
	if err := s.db.Database.Collection("groups").FindOne(r.Context(), bson.M{"_id": groupID}).Decode(&g); err != nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	if _, _, ok := s.requireBoardAccess(w, r, g.BoardID, "write"); !ok {
		return
	}
	itemIDs := []primitive.ObjectID{}
	cur, _ := s.db.Database.Collection("items").Find(r.Context(), bson.M{"groupId": groupID}, options.Find().SetProjection(bson.M{"_id": 1}))
	if cur != nil {
		var docs []struct {
			ID primitive.ObjectID `bson:"_id"`
		}
		_ = cur.All(r.Context(), &docs)
		for _, d := range docs {
			itemIDs = append(itemIDs, d.ID)
		}
	}
	_, _ = s.db.Database.Collection("groups").DeleteOne(r.Context(), bson.M{"_id": groupID})
	if len(itemIDs) > 0 {
		_, _ = s.db.Database.Collection("items").DeleteMany(r.Context(), bson.M{"_id": bson.M{"$in": itemIDs}})
		_, _ = s.db.Database.Collection("comments").DeleteMany(r.Context(), bson.M{"itemId": bson.M{"$in": itemIDs}})
	}
	_, _ = s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": g.BoardID}, bson.M{"$set": bson.M{"updatedAt": time.Now()}})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) boardActivity(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	if _, _, ok := s.requireBoardAccess(w, r, boardID, "read"); !ok {
		return
	}
	activity := []models.Activity{}
	cur, err := s.db.Database.Collection("activities").Find(r.Context(), bson.M{"boardId": boardID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100))
	if err == nil {
		_ = cur.All(r.Context(), &activity)
	}
	writeJSON(w, http.StatusOK, map[string]any{"activity": activity})
}

func (s *Server) getBoardDoc(r *http.Request, boardID primitive.ObjectID) (*models.Board, error) {
	var board models.Board
	err := s.db.Database.Collection("boards").FindOne(r.Context(), bson.M{"_id": boardID}).Decode(&board)
	return &board, err
}
