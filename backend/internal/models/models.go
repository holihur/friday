package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------- Users ----------

type User struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email             string             `bson:"email" json:"email"`
	Name              string             `bson:"name" json:"name"`
	AvatarColor       string             `bson:"avatarColor" json:"avatarColor"`
	PasswordHash      string             `bson:"passwordHash,omitempty" json:"-"`
	TOTPSecret        string             `bson:"totpSecret,omitempty" json:"-"`
	TOTPEnabled       bool               `bson:"totpEnabled" json:"totpEnabled"`
	TOTPRecoveryCodes []string           `bson:"totpRecoveryCodes,omitempty" json:"-"`
	OIDCIssuer        string             `bson:"oidcIssuer,omitempty" json:"oidcIssuer,omitempty"`
	OIDCSubject       string             `bson:"oidcSubject,omitempty" json:"-"`
	LastLoginAt       *time.Time         `bson:"lastLoginAt,omitempty" json:"lastLoginAt,omitempty"`
	CreatedAt         time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt         time.Time          `bson:"updatedAt" json:"updatedAt"`
	OIDCConnected     bool               `bson:"-" json:"oidcConnected"`
}

func (u *User) HasPassword() bool { return u.PasswordHash != "" }

// ---------- AI / BYOK ----------

type UserAIConfig struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID          primitive.ObjectID `bson:"userId" json:"userId"`
	Provider        string             `bson:"provider" json:"provider"`
	BaseURL         string             `bson:"baseUrl" json:"baseUrl"`
	Model           string             `bson:"model" json:"model"`
	APIKeyEncrypted string             `bson:"apiKeyEncrypted" json:"-"`
	APIKeyLast4     string             `bson:"apiKeyLast4" json:"apiKeyLast4"`
	CreatedAt       time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type AgentChange struct {
	Field string `bson:"field" json:"field"`
	Value string `bson:"value" json:"value"`
}

type AgentActionPayload struct {
	BoardID  primitive.ObjectID `bson:"boardId" json:"boardId"`
	GroupID  primitive.ObjectID `bson:"groupId,omitempty" json:"groupId,omitempty"`
	ItemID   primitive.ObjectID `bson:"itemId,omitempty" json:"itemId,omitempty"`
	ItemName string             `bson:"itemName" json:"itemName"`
	Values   map[string]any     `bson:"values,omitempty" json:"values,omitempty"`
	Changes  []AgentChange      `bson:"changes,omitempty" json:"changes,omitempty"`
}

type AgentAction struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      primitive.ObjectID `bson:"userId" json:"userId"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	BoardID     primitive.ObjectID `bson:"boardId,omitempty" json:"boardId,omitempty"`
	Type        string             `bson:"type" json:"type"`
	Summary     string             `bson:"summary" json:"summary"`
	Payload     AgentActionPayload `bson:"payload" json:"payload"`
	Status      string             `bson:"status" json:"status"`
	Error       string             `bson:"error,omitempty" json:"error,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	ExecutedAt  *time.Time         `bson:"executedAt,omitempty" json:"executedAt,omitempty"`
}

// ---------- Sessions & tokens ----------

type Session struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TokenHash string             `bson:"tokenHash" json:"-"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	UserAgent string             `bson:"userAgent,omitempty" json:"userAgent,omitempty"`
	IP        string             `bson:"ip,omitempty" json:"ip,omitempty"`
	ExpiresAt time.Time          `bson:"expiresAt" json:"expiresAt"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

type PersonalAccessToken struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID     primitive.ObjectID `bson:"userId" json:"userId"`
	Name       string             `bson:"name" json:"name"`
	Prefix     string             `bson:"prefix" json:"prefix"`
	TokenHash  string             `bson:"tokenHash" json:"-"`
	Scopes     []string           `bson:"scopes" json:"scopes"`
	ExpiresAt  *time.Time         `bson:"expiresAt,omitempty" json:"expiresAt,omitempty"`
	LastUsedAt *time.Time         `bson:"lastUsedAt,omitempty" json:"lastUsedAt,omitempty"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
}

type PasswordResetToken struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"`
	UserID    primitive.ObjectID `bson:"userId"`
	TokenHash string             `bson:"tokenHash"`
	ExpiresAt time.Time          `bson:"expiresAt"`
	CreatedAt time.Time          `bson:"createdAt"`
}

