package api

import (
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"friday/backend/internal/auth"
	"friday/backend/internal/mail"
)

func (s *Server) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	email := auth.NormalizeEmail(req.Email)
	if !validEmail(email) {
		// Do not reveal whether the address exists.
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
		return
	}
	u, err := s.auth.FindUserByEmail(r.Context(), email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not process password reset")
		return
	}
	if u != nil {
		raw, err := s.auth.CreatePasswordReset(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not process password reset")
			return
		}
		resetURL := s.cfg.AppURL + "/reset-password?token=" + raw
		if s.mail.Enabled() {
			subject := "Reset your Friday password"
			text := fmt.Sprintf("Hi %s,\n\nSomeone requested a password reset for your Friday account.\n\nReset your password:\n%s\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.\n", u.Name, resetURL)
			body := fmt.Sprintf(`<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#323338"><div style="font-size:20px;font-weight:800;color:#6161ff;margin-bottom:16px">Friday</div><p>Hi %s,</p><p>Someone requested a password reset for your Friday account.</p><p style="margin:24px 0"><a href="%s" style="background:#6161ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Reset password</a></p><p style="color:#676879;font-size:12px">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p></div>`, html.EscapeString(u.Name), html.EscapeString(resetURL))
			if err := s.mail.Send(r.Context(), mail.Message{To: u.Email, Subject: subject, Text: text, HTML: body}); err != nil {
				slog.Warn("could not send password reset email", "to", u.Email, "error", err)
			}
		} else {
			_ = s.mail.Send(r.Context(), mail.Message{To: u.Email, Subject: "Reset your Friday password", Text: "Password reset link:\n" + resetURL})
		}
		slog.Info("password reset requested", "email", u.Email, "url", resetURL)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
}

func (s *Server) confirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "reset token is required")
		return
	}
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}
	token, err := s.auth.ConsumePasswordReset(r.Context(), req.Token)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidToken) {
			writeError(w, http.StatusBadRequest, "this reset link is invalid or has expired")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	now := time.Now()
	if _, err := s.auth.Users().UpdateOne(r.Context(), bson.M{"_id": token.UserID}, bson.M{"$set": bson.M{
		"passwordHash": hash,
		"updatedAt":    now,
	}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	s.auth.DeletePasswordResets(r.Context(), token.UserID)
	_ = s.auth.RevokeOtherSessions(r.Context(), token.UserID, "")
	slog.Info("password reset completed", "userId", token.UserID.Hex())
	w.WriteHeader(http.StatusNoContent)
}
