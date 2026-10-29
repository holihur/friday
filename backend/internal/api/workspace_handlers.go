package api

import (
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/auth"
	"friday/backend/internal/mail"
	"friday/backend/internal/models"
)

type WorkspaceView struct {
	models.Workspace
	Role        string `json:"role"`
	MemberCount int    `json:"memberCount"`
	BoardCount  int    `json:"boardCount"`
}

type WorkspaceMemberView struct {
	User     models.User `json:"user"`
	Role     string      `json:"role"`
	JoinedAt time.Time   `json:"joinedAt"`
}

type InvitationView struct {
	models.Invitation
	WorkspaceName string `json:"workspaceName,omitempty"`
	InviterName   string `json:"inviterName,omitempty"`
	InviteURL     string `json:"inviteUrl,omitempty"`
}

func workspaceRank(role string) int {
	switch role {
	case WorkspaceRoleOwner:
		return 4
	case WorkspaceRoleAdmin:
		return 3
	case WorkspaceRoleMember:
		return 2
	case WorkspaceRoleGuest:
		return 1
	default:
		return 0
	}
}

func (s *Server) requireWorkspaceRole(w http.ResponseWriter, r *http.Request, workspaceID primitive.ObjectID, min string) (string, bool) {
	role, err := s.workspaceRole(r.Context(), workspaceID, authFrom(r).User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check workspace access")
		return "", false
	}
	if role == "" {
		writeError(w, http.StatusForbidden, "you are not a member of this workspace")
		return "", false
	}
	if workspaceRank(role) < workspaceRank(min) {
		writeError(w, http.StatusForbidden, "you do not have permission to do that")
		return "", false
	}
	return role, true
}

func (s *Server) workspaceView(ctx *http.Request, ws *models.Workspace, role string) WorkspaceView {
	memberCount, _ := s.workspaceMembers().CountDocuments(ctx.Context(), bson.M{"workspaceId": ws.ID})
	boardCount, _ := s.db.Database.Collection("boards").CountDocuments(ctx.Context(), bson.M{"workspaceId": ws.ID})
	return WorkspaceView{Workspace: *ws, Role: role, MemberCount: int(memberCount), BoardCount: int(boardCount)}
}