type LoginChallenge struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"`
	TokenHash string             `bson:"tokenHash"`
	UserID    primitive.ObjectID `bson:"userId"`
	Attempts  int                `bson:"attempts"`
	ExpiresAt time.Time          `bson:"expiresAt"`
	CreatedAt time.Time          `bson:"createdAt"`
}

// ---------- Boards ----------

type BoardMember struct {
	UserID primitive.ObjectID `bson:"userId" json:"userId"`
	Role   string             `bson:"role" json:"role"`
}

type Label struct {
	ID    string `bson:"id" json:"id"`
	Name  string `bson:"name" json:"name"`
	Color string `bson:"color" json:"color"`
}

type Column struct {
	ID     string  `bson:"id" json:"id"`
	Title  string  `bson:"title" json:"title"`
	Type   string  `bson:"type" json:"type"`
	Width  int     `bson:"width" json:"width"`
	Labels []Label `bson:"labels,omitempty" json:"labels,omitempty"`
}

type Board struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId,omitempty" json:"workspaceId"`
	Name        string             `bson:"name" json:"name"`
	Description string             `bson:"description" json:"description"`
	Color       string             `bson:"color" json:"color"`
	Icon        string             `bson:"icon" json:"icon"`
	Visibility  string             `bson:"visibility,omitempty" json:"visibility"`
	OwnerID     primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Members     []BoardMember      `bson:"members" json:"members"`
	Columns     []Column           `bson:"columns" json:"columns"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type Group struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	BoardID   primitive.ObjectID `bson:"boardId" json:"boardId"`
	Title     string             `bson:"title" json:"title"`
	Color     string             `bson:"color" json:"color"`
	Position  float64            `bson:"position" json:"position"`
	Collapsed bool               `bson:"collapsed" json:"collapsed"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type Item struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	BoardID   primitive.ObjectID `bson:"boardId" json:"boardId"`
	GroupID   primitive.ObjectID `bson:"groupId" json:"groupId"`
	Name      string             `bson:"name" json:"name"`
	Position  float64            `bson:"position" json:"position"`
	Values    map[string]any     `bson:"values" json:"values"`
	CreatedBy primitive.ObjectID `bson:"createdBy" json:"createdBy"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type Comment struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ItemID      primitive.ObjectID `bson:"itemId" json:"itemId"`
	BoardID     primitive.ObjectID `bson:"boardId" json:"boardId"`
	UserID      primitive.ObjectID `bson:"userId" json:"userId"`
	AuthorName  string             `bson:"authorName" json:"authorName"`
	AuthorColor string             `bson:"authorColor" json:"authorColor"`
	Body        string             `bson:"body" json:"body"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type Activity struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	BoardID   primitive.ObjectID `bson:"boardId" json:"boardId"`
	ItemID    primitive.ObjectID `bson:"itemId,omitempty" json:"itemId,omitempty"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	UserName  string             `bson:"userName" json:"userName"`
	UserColor string             `bson:"userColor" json:"userColor"`
	Action    string             `bson:"action" json:"action"`
	ItemName  string             `bson:"itemName,omitempty" json:"itemName,omitempty"`
	Detail    string             `bson:"detail,omitempty" json:"detail,omitempty"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

// ---------- Workspaces ----------

type Workspace struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	Slug      string             `bson:"slug" json:"slug"`
	OwnerID   primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type WorkspaceMember struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	UserID      primitive.ObjectID `bson:"userId" json:"userId"`
	Role        string             `bson:"role" json:"role"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type Invitation struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	Email       string             `bson:"email" json:"email"`
	Role        string             `bson:"role" json:"role"`
	TokenHash   string             `bson:"tokenHash" json:"-"`
	InvitedBy   primitive.ObjectID `bson:"invitedBy" json:"invitedBy"`
	ExpiresAt   time.Time          `bson:"expiresAt" json:"expiresAt"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

// ---------- API payloads ----------

type BoardSummary struct {
	Board
	ItemCount int `json:"itemCount"`
	DoneCount int `json:"doneCount"`
}

type BoardPermissions struct {
	Role       string `json:"role"`
	CanComment bool   `json:"canComment"`
	CanEdit    bool   `json:"canEdit"`
	CanAdmin   bool   `json:"canAdmin"`
}

type BoardPayload struct {
	Board       Board             `json:"board"`
	Groups      []Group           `json:"groups"`
	Items       []Item            `json:"items"`
	Activity    []Activity        `json:"activity"`
	Permissions *BoardPermissions `json:"permissions,omitempty"`
}
