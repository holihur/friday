package api

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

type BoardMemberView struct {
	User          models.User `json:"user"`
	Role          string      `json:"role"`
	Explicit      bool        `json:"explicit"`
	IsOwner       bool        `json:"isOwner"`
	WorkspaceRole string      `json:"workspaceRole"`
}

type BoardMembersPayload struct {
	Visibility string            `json:"visibility"`
	Members    []BoardMemberView `json:"members"`
}

func (s *Server) boardMembersPayload(r *http.Request, board *models.Board) (BoardMembersPayload, error) {
	ctx := r.Context()
	wmDocs := []models.WorkspaceMember{}
	cur, err := s.workspaceMembers().Find(ctx, bson.M{"workspaceId": board.WorkspaceID})
	if err != nil {
		return BoardMembersPayload{}, err
	}
	if err := cur.All(ctx, &wmDocs); err != nil {
		return BoardMembersPayload{}, err
	}
	wsRole := map[primitive.ObjectID]string{}
	userIDs := make([]primitive.ObjectID, 0, len(wmDocs))
	for _, m := range wmDocs {
		wsRole[m.UserID] = m.Role
		userIDs = append(userIDs, m.UserID)
	}
	users := []models.User{}
	cur, err = s.auth.Users().Find(ctx, bson.M{"_id": bson.M{"$in": userIDs}})
	if err != nil {
		return BoardMembersPayload{}, err
	}
	if err := cur.All(ctx, &users); err != nil {
		return BoardMembersPayload{}, err
	}
	explicit := map[primitive.ObjectID]string{}
	for _, m := range board.Members {
		explicit[m.UserID] = m.Role
	}
	out := make([]BoardMemberView, 0, len(users))
	for i := range users {
		u := users[i]
		access := buildBoardAccess(board, u.ID, wsRole[u.ID])
		role := access.BoardRole
		if role == "" {
			role = "none"
		}
		u.OIDCConnected = u.OIDCIssuer != ""
		out = append(out, BoardMemberView{
			User:          u,
			Role:          role,
			Explicit:      explicit[u.ID] != "",
			IsOwner:       board.OwnerID == u.ID,
			WorkspaceRole: wsRole[u.ID],
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if roleRank(out[i].Role) != roleRank(out[j].Role) {
			return roleRank(out[i].Role) > roleRank(out[j].Role)
		}
		return out[i].User.Name < out[j].User.Name
	})
	visibility := board.Visibility
	if visibility == "" {
		visibility = BoardVisibilityWorkspace
	}
	return BoardMembersPayload{Visibility: visibility, Members: out}, nil
}

func (s *Server) listBoardMembers(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	board, _, ok := s.requireBoardAccess(w, r, boardID, "admin")
	if !ok {
		return
	}
	payload, err := s.boardMembersPayload(r, board)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load board members")
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) setBoardMemberRole(w http.ResponseWriter, r *http.Request, boardID, targetID primitive.ObjectID, role string) {
	board, _, ok := s.requireBoardAccess(w, r, boardID, "admin")
	if !ok {
		return
	}
	if targetID == board.OwnerID {
		writeError(w, http.StatusBadRequest, "the board owner role cannot be changed")
		return
	}
	wsRole, err := s.workspaceRole(r.Context(), board.WorkspaceID, targetID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check workspace membership")
		return
	}
	if wsRole == "" {
		writeError(w, http.StatusBadRequest, "this person is not a member of the workspace")
		return
	}
	role = strings.TrimSpace(role)
	if role != "" && role != "none" {
		switch role {
		case "viewer", "commenter", "editor", "admin":
		default:
			writeError(w, http.StatusBadRequest, "invalid board role")
			return
		}
	}
	members := make([]models.BoardMember, 0, len(board.Members)+1)
	for _, m := range board.Members {
		if m.UserID != targetID {
			members = append(members, m)
		}
	}
	if role != "" && role != "none" {
		members = append(members, models.BoardMember{UserID: targetID, Role: role})
	}
	if _, err := s.db.Database.Collection("boards").UpdateOne(r.Context(), bson.M{"_id": board.ID}, bson.M{"$set": bson.M{"members": members, "updatedAt": time.Now()}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update board member")
		return
	}
	board.Members = members
	payload, err := s.boardMembersPayload(r, board)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load board members")
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) updateBoardMember(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	targetID, ok := pathObjectID(w, r, "userID")
	if !ok {
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	s.setBoardMemberRole(w, r, boardID, targetID, req.Role)
}

func (s *Server) deleteBoardMember(w http.ResponseWriter, r *http.Request) {
	boardID, ok := pathObjectID(w, r, "boardID")
	if !ok {
		return
	}
	targetID, ok := pathObjectID(w, r, "userID")
	if !ok {
		return
	}
	s.setBoardMemberRole(w, r, boardID, targetID, "none")
}