func (s *Server) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	memberships, err := s.listUserMemberships(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load workspaces")
		return
	}
	if len(memberships) == 0 {
		if _, err := s.ensurePersonalWorkspace(r.Context(), a.User); err != nil {
			writeError(w, http.StatusInternalServerError, "could not load workspaces")
			return
		}
		memberships, _ = s.listUserMemberships(r.Context(), a.User.ID)
	}
	ids := make([]primitive.ObjectID, 0, len(memberships))
	roleByID := map[primitive.ObjectID]string{}
	for _, m := range memberships {
		ids = append(ids, m.WorkspaceID)
		roleByID[m.WorkspaceID] = m.Role
	}
	workspaces := []models.Workspace{}
	cur, err := s.workspaces().Find(r.Context(), bson.M{"_id": bson.M{"$in": ids}}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load workspaces")
		return
	}
	_ = cur.All(r.Context(), &workspaces)
	out := make([]WorkspaceView, 0, len(workspaces))
	for i := range workspaces {
		out = append(out, s.workspaceView(r, &workspaces[i], roleByID[workspaces[i].ID]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": out})
}

func (s *Server) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > 80 {
		writeError(w, http.StatusBadRequest, "workspace name is required (max 80 characters)")
		return
	}
	a := authFrom(r)
	ws, err := s.createWorkspaceDoc(r.Context(), a.User, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create workspace")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"workspace": s.workspaceView(r, ws, WorkspaceRoleOwner)})
}

func (s *Server) getWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	role, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleGuest)
	if !ok {
		return
	}
	ws, err := s.workspaceByID(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspace": s.workspaceView(r, ws, role)})
}

func (s *Server) updateWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	if _, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleAdmin); !ok {
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len([]rune(name)) > 80 {
		writeError(w, http.StatusBadRequest, "workspace name is required (max 80 characters)")
		return
	}
	if _, err := s.workspaces().UpdateOne(r.Context(), bson.M{"_id": wsID}, bson.M{"$set": bson.M{"name": name, "updatedAt": time.Now()}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update workspace")
		return
	}
	ws, _ := s.workspaceByID(r.Context(), wsID)
	role, _ := s.workspaceRole(r.Context(), wsID, authFrom(r).User.ID)
	writeJSON(w, http.StatusOK, map[string]any{"workspace": s.workspaceView(r, ws, role)})
}

func (s *Server) listWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	role, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleGuest)
	if !ok {
		return
	}
	if role == WorkspaceRoleGuest {
		writeError(w, http.StatusForbidden, "guests cannot view the member directory")
		return
	}
	memberships := []models.WorkspaceMember{}
	cur, err := s.workspaceMembers().Find(r.Context(), bson.M{"workspaceId": wsID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load members")
		return
	}
	_ = cur.All(r.Context(), &memberships)
	userIDs := make([]primitive.ObjectID, 0, len(memberships))
	for _, m := range memberships {
		userIDs = append(userIDs, m.UserID)
	}
	users := []models.User{}
	cur, err = s.auth.Users().Find(r.Context(), bson.M{"_id": bson.M{"$in": userIDs}})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load members")
		return
	}
	_ = cur.All(r.Context(), &users)
	userByID := map[primitive.ObjectID]models.User{}
	for _, u := range users {
		userByID[u.ID] = u
	}
	out := make([]WorkspaceMemberView, 0, len(memberships))
	for _, m := range memberships {
		u, ok := userByID[m.UserID]
		if !ok {
			continue
		}
		u.OIDCConnected = u.OIDCIssuer != ""
		out = append(out, WorkspaceMemberView{User: u, Role: m.Role, JoinedAt: m.CreatedAt})
	}
	sort.Slice(out, func(i, j int) bool {
		if workspaceRank(out[i].Role) != workspaceRank(out[j].Role) {
			return workspaceRank(out[i].Role) > workspaceRank(out[j].Role)
		}
		return out[i].User.Name < out[j].User.Name
	})
	writeJSON(w, http.StatusOK, map[string]any{"members": out})
}

