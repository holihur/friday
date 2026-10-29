package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/models"
)

const (
	WorkspaceRoleOwner  = "owner"
	WorkspaceRoleAdmin  = "admin"
	WorkspaceRoleMember = "member"
	WorkspaceRoleGuest  = "guest"

	BoardVisibilityWorkspace = "workspace"
	BoardVisibilityPrivate   = "private"
)

var (
	errForbidden        = errors.New("forbidden")
	errWorkspaceMissing = errors.New("workspace not found")
)

func validWorkspaceRole(role string) bool {
	switch role {
	case WorkspaceRoleOwner, WorkspaceRoleAdmin, WorkspaceRoleMember, WorkspaceRoleGuest:
		return true
	}
	return false
}

func validInviteRole(role string) bool {
	return role == WorkspaceRoleAdmin || role == WorkspaceRoleMember || role == WorkspaceRoleGuest
}

func (s *Server) workspaces() *mongo.Collection { return s.db.Database.Collection("workspaces") }
func (s *Server) workspaceMembers() *mongo.Collection {
	return s.db.Database.Collection("workspace_members")
}
func (s *Server) invitations() *mongo.Collection { return s.db.Database.Collection("invitations") }

func (s *Server) workspaceRole(ctx context.Context, workspaceID, userID primitive.ObjectID) (string, error) {
	var m models.WorkspaceMember
	err := s.workspaceMembers().FindOne(ctx, bson.M{"workspaceId": workspaceID, "userId": userID}).Decode(&m)
	if errors.Is(err, mongo.ErrNoDocuments) {
		// Owner fallback in case a membership document is missing.
		var ws models.Workspace
		if err := s.workspaces().FindOne(ctx, bson.M{"_id": workspaceID}).Decode(&ws); err == nil && ws.OwnerID == userID {
			return WorkspaceRoleOwner, nil
		}
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return m.Role, nil
}

func (s *Server) workspaceByID(ctx context.Context, id primitive.ObjectID) (*models.Workspace, error) {
	var ws models.Workspace
	if err := s.workspaces().FindOne(ctx, bson.M{"_id": id}).Decode(&ws); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, errWorkspaceMissing
		}
		return nil, err
	}
	return &ws, nil
}

func slugify(name string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(name) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			lastDash = false
		case !lastDash && b.Len() > 0:
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if len([]rune(out)) > 48 {
		r := []rune(out)
		out = string(r[:48])
	}
	if out == "" {
		out = "workspace"
	}
	return out
}

func (s *Server) uniqueSlug(ctx context.Context, name string) string {
	base := slugify(name)
	slug := base
	for i := 0; i < 10; i++ {
		n, err := s.workspaces().CountDocuments(ctx, bson.M{"slug": slug})
		if err == nil && n == 0 {
			return slug
		}
		slug = base + "-" + shortID("")
	}
	return base + "-" + shortID("")
}

func (s *Server) createWorkspaceDoc(ctx context.Context, owner *models.User, name string) (*models.Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = owner.Name + "'s workspace"
	}
	if len([]rune(name)) > 80 {
		name = string([]rune(name)[:80])
	}
	now := time.Now()
	ws := &models.Workspace{
		ID:        primitive.NewObjectID(),
		Name:      name,
		Slug:      s.uniqueSlug(ctx, name),
		OwnerID:   owner.ID,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.workspaces().InsertOne(ctx, ws); err != nil {
		return nil, err
	}
	member := models.WorkspaceMember{
		ID:          primitive.NewObjectID(),
		WorkspaceID: ws.ID,
		UserID:      owner.ID,
		Role:        WorkspaceRoleOwner,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := s.workspaceMembers().InsertOne(ctx, member); err != nil {
		return nil, err
	}
	return ws, nil
}

// ensureDefaultWorkspace is used by seed and migration. On first creation it adds every
// existing user, which keeps upgraded single-workspace deployments together.
func (s *Server) ensureDefaultWorkspace(ctx context.Context) (*models.Workspace, error) {
	var ws models.Workspace
	err := s.workspaces().FindOne(ctx, bson.M{}, options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: 1}})).Decode(&ws)
	if err == nil {
		return &ws, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	var users []models.User
	cur, err := s.auth.Users().Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	if err := cur.All(ctx, &users); err != nil {
		return nil, err
	}
	if len(users) == 0 {
		return nil, errWorkspaceMissing
	}

	owner := &users[0]
	wsPtr, err := s.createWorkspaceDoc(ctx, owner, "Friday Workspace")
	if err != nil {
		return nil, err
	}
	now := time.Now()
	for i := range users {
		if users[i].ID == owner.ID {
			continue
		}
		_, _ = s.workspaceMembers().InsertOne(ctx, models.WorkspaceMember{
			ID:          primitive.NewObjectID(),
			WorkspaceID: wsPtr.ID,
			UserID:      users[i].ID,
			Role:        WorkspaceRoleMember,
			CreatedAt:   now,
			UpdatedAt:   now,
		})
	}
	return wsPtr, nil
}

