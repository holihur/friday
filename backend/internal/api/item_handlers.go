package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/models"
)

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	if _, _, ok := s.requireBoardAccess(w, r, boardID, "read"); !ok {
		return
	}
	items := []models.Item{}
	cur, err := s.db.Database.Collection("items").Find(r.Context(), bson.M{"boardId": boardID}, options.Find().SetSort(bson.D{{Key: "position", Value: 1}}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load items")
		return
	}
	_ = cur.All(r.Context(), &items)
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) getItem(w http.ResponseWriter, r *http.Request) {
	item, ok := s.requireItemAccess(w, r, r.PathValue("itemID"), "read")
	if !ok {
		return
	}
	comments := []models.Comment{}
	cur, _ := s.db.Database.Collection("comments").Find(r.Context(), bson.M{"itemId": item.ID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if cur != nil {
		_ = cur.All(r.Context(), &comments)
	}
	writeJSON(w, http.StatusOK, map[string]any{"item": item, "comments": comments})
}

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	var req struct {
		GroupID string `json:"groupId"`
		Name    string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, _, ok := s.requireBoardAccess(w, r, boardID, "write"); !ok {
		return
	}
	groupID, err := primitive.ObjectIDFromHex(req.GroupID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid groupId")
		return
	}
	var g models.Group
	if err := s.db.Database.Collection("groups").FindOne(r.Context(), bson.M{"_id": groupID, "boardId": boardID}).Decode(&g); err != nil {
		writeError(w, http.StatusBadRequest, "group does not belong to this board")
		return
	}
	name := cleanName(req.Name)
	if name == "" {
		name = "New item"
	}
	maxPos := float64(0)
	var last []models.Item
	cur, _ := s.db.Database.Collection("items").Find(r.Context(), bson.M{"groupId": groupID}, options.Find().SetSort(bson.D{{Key: "position", Value: -1}}).SetLimit(1))
	if cur != nil {
		_ = cur.All(r.Context(), &last)
	}
	if len(last) > 0 {
		maxPos = last[0].Position
	}
	now := time.Now()
	a := authFrom(r)
	it := models.Item{
		ID:        primitive.NewObjectID(),
		BoardID:   boardID,
		GroupID:   groupID,
		Name:      name,
		Position:  maxPos + 1024,
		Values:    map[string]any{},
		CreatedBy: a.User.ID,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.db.Database.Collection("items").InsertOne(r.Context(), it); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create item")
		return
	}
	s.touchBoard(r, boardID)
	s.logActivity(r.Context(), boardID, it.ID, a.User, "created item", it.Name, "")
	writeJSON(w, http.StatusCreated, map[string]any{"item": it})
}

func (s *Server) updateItem(w http.ResponseWriter, r *http.Request) {
	itemID, err := primitive.ObjectIDFromHex(r.PathValue("itemID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	var req struct {
		Name     *string        `json:"name"`
		Values   map[string]any `json:"values"`
		GroupID  *string        `json:"groupId"`
		Position *float64       `json:"position"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	var it models.Item
	if err := s.db.Database.Collection("items").FindOne(r.Context(), bson.M{"_id": itemID}).Decode(&it); err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	board, _, ok := s.requireBoardAccess(w, r, it.BoardID, "write")
	if !ok {
		return
	}
	if it.Values == nil {
		it.Values = map[string]any{}
	}

	changed := []string{}
	if req.Name != nil {
		name := cleanName(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "item name cannot be empty")
			return
		}
		if name != it.Name {
			it.Name = name
			changed = append(changed, "name")
		}
	}
	validCols := map[string]string{}
	for _, c := range board.Columns {
		validCols[c.ID] = c.Title
	}
	for k, v := range req.Values {
		title, ok := validCols[k]
		if !ok {
			continue
		}
		if v == nil {
			delete(it.Values, k)
		} else {
			it.Values[k] = v
		}
		changed = append(changed, title)
	}
	action := "updated item"
	detail := ""
	if req.GroupID != nil {
		gid, err := primitive.ObjectIDFromHex(*req.GroupID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid groupId")
			return
		}
		var g models.Group
		if err := s.db.Database.Collection("groups").FindOne(r.Context(), bson.M{"_id": gid, "boardId": it.BoardID}).Decode(&g); err != nil {
			writeError(w, http.StatusBadRequest, "group does not belong to this board")
			return
		}
		if gid != it.GroupID {
			it.GroupID = gid
			action = "moved item"
		}
	}
	if req.Position != nil {
		it.Position = *req.Position
	}
	if len(changed) > 0 {
		detail = strings.Join(dedupe(changed), ", ")
	}
	it.UpdatedAt = time.Now()
	_, err = s.db.Database.Collection("items").ReplaceOne(r.Context(), bson.M{"_id": it.ID}, it)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update item")
		return
	}
	s.touchBoard(r, it.BoardID)
	a := authFrom(r)
	s.logActivity(r.Context(), it.BoardID, it.ID, a.User, action, it.Name, detail)
	writeJSON(w, http.StatusOK, map[string]any{"item": it})
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	item, ok := s.requireItemAccess(w, r, r.PathValue("itemID"), "write")
	if !ok {
		return
	}
	_, _ = s.db.Database.Collection("items").DeleteOne(r.Context(), bson.M{"_id": item.ID})
	_, _ = s.db.Database.Collection("comments").DeleteMany(r.Context(), bson.M{"itemId": item.ID})
	a := authFrom(r)
	s.logActivity(r.Context(), item.BoardID, item.ID, a.User, "deleted item", item.Name, "")
	s.touchBoard(r, item.BoardID)
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Comments ----------

func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	item, ok := s.requireItemAccess(w, r, r.PathValue("itemID"), "read")
	if !ok {
		return
	}
	comments := []models.Comment{}
	cur, _ := s.db.Database.Collection("comments").Find(r.Context(), bson.M{"itemId": item.ID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if cur != nil {
		_ = cur.All(r.Context(), &comments)
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": comments})
}

func (s *Server) createComment(w http.ResponseWriter, r *http.Request) {
	item, ok := s.requireItemAccess(w, r, r.PathValue("itemID"), "comment")
	if !ok {
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		writeError(w, http.StatusBadRequest, "comment cannot be empty")
		return
	}
	if len([]rune(body)) > 5000 {
		writeError(w, http.StatusBadRequest, "comment is too long")
		return
	}
	a := authFrom(r)
	c := models.Comment{
		ID:          primitive.NewObjectID(),
		ItemID:      item.ID,
		BoardID:     item.BoardID,
		UserID:      a.User.ID,
		AuthorName:  a.User.Name,
		AuthorColor: a.User.AvatarColor,
		Body:        body,
		CreatedAt:   time.Now(),
	}
	if _, err := s.db.Database.Collection("comments").InsertOne(r.Context(), c); err != nil {
		writeError(w, http.StatusInternalServerError, "could not add comment")
		return
	}
	s.logActivity(r.Context(), item.BoardID, item.ID, a.User, "commented on", item.Name, "")
	writeJSON(w, http.StatusCreated, map[string]any{"comment": c})
}

func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	commentID, err := primitive.ObjectIDFromHex(r.PathValue("commentID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid comment id")
		return
	}
	var comment models.Comment
	if err := s.db.Database.Collection("comments").FindOne(r.Context(), bson.M{"_id": commentID}).Decode(&comment); err != nil {
		writeError(w, http.StatusNotFound, "comment not found")
		return
	}
	a := authFrom(r)
	if comment.UserID != a.User.ID {
		writeError(w, http.StatusForbidden, "you can only delete your own comments")
		return
	}
	if _, _, ok := s.requireBoardAccess(w, r, comment.BoardID, "comment"); !ok {
		return
	}
	res, err := s.db.Database.Collection("comments").DeleteOne(r.Context(), bson.M{"_id": commentID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete comment")
		return
	}
	if res.DeletedCount == 0 {
		writeError(w, http.StatusNotFound, "comment not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Shared helpers ----------

func (s *Server) requireItemAccess(w http.ResponseWriter, r *http.Request, rawID, level string) (*models.Item, bool) {
	item, err := s.findItem(r, rawID)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return nil, false
	}
	if _, _, ok := s.requireBoardAccess(w, r, item.BoardID, level); !ok {
		return nil, false
	}
	return item, true
}

func (s *Server) findItem(r *http.Request, rawID string) (*models.Item, error) {
	id, err := primitive.ObjectIDFromHex(rawID)
	if err != nil {
		return nil, err
	}
	var it models.Item
	if err := s.db.Database.Collection("items").FindOne(r.Context(), bson.M{"_id": id}).Decode(&it); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, errNotFound
		}
		return nil, err
	}
	return &it, nil
}

func (s *Server) logActivity(ctx context.Context, boardID, itemID primitive.ObjectID, u *models.User, action, itemName, detail string) {
	if u == nil {
		return
	}
	act := models.Activity{
		ID:        primitive.NewObjectID(),
		BoardID:   boardID,
		ItemID:    itemID,
		UserID:    u.ID,
		UserName:  u.Name,
		UserColor: u.AvatarColor,
		Action:    action,
		ItemName:  itemName,
		Detail:    detail,
		CreatedAt: time.Now(),
	}
	_, _ = s.db.Database.Collection("activities").InsertOne(ctx, act)
}

func (s *Server) touchBoard(r *http.Request, boardID primitive.ObjectID) {
	_, _ = s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": boardID}, bson.M{"$set": bson.M{"updatedAt": time.Now()}})
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, v := range in {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