func (s *Server) updateWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	targetID, ok := pathObjectID(w, r, "userID")
	if !ok {
		return
	}
	requesterRole, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleAdmin)
	if !ok {
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if !validWorkspaceRole(req.Role) || req.Role == WorkspaceRoleOwner {
		writeError(w, http.StatusBadRequest, "invalid role")
		return
	}
	var target models.WorkspaceMember
	if err := s.workspaceMembers().FindOne(r.Context(), bson.M{"workspaceId": wsID, "userId": targetID}).Decode(&target); err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if target.Role == WorkspaceRoleOwner {
		writeError(w, http.StatusForbidden, "the workspace owner role cannot be changed")
		return
	}
	if requesterRole == WorkspaceRoleAdmin && target.Role == WorkspaceRoleAdmin {
		writeError(w, http.StatusForbidden, "only the owner can change another admin")
		return
	}
	if requesterRole == WorkspaceRoleAdmin && req.Role == WorkspaceRoleAdmin {
		writeError(w, http.StatusForbidden, "only the owner can promote an admin")
		return
	}
	if _, err := s.workspaceMembers().UpdateOne(r.Context(), bson.M{"_id": target.ID}, bson.M{"$set": bson.M{"role": req.Role, "updatedAt": time.Now()}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update member")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"role": req.Role})
}

func (s *Server) removeWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	targetID, ok := pathObjectID(w, r, "userID")
	if !ok {
		return
	}
	requesterRole, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleAdmin)
	if !ok {
		return
	}
	var target models.WorkspaceMember
	if err := s.workspaceMembers().FindOne(r.Context(), bson.M{"workspaceId": wsID, "userId": targetID}).Decode(&target); err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if target.Role == WorkspaceRoleOwner {
		writeError(w, http.StatusForbidden, "the workspace owner cannot be removed")
		return
	}
	if requesterRole == WorkspaceRoleAdmin && target.Role == WorkspaceRoleAdmin {
		writeError(w, http.StatusForbidden, "only the owner can remove another admin")
		return
	}
	if _, err := s.workspaceMembers().DeleteOne(r.Context(), bson.M{"_id": target.ID}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove member")
		return
	}
	// Remove board access for private boards, and demote board ownership to the workspace owner.
	_, _ = s.db.Database.Collection("boards").UpdateMany(r.Context(), bson.M{"workspaceId": wsID}, bson.M{"$pull": bson.M{"members": bson.M{"userId": targetID}}})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createInvitation(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	requesterRole, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleAdmin)
	if !ok {
		return
	}
	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Email = auth.NormalizeEmail(req.Email)
	if !validEmail(req.Email) {
		writeError(w, http.StatusBadRequest, "please enter a valid email address")
		return
	}
	if req.Role == "" {
		req.Role = WorkspaceRoleMember
	}
	if !validInviteRole(req.Role) {
		writeError(w, http.StatusBadRequest, "invalid role")
		return
	}
	if requesterRole == WorkspaceRoleAdmin && req.Role == WorkspaceRoleAdmin {
		writeError(w, http.StatusForbidden, "only the owner can invite admins")
		return
	}
	if existing, err := s.auth.FindUserByEmail(r.Context(), req.Email); err == nil && existing != nil {
		if role, _ := s.workspaceRole(r.Context(), wsID, existing.ID); role != "" {
			writeError(w, http.StatusConflict, "this person is already a member")
			return
		}
	}
	_, _ = s.invitations().DeleteMany(r.Context(), bson.M{"workspaceId": wsID, "email": req.Email})
	raw, hash := newInviteToken()
	now := time.Now()
	inv := models.Invitation{
		ID:          primitive.NewObjectID(),
		WorkspaceID: wsID,
		Email:       req.Email,
		Role:        req.Role,
		TokenHash:   hash,
		InvitedBy:   authFrom(r).User.ID,
		ExpiresAt:   now.AddDate(0, 0, 7),
		CreatedAt:   now,
	}
	if _, err := s.invitations().InsertOne(r.Context(), inv); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create invitation")
		return
	}
	ws, _ := s.workspaceByID(r.Context(), wsID)
	inviteURL := s.cfg.AppURL + "/invite/" + raw
	inviter := authFrom(r).User
	emailSent := false
	if s.mail.Enabled() {
		subject := fmt.Sprintf("You're invited to %s on Friday", ws.Name)
		text := fmt.Sprintf("Hi,\n\n%s invited you to join the %s workspace on Friday as %s.\n\nAccept the invitation:\n%s\n\nThis link expires in 7 days. If you were not expecting this, you can ignore the email.\n", inviter.Name, ws.Name, req.Role, inviteURL)
		body := fmt.Sprintf(`<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#323338"><div style="font-size:20px;font-weight:800;color:#6161ff;margin-bottom:16px">Friday</div><p>Hi,</p><p><strong>%s</strong> invited you to join <strong>%s</strong> as <strong>%s</strong>.</p><p style="margin:24px 0"><a href="%s" style="background:#6161ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Accept invitation</a></p><p style="color:#676879;font-size:12px">This link expires in 7 days.</p></div>`, html.EscapeString(inviter.Name), html.EscapeString(ws.Name), html.EscapeString(req.Role), html.EscapeString(inviteURL))
		if err := s.mail.Send(r.Context(), mail.Message{To: req.Email, Subject: subject, Text: text, HTML: body}); err != nil {
			slog.Warn("could not send invitation email", "to", req.Email, "error", err)
		} else {
			emailSent = true
		}
	}
	slog.Info("workspace invitation created", "workspace", ws.Name, "email", req.Email, "url", inviteURL, "emailSent", emailSent)
	writeJSON(w, http.StatusCreated, map[string]any{
		"invitation": InvitationView{Invitation: inv, WorkspaceName: ws.Name, InviterName: inviter.Name, InviteURL: inviteURL},
		"emailSent":  emailSent,
	})
}

