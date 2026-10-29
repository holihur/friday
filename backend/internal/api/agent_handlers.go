package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/ai"
	"friday/backend/internal/models"
	"friday/backend/internal/secret"
)

type agentHistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type agentChatRequest struct {
	WorkspaceID string                `json:"workspaceId"`
	BoardID     string                `json:"boardId"`
	Message     string                `json:"message"`
	History     []agentHistoryMessage `json:"history"`
}

func (s *Server) agentActions() *mongo.Collection { return s.db.Database.Collection("agent_actions") }

func (s *Server) providerConfig(ctx context.Context, userID primitive.ObjectID) (ai.Config, error) {
	cfg, err := s.findAIConfig(ctx, userID)
	if err != nil {
		return ai.Config{}, err
	}
	if cfg == nil {
		return ai.Config{}, errors.New("AI is not configured. Add your provider API key in Settings → AI.")
	}
	key, err := secret.Decrypt(secret.Key(s.cfg), cfg.APIKeyEncrypted)
	if err != nil {
		return ai.Config{}, errors.New("could not decrypt provider key")
	}
	return ai.Config{BaseURL: cfg.BaseURL, APIKey: key, Model: cfg.Model}, nil
}

func proposalView(a *models.AgentAction) AgentProposalView {
	return AgentProposalView{ID: a.ID, Type: a.Type, Summary: a.Summary, Payload: a.Payload}
}

