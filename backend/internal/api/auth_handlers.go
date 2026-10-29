package api

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/oauth2"

	"friday/backend/internal/auth"
	"friday/backend/internal/models"
)

type registerRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.AllowRegistration {
		writeError(w, http.StatusForbidden, "self-service registration is disabled")
		return
	}
	var req registerRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Email = auth.NormalizeEmail(req.Email)
	req.Name = strings.TrimSpace(req.Name)
	if !validEmail(req.Email) {
		writeError(w, http.StatusBadRequest, "please enter a valid email address")
		return
	}
	if len([]rune(req.Name)) < 2 {
		writeError(w, http.StatusBadRequest, "name must be at least 2 characters")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	existing, err := s.auth.FindUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	if existing != nil {
		writeError(w, http.StatusConflict, "an account with this email already exists")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not secure password")
		return
	}
	now := time.Now()
	u := models.User{
		ID:           primitive.NewObjectID(),
		Email:        req.Email,
		Name:         req.Name,
		AvatarColor:  auth.RandomAvatarColor(),
		PasswordHash: hash,
		LastLoginAt:  &now,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := s.auth.Users().InsertOne(r.Context(), u); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			writeError(w, http.StatusConflict, "an account with this email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	if ws, err := s.ensurePersonalWorkspace(r.Context(), &u); err == nil {
		if _, _, err := s.createBoardDoc(r.Context(), &u, ws.ID, "My first board", "#6161ff", "🚀", "project"); err != nil {
			// Registration should still succeed; the user can create a board manually.
			_ = err
		}
	}

	raw, _, err := s.auth.CreateSession(r.Context(), u.ID, r.UserAgent(), r.RemoteAddr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account created, but sign in failed")
		return
	}
	s.setSessionCookies(w, raw)
	u.OIDCConnected = false
	writeJSON(w, http.StatusCreated, map[string]any{"user": u})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Email = auth.NormalizeEmail(req.Email)
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	u, err := s.auth.VerifyPassword(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "sign in failed")
		return
	}
	if u.TOTPEnabled {
		challenge, err := s.auth.CreateLoginChallenge(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not start two-factor verification")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"totpRequired": true, "challengeToken": challenge})
		return
	}
	s.finishLogin(w, r, u)
}

type loginTOTPRequest struct {
	ChallengeToken string `json:"challengeToken"`
	Code           string `json:"code"`
}

func (s *Server) loginTOTP(w http.ResponseWriter, r *http.Request) {
	var req loginTOTPRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ChallengeToken == "" || req.Code == "" {
		writeError(w, http.StatusBadRequest, "challenge token and code are required")
		return
	}
	ch, err := s.auth.FindLoginChallenge(r.Context(), req.ChallengeToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, auth.ErrChallengeExpired.Error())
		return
	}
	u, err := s.auth.FindUserByID(r.Context(), ch.UserID)
	if err != nil || u == nil || !u.TOTPEnabled || u.TOTPSecret == "" {
		s.auth.ConsumeLoginChallenge(r.Context(), ch.ID)
		writeError(w, http.StatusUnauthorized, "two-factor authentication is not available")
		return
	}
	if !auth.ValidTOTP(u.TOTPSecret, strings.TrimSpace(req.Code)) {
		ok, err := s.auth.ConsumeTOTPRecoveryCode(r.Context(), u.ID, req.Code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not verify recovery code")
			return
		}
		if !ok {
			s.auth.FailLoginChallenge(r.Context(), ch.ID)
			writeError(w, http.StatusUnauthorized, "invalid authenticator code")
			return
		}
	}
	s.auth.ConsumeLoginChallenge(r.Context(), ch.ID)
	s.finishLogin(w, r, u)
}

func (s *Server) finishLogin(w http.ResponseWriter, r *http.Request, u *models.User) {
	raw, _, err := s.auth.CreateSession(r.Context(), u.ID, r.UserAgent(), r.RemoteAddr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	s.setSessionCookies(w, raw)
	u.OIDCConnected = u.OIDCIssuer != ""
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	u := a.User
	u.OIDCConnected = u.OIDCIssuer != ""
	writeJSON(w, http.StatusOK, map[string]any{
		"user":       u,
		"scopes":     a.Scopes,
		"authMethod": a.Method,
	})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		_ = s.auth.RevokeSession(r.Context(), c.Value)
	} else if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		_ = s.auth.RevokeSession(r.Context(), strings.TrimPrefix(h, "Bearer "))
	}
	s.clearSessionCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

// ---------- OIDC ----------

func (s *Server) oidcStart(w http.ResponseWriter, r *http.Request) {
	_, oauthCfg, err := s.auth.OIDCConfig(r.Context())
	if err != nil {
		writeError(w, http.StatusNotImplemented, "single sign-on is not configured")
		return
	}
	state, err := auth.NewCSRFToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start sign in")
		return
	}
	nonce, err := auth.NewCSRFToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start sign in")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oidcCookie,
		Value:    state + "." + nonce,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, oauthCfg.AuthCodeURL(state, oauth2.SetAuthURLParam("nonce", nonce)), http.StatusFound)
}

func (s *Server) oidcCallback(w http.ResponseWriter, r *http.Request) {
	_, _, err := s.auth.OIDCConfig(r.Context())
	if err != nil {
		s.oidcFail(w, r, "single sign-on is not configured")
		return
	}
	c, err := r.Cookie(oidcCookie)
	parts := strings.SplitN(cookieValue(c), ".", 2)
	if err != nil || len(parts) != 2 || subtle.ConstantTimeCompare([]byte(parts[0]), []byte(r.URL.Query().Get("state"))) != 1 {
		s.oidcFail(w, r, "invalid sign-in state, please try again")
		return
	}
	expectedNonce := parts[1]
	http.SetCookie(w, &http.Cookie{Name: oidcCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.CookieSecure})

	if e := r.URL.Query().Get("error"); e != "" {
		desc := r.URL.Query().Get("error_description")
		if desc == "" {
			desc = e
		}
		s.oidcFail(w, r, desc)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		s.oidcFail(w, r, "missing authorization code")
		return
	}
	u, err := s.auth.VerifyOIDCCallback(r.Context(), code, expectedNonce)
	if err != nil {
		s.oidcFail(w, r, err.Error())
		return
	}
	_, _ = s.ensurePersonalWorkspace(r.Context(), u)
	raw, _, err := s.auth.CreateSession(r.Context(), u.ID, r.UserAgent(), r.RemoteAddr)
	if err != nil {
		s.oidcFail(w, r, "could not create session")
		return
	}
	s.setSessionCookies(w, raw)
	http.Redirect(w, r, s.cfg.AppURL+"/", http.StatusFound)
}

func cookieValue(c *http.Cookie) string {
	if c == nil {
		return ""
	}
	return c.Value
}

func (s *Server) oidcFail(w http.ResponseWriter, r *http.Request, message string) {
	http.Redirect(w, r, s.cfg.AppURL+"/login?error="+url.QueryEscape(message), http.StatusFound)
}