func (s *Server) listInvitations(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	if _, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleAdmin); !ok {
		return
	}
	out := []models.Invitation{}
	cur, err := s.invitations().Find(r.Context(), bson.M{"workspaceId": wsID, "expiresAt": bson.M{"$gt": time.Now()}}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load invitations")
		return
	}
	_ = cur.All(r.Context(), &out)
	writeJSON(w, http.StatusOK, map[string]any{"invitations": out})
}

func (s *Server) revokeInvitation(w http.ResponseWriter, r *http.Request) {
	wsID, ok := pathObjectID(w, r, "workspaceID")
	if !ok {
		return
	}
	invID, ok := pathObjectID(w, r, "invitationID")
	if !ok {
		return
	}
	if _, ok := s.requireWorkspaceRole(w, r, wsID, WorkspaceRoleAdmin); !ok {
		return
	}
	res, err := s.invitations().DeleteOne(r.Context(), bson.M{"_id": invID, "workspaceId": wsID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke invitation")
		return
	}
	if res.DeletedCount == 0 {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getInvitation(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	var inv models.Invitation
	if err := s.invitations().FindOne(r.Context(), bson.M{"tokenHash": hashInviteToken(token)}).Decode(&inv); err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		writeError(w, http.StatusGone, "this invitation has expired")
		return
	}
	ws, err := s.workspaceByID(r.Context(), inv.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	inviter, _ := s.auth.FindUserByID(r.Context(), inv.InvitedBy)
	inviterName := ""
	if inviter != nil {
		inviterName = inviter.Name
	}
	writeJSON(w, http.StatusOK, InvitationView{Invitation: inv, WorkspaceName: ws.Name, InviterName: inviterName})
}

func (s *Server) acceptInvitation(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	var inv models.Invitation
	if err := s.invitations().FindOne(r.Context(), bson.M{"tokenHash": hashInviteToken(token)}).Decode(&inv); err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		_, _ = s.invitations().DeleteOne(r.Context(), bson.M{"_id": inv.ID})
		writeError(w, http.StatusGone, "this invitation has expired")
		return
	}
	a := authFrom(r)
	if auth.NormalizeEmail(a.User.Email) != inv.Email {
		writeError(w, http.StatusForbidden, "this invitation was sent to a different email address")
		return
	}
	role, err := s.workspaceRole(r.Context(), inv.WorkspaceID, a.User.ID)
	if err == nil && role == "" {
		now := time.Now()
		_, err = s.workspaceMembers().InsertOne(r.Context(), models.WorkspaceMember{
			ID:          primitive.NewObjectID(),
			WorkspaceID: inv.WorkspaceID,
			UserID:      a.User.ID,
			Role:        inv.Role,
			CreatedAt:   now,
			UpdatedAt:   now,
		})
		if err != nil && !mongo.IsDuplicateKeyError(err) {
			writeError(w, http.StatusInternalServerError, "could not accept invitation")
			return
		}
	}
	_, _ = s.invitations().DeleteOne(r.Context(), bson.M{"_id": inv.ID})
	ws, err := s.workspaceByID(r.Context(), inv.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	role, _ = s.workspaceRole(r.Context(), inv.WorkspaceID, a.User.ID)
	writeJSON(w, http.StatusOK, map[string]any{"workspace": s.workspaceView(r, ws, role)})
}