func (s *Server) ensurePersonalWorkspace(ctx context.Context, user *models.User) (*models.Workspace, error) {
	var m models.WorkspaceMember
	err := s.workspaceMembers().FindOne(ctx, bson.M{"userId": user.ID}, options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: 1}})).Decode(&m)
	if err == nil {
		return s.workspaceByID(ctx, m.WorkspaceID)
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}
	return s.createWorkspaceDoc(ctx, user, user.Name+"'s workspace")
}

// EnsureWorkspaces backfills pre-multi-tenant data and makes sure every user has a workspace.
func (s *Server) EnsureWorkspaces(ctx context.Context) error {
	ws, err := s.ensureDefaultWorkspace(ctx)
	if err != nil {
		if errors.Is(err, errWorkspaceMissing) {
			return nil
		}
		return err
	}

	// Attach legacy boards to the oldest workspace.
	legacy := bson.M{"$or": []bson.M{
		{"workspaceId": bson.M{"$exists": false}},
		{"workspaceId": primitive.NilObjectID},
	}}
	_, _ = s.db.Database.Collection("boards").UpdateMany(ctx, legacy, bson.M{"$set": bson.M{"workspaceId": ws.ID, "visibility": BoardVisibilityWorkspace}})
	_, _ = s.db.Database.Collection("boards").UpdateMany(ctx, bson.M{"$or": []bson.M{
		{"visibility": bson.M{"$exists": false}},
		{"visibility": ""},
	}}, bson.M{"$set": bson.M{"visibility": BoardVisibilityWorkspace}})
	return nil
}

