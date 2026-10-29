package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/auth"
)

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        *string `json:"name"`
		AvatarColor *string `json:"avatarColor"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	a := authFrom(r)
	set := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if len([]rune(name)) < 2 || len([]rune(name)) > 80 {
			writeError(w, http.StatusBadRequest, "name must be between 2 and 80 characters")
			return
		}
		set["name"] = name
	}
	if req.AvatarColor != nil {
		if !hexColorRe.MatchString(*req.AvatarColor) {
			writeError(w, http.StatusBadRequest, "avatarColor must be a hex color")
			return
		}
		set["avatarColor"] = *req.AvatarColor
	}
	if _, err := s.auth.Users().UpdateOne(r.Context(), bson.M{"_id": a.User.ID}, bson.M{"$set": set}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update profile")
		return
	}
	u, _ := s.auth.FindUserByID(r.Context(), a.User.ID)
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}
	a := authFrom(r)
	if a.User.PasswordHash != "" {
		if _, err := s.auth.VerifyPassword(r.Context(), a.User.Email, req.CurrentPassword); err != nil {
			writeError(w, http.StatusBadRequest, "current password is incorrect")
			return
		}
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not secure password")
		return
	}
	if _, err := s.auth.Users().UpdateOne(r.Context(), bson.M{"_id": a.User.ID}, bson.M{"$set": bson.M{
		"passwordHash": hash,
		"updatedAt":    time.Now(),
	}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update password")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- TOTP ----------

func (s *Server) setupTOTP(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	if a.User.TOTPEnabled {
		writeError(w, http.StatusConflict, "two-factor authentication is already enabled")
		return
	}
	secret, otpauthURL, err := s.auth.SetupTOTP(r.Context(), a.User)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start two-factor setup")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"secret": secret, "otpauthUrl": otpauthURL})
}

func (s *Server) enableTOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	a := authFrom(r)
	codes, err := s.auth.EnableTOTP(r.Context(), a.User, strings.TrimSpace(req.Code))
	if err != nil {
		if errors.Is(err, auth.ErrTOTPInvalid) {
			writeError(w, http.StatusBadRequest, "that code is not valid, please try again")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not enable two-factor authentication")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (s *Server) disableTOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	a := authFrom(r)
	if err := s.auth.DisableTOTP(r.Context(), a.User.ID, strings.TrimSpace(req.Code)); err != nil {
		if errors.Is(err, auth.ErrTOTPInvalid) {
			writeError(w, http.StatusBadRequest, "that code is not valid")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not disable two-factor authentication")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Personal access tokens ----------

func (s *Server) listPATs(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	pats, err := s.auth.ListPATs(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load access tokens")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": pats})
}

func (s *Server) createPAT(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name          string   `json:"name"`
		Scopes        []string `json:"scopes"`
		ExpiresInDays *int     `json:"expiresInDays"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > 60 {
		writeError(w, http.StatusBadRequest, "token name is required (max 60 characters)")
		return
	}
	if len(req.Scopes) == 0 {
		writeError(w, http.StatusBadRequest, "select at least one scope")
		return
	}
	seen := map[string]bool{}
	scopes := make([]string, 0, len(req.Scopes))
	for _, sc := range req.Scopes {
		sc = strings.TrimSpace(sc)
		if !auth.ValidScope(sc) {
			writeError(w, http.StatusBadRequest, "unknown scope: "+sc)
			return
		}
		if !seen[sc] {
			seen[sc] = true
			scopes = append(scopes, sc)
		}
	}
	var expiresAt *time.Time
	if req.ExpiresInDays != nil && *req.ExpiresInDays > 0 {
		if *req.ExpiresInDays > 365 {
			writeError(w, http.StatusBadRequest, "expiration cannot exceed 365 days")
			return
		}
		t := time.Now().AddDate(0, 0, *req.ExpiresInDays)
		expiresAt = &t
	}
	a := authFrom(r)
	raw, pat, err := s.auth.CreatePAT(r.Context(), a.User.ID, req.Name, scopes, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create access token")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": raw, "pat": pat})
}

func (s *Server) revokePAT(w http.ResponseWriter, r *http.Request) {
	patID, err := primitive.ObjectIDFromHex(r.PathValue("patID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid token id")
		return
	}
	a := authFrom(r)
	res, err := s.auth.PATs().DeleteOne(r.Context(), bson.M{"_id": patID, "userId": a.User.ID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke access token")
		return
	}
	if res.DeletedCount == 0 {
		writeError(w, http.StatusNotFound, "access token not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