func (s *Server) agentChat(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	var req agentChatRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" || len([]rune(req.Message)) > 4000 {
		writeError(w, http.StatusBadRequest, "message is required (max 4000 characters)")
		return
	}
	if ok, retry := s.limiter.allow("agent:"+a.User.ID.Hex(), 30, time.Minute); !ok {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", int(retry.Seconds())))
		writeError(w, http.StatusTooManyRequests, "too many agent requests, please try again later")
		return
	}
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
			writeError(w, http.StatusBadRequest, "workspaceId is required")
			return
		}
		workspaceID = memberships[0].WorkspaceID
	}
	wsRole, err := s.workspaceRole(r.Context(), workspaceID, a.User.ID)
	if err != nil || wsRole == "" {
		writeError(w, http.StatusForbidden, "you are not a member of this workspace")
		return
	}
	ws, _ := s.workspaceByID(r.Context(), workspaceID)
	var currentBoard *models.Board
	var currentBoardID primitive.ObjectID
	if req.BoardID != "" {
		board, _, err := s.agentBoard(r.Context(), a.User.ID, workspaceID, req.BoardID)
		if err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		currentBoard = board
		currentBoardID = board.ID
	}
	provider, err := s.providerConfig(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	history := []ai.Message{}
	start := 0
	if len(req.History) > 12 {
		start = len(req.History) - 12
	}
	for _, h := range req.History[start:] {
		if h.Role != "user" && h.Role != "assistant" {
			continue
		}
		content := strings.TrimSpace(h.Content)
		if content == "" || len([]rune(content)) > 4000 {
			continue
		}
		history = append(history, ai.Message{Role: h.Role, Content: content})
	}
	system := fmt.Sprintf(`You are Friday AI, an assistant inside a project management application.
Use the provided tools to read data before answering. Never invent board/item/user ids.
Write tools (create_item, update_item) create proposals that require explicit user approval. Never claim a write happened.
Respect permissions and only use data returned by tools.
Answer in the same language as the user's latest message. Be concise and concrete.
Current date: %s.
Workspace: %s (%s).
Current board: %s.
`, time.Now().Format("2006-01-02"), ws.Name, workspaceID.Hex(), func() string {
		if currentBoard == nil {
			return "none (the user has not opened a board; use list_boards/get_board)"
		}
		return fmt.Sprintf("%s (%s)", currentBoard.Name, currentBoard.ID.Hex())
	}())
	messages := []ai.Message{{Role: "system", Content: system}}
	messages = append(messages, history...)
	messages = append(messages, ai.Message{Role: "user", Content: req.Message})
	tools := agentTools()
	proposals := []AgentProposalView{}
	final := ""
	for round := 0; round < 5; round++ {
		res, err := ai.Chat(r.Context(), provider, messages, tools, 1400)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		messages = append(messages, res.Message)
		if res.Message.Content != "" {
			final = res.Message.Content
		}
		if len(res.Message.ToolCalls) == 0 {
			break
		}
		toolMessages := []ai.Message{}
		stoppedForApproval := false
		for _, call := range res.Message.ToolCalls {
			switch call.Function.Name {
			case toolListBoards, toolGetBoard, toolSearchItems, toolListPeople:
				result, err := s.agentReadTool(r.Context(), a.User, workspaceID, currentBoardID, call.Function.Name, json.RawMessage(call.Function.Arguments))
				if err != nil {
					result = map[string]any{"error": err.Error()}
				}
				data, _ := json.Marshal(result)
				toolMessages = append(toolMessages, ai.Message{Role: "tool", ToolCallID: call.ID, Name: call.Function.Name, Content: string(data)})
			case toolCreateItem, toolUpdateItem:
				action, err := s.proposeAgentTool(r.Context(), a.User, workspaceID, currentBoardID, call.Function.Name, json.RawMessage(call.Function.Arguments))
				if err != nil {
					data, _ := json.Marshal(map[string]any{"error": err.Error()})
					toolMessages = append(toolMessages, ai.Message{Role: "tool", ToolCallID: call.ID, Name: call.Function.Name, Content: string(data)})
					continue
				}
				proposals = append(proposals, proposalView(action))
				stoppedForApproval = true
			default:
				data, _ := json.Marshal(map[string]any{"error": "unknown tool"})
				toolMessages = append(toolMessages, ai.Message{Role: "tool", ToolCallID: call.ID, Name: call.Function.Name, Content: string(data)})
			}
		}
		if stoppedForApproval {
			break
		}
		messages = append(messages, toolMessages...)
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": final, "proposals": proposals})
}

func (s *Server) approveAgentAction(w http.ResponseWriter, r *http.Request) {
	actionID, err := primitive.ObjectIDFromHex(r.PathValue("actionID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid action id")
		return
	}
	a := authFrom(r)
	var action models.AgentAction
	if err := s.agentActions().FindOne(r.Context(), bson.M{"_id": actionID, "userId": a.User.ID}).Decode(&action); err != nil {
		writeError(w, http.StatusNotFound, "agent action not found")
		return
	}
	if action.Status != "pending" {
		writeError(w, http.StatusConflict, "this action has already been handled")
		return
	}
	if time.Since(action.CreatedAt) > 2*time.Hour {
		writeError(w, http.StatusGone, "this action has expired")
		return
	}
	item, err := s.executeAgentAction(r.Context(), a.User, &action)
	if err != nil {
		_, _ = s.agentActions().UpdateOne(r.Context(), bson.M{"_id": action.ID}, bson.M{"$set": bson.M{"status": "failed", "error": err.Error()}})
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := time.Now()
	_, _ = s.agentActions().UpdateOne(r.Context(), bson.M{"_id": action.ID}, bson.M{"$set": bson.M{"status": "executed", "executedAt": now}})
	action.Status = "executed"
	action.ExecutedAt = &now
	writeJSON(w, http.StatusOK, map[string]any{"action": action, "item": item})
}

func (s *Server) rejectAgentAction(w http.ResponseWriter, r *http.Request) {
	actionID, err := primitive.ObjectIDFromHex(r.PathValue("actionID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid action id")
		return
	}
	a := authFrom(r)
	res, err := s.agentActions().UpdateOne(r.Context(), bson.M{"_id": actionID, "userId": a.User.ID, "status": "pending"}, bson.M{"$set": bson.M{"status": "rejected"}})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not reject action")
		return
	}
	if res.MatchedCount == 0 {
		writeError(w, http.StatusNotFound, "agent action not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) executeAgentAction(ctx context.Context, user *models.User, action *models.AgentAction) (*models.Item, error) {
	if action.BoardID == primitive.NilObjectID {
		return nil, fmt.Errorf("action has no board")
	}
	var board models.Board
	if err := s.db.Database.Collection("boards").FindOne(ctx, bson.M{"_id": action.BoardID}).Decode(&board); err != nil {
		return nil, fmt.Errorf("board not found")
	}
	access, err := s.boardAccessFor(ctx, user.ID, &board)
	if err != nil || !access.CanEdit {
		return nil, fmt.Errorf("you no longer have edit permission on this board")
	}
	switch action.Type {
	case "create_item":
		var group models.Group
		if err := s.db.Database.Collection("groups").FindOne(ctx, bson.M{"_id": action.Payload.GroupID, "boardId": board.ID}).Decode(&group); err != nil {
			return nil, fmt.Errorf("group no longer exists")
		}
		maxPos := float64(0)
		var last []models.Item
		cur, _ := s.db.Database.Collection("items").Find(ctx, bson.M{"groupId": group.ID}, options.Find().SetSort(bson.D{{Key: "position", Value: -1}}).SetLimit(1))
		if cur != nil {
			_ = cur.All(ctx, &last)
		}
		if len(last) > 0 {
			maxPos = last[0].Position
		}
		now := time.Now()
		item := models.Item{
			ID: primitive.NewObjectID(), BoardID: board.ID, GroupID: group.ID, Name: action.Payload.ItemName,
			Position: maxPos + 1024, Values: action.Payload.Values, CreatedBy: user.ID, CreatedAt: now, UpdatedAt: now,
		}
		if item.Values == nil {
			item.Values = map[string]any{}
		}
		if _, err := s.db.Database.Collection("items").InsertOne(ctx, item); err != nil {
			return nil, err
		}
		_, _ = s.db.Database.Collection("boards").UpdateOne(ctx, bson.M{"_id": board.ID}, bson.M{"$set": bson.M{"updatedAt": now}})
		s.logActivity(ctx, board.ID, item.ID, user, "created item", item.Name, "via Friday AI")
		return &item, nil
	case "update_item":
		var item models.Item
		if err := s.db.Database.Collection("items").FindOne(ctx, bson.M{"_id": action.Payload.ItemID, "boardId": board.ID}).Decode(&item); err != nil {
			return nil, fmt.Errorf("item no longer exists")
		}
		if item.Values == nil {
			item.Values = map[string]any{}
		}
		for k, v := range action.Payload.Values {
			if k == "__name" {
				continue
			}
			item.Values[k] = v
		}
		if name, ok := action.Payload.Values["__name"].(string); ok && name != "" {
			item.Name = name
		}
		if action.Payload.GroupID != primitive.NilObjectID {
			var group models.Group
			if err := s.db.Database.Collection("groups").FindOne(ctx, bson.M{"_id": action.Payload.GroupID, "boardId": board.ID}).Decode(&group); err != nil {
				return nil, fmt.Errorf("target group no longer exists")
			}
			item.GroupID = group.ID
		}
		item.UpdatedAt = time.Now()
		if _, err := s.db.Database.Collection("items").ReplaceOne(ctx, bson.M{"_id": item.ID}, item); err != nil {
			return nil, err
		}
		_, _ = s.db.Database.Collection("boards").UpdateOne(ctx, bson.M{"_id": board.ID}, bson.M{"$set": bson.M{"updatedAt": time.Now()}})
		details := []string{}
		for _, c := range action.Payload.Changes {
			details = append(details, c.Field)
		}
		s.logActivity(ctx, board.ID, item.ID, user, "updated item", item.Name, strings.Join(details, ", ")+" via Friday AI")
		return &item, nil
	default:
		return nil, fmt.Errorf("unsupported action type")
	}
}