func (s *Server) listUserMemberships(ctx context.Context, userID primitive.ObjectID) ([]models.WorkspaceMember, error) {
	out := []models.WorkspaceMember{}
	cur, err := s.workspaceMembers().Find(ctx, bson.M{"userId": userID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// accessibleBoards returns every board the user may read, optionally limited to one workspace.
func (s *Server) accessibleBoards(ctx context.Context, userID primitive.ObjectID, workspaceFilter *primitive.ObjectID) ([]models.Board, error) {
	memberships, err := s.listUserMemberships(ctx, userID)
	if err != nil {
		return nil, err
	}
	if workspaceFilter != nil {
		found := false
		for _, m := range memberships {
			if m.WorkspaceID == *workspaceFilter {
				found = true
				break
			}
		}
		if !found {
			return nil, errForbidden
		}
	}

	allIDs := []primitive.ObjectID{}
	nonGuestIDs := []primitive.ObjectID{}
	adminIDs := []primitive.ObjectID{}
	for _, m := range memberships {
		if workspaceFilter != nil && m.WorkspaceID != *workspaceFilter {
			continue
		}
		allIDs = append(allIDs, m.WorkspaceID)
		if m.Role == WorkspaceRoleMember || m.Role == WorkspaceRoleAdmin || m.Role == WorkspaceRoleOwner {
			nonGuestIDs = append(nonGuestIDs, m.WorkspaceID)
		}
		if m.Role == WorkspaceRoleAdmin || m.Role == WorkspaceRoleOwner {
			adminIDs = append(adminIDs, m.WorkspaceID)
		}
	}
	if len(allIDs) == 0 {
		return []models.Board{}, nil
	}

	or := []bson.M{}
	if len(nonGuestIDs) > 0 {
		or = append(or, bson.M{"workspaceId": bson.M{"$in": nonGuestIDs}, "visibility": bson.M{"$ne": BoardVisibilityPrivate}})
	}
	if len(adminIDs) > 0 {
		or = append(or, bson.M{"workspaceId": bson.M{"$in": adminIDs}})
	}
	if len(allIDs) > 0 {
		or = append(or, bson.M{"workspaceId": bson.M{"$in": allIDs}, "ownerId": userID})
		or = append(or, bson.M{"workspaceId": bson.M{"$in": allIDs}, "members.userId": userID})
	}
	filter := bson.M{"$or": or}
	if workspaceFilter != nil {
		filter["workspaceId"] = *workspaceFilter
	}
	boards := []models.Board{}
	cur, err := s.db.Database.Collection("boards").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	if err := cur.All(ctx, &boards); err != nil {
		return nil, err
	}
	return boards, nil
}

type boardAccess struct {
	WorkspaceRole string
	BoardRole     string
	CanRead       bool
	CanComment    bool
	CanEdit       bool
	CanAdmin      bool
}

func roleRank(role string) int {
	switch role {
	case "owner":
		return 5
	case "admin":
		return 4
	case "editor":
		return 3
	case "commenter":
		return 2
	case "viewer":
		return 1
	default:
		return 0
	}
}

func buildBoardAccess(board *models.Board, userID primitive.ObjectID, wsRole string) *boardAccess {
	if wsRole == "" {
		// Removed workspace members lose board access even if they still own the board.
		return &boardAccess{}
	}
	role := ""
	if board.OwnerID == userID {
		role = "owner"
	}
	for _, m := range board.Members {
		if m.UserID == userID && roleRank(m.Role) > roleRank(role) {
			role = m.Role
		}
	}
	visibility := board.Visibility
	if visibility == "" {
		visibility = BoardVisibilityWorkspace
	}
	switch wsRole {
	case WorkspaceRoleOwner, WorkspaceRoleAdmin:
		if roleRank(role) < roleRank("admin") {
			role = "admin"
		}
	case WorkspaceRoleMember:
		if visibility != BoardVisibilityPrivate && role == "" {
			role = "editor"
		}
	}
	if role == "" {
		return &boardAccess{WorkspaceRole: wsRole}
	}
	return &boardAccess{
		WorkspaceRole: wsRole,
		BoardRole:     role,
		CanRead:       true,
		CanComment:    roleRank(role) >= 2,
		CanEdit:       roleRank(role) >= 3,
		CanAdmin:      roleRank(role) >= 4,
	}
}

func (s *Server) boardAccessFor(ctx context.Context, userID primitive.ObjectID, board *models.Board) (*boardAccess, error) {
	wsRole, err := s.workspaceRole(ctx, board.WorkspaceID, userID)
	if err != nil {
		return nil, err
	}
	return buildBoardAccess(board, userID, wsRole), nil
}

func (a *boardAccess) allows(level string) bool {
	switch level {
	case "read":
		return a.CanRead
	case "comment":
		return a.CanComment
	case "write":
		return a.CanEdit
	case "admin":
		return a.CanAdmin
	default:
		return false
	}
}

func (s *Server) requireBoardAccess(w http.ResponseWriter, r *http.Request, boardID primitive.ObjectID, level string) (*models.Board, *boardAccess, bool) {
	board, err := s.getBoardDoc(r, boardID)
	if err != nil {
		writeError(w, http.StatusNotFound, "board not found")
		return nil, nil, false
	}
	access, err := s.boardAccessFor(r.Context(), authFrom(r).User.ID, board)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check board access")
		return nil, nil, false
	}
	if !access.allows(level) {
		writeError(w, http.StatusForbidden, "you do not have access to this board")
		return nil, nil, false
	}
	return board, access, true
}

func (s *Server) workspaceIDFromQuery(r *http.Request) (*primitive.ObjectID, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("workspaceId"))
	if raw == "" {
		return nil, nil
	}
	id, err := primitive.ObjectIDFromHex(raw)
	if err != nil {
		return nil, errors.New("invalid workspaceId")
	}
	return &id, nil
}

func newInviteToken() (string, string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	raw := "inv_" + base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(raw))
	return raw, hex.EncodeToString(sum[:])
}

func hashInviteToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
