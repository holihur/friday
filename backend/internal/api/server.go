package api

import (
	"context"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"friday/backend/internal/auth"
	"friday/backend/internal/config"
	"friday/backend/internal/database"
	"friday/backend/internal/mail"
	"friday/backend/internal/web"
)

type Server struct {
	auth    *auth.Service
	db      *database.DB
	cfg     *config.Config
	mail    mail.Sender
	limiter *rateLimiter
}

func NewServer(db *database.DB, cfg *config.Config) *Server {
	return &Server{auth: auth.New(db, cfg), db: db, cfg: cfg, mail: mail.New(cfg), limiter: newRateLimiter()}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(s.securityHeaders)
	r.Use(s.cors)
	r.Use(middleware.Timeout(45 * time.Second))

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", s.health)
		r.Get("/config", s.publicConfig)

		r.With(s.rateLimit(10, time.Hour)).Post("/auth/register", s.register)
		r.With(s.rateLimit(20, time.Minute)).Post("/auth/login", s.login)
		r.With(s.rateLimit(20, 5*time.Minute)).Post("/auth/login/totp", s.loginTOTP)
		r.With(s.rateLimit(5, 15*time.Minute)).Post("/auth/password-reset/request", s.requestPasswordReset)
		r.With(s.rateLimit(10, 15*time.Minute)).Post("/auth/password-reset/confirm", s.confirmPasswordReset)
		r.Get("/auth/oidc/start", s.oidcStart)
		r.Get("/auth/oidc/callback", s.oidcCallback)
		r.Get("/invitations/{token}", s.getInvitation)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)

			r.Get("/auth/me", s.me)
			r.Post("/auth/logout", s.logout)

			r.Patch("/me", s.sessionOnly(s.updateProfile))
			r.Post("/me/password", s.sessionOnly(s.changePassword))
			r.Post("/me/totp/setup", s.sessionOnly(s.setupTOTP))
			r.Post("/me/totp/enable", s.sessionOnly(s.enableTOTP))
			r.Post("/me/totp/disable", s.sessionOnly(s.disableTOTP))
			r.Get("/me/sessions", s.sessionOnly(s.listSessions))
			r.Delete("/me/sessions", s.sessionOnly(s.revokeOtherSessions))
			r.Delete("/me/sessions/{sessionID}", s.sessionOnly(s.revokeSession))

			r.Get("/me/pats", s.sessionOnly(s.listPATs))
			r.Post("/me/pats", s.sessionOnly(s.createPAT))
			r.Delete("/me/pats/{patID}", s.sessionOnly(s.revokePAT))

			r.Post("/invitations/{token}/accept", s.sessionOnly(s.acceptInvitation))

			r.Get("/workspaces", s.sessionOnly(s.listWorkspaces))
			r.Post("/workspaces", s.sessionOnly(s.createWorkspace))
			r.Get("/workspaces/{workspaceID}", s.sessionOnly(s.getWorkspace))
			r.Patch("/workspaces/{workspaceID}", s.sessionOnly(s.updateWorkspace))
			r.Get("/workspaces/{workspaceID}/members", s.sessionOnly(s.listWorkspaceMembers))
			r.Patch("/workspaces/{workspaceID}/members/{userID}", s.sessionOnly(s.updateWorkspaceMember))
			r.Delete("/workspaces/{workspaceID}/members/{userID}", s.sessionOnly(s.removeWorkspaceMember))
			r.Get("/workspaces/{workspaceID}/invitations", s.sessionOnly(s.listInvitations))
			r.Post("/workspaces/{workspaceID}/invitations", s.sessionOnly(s.createInvitation))
			r.Delete("/workspaces/{workspaceID}/invitations/{invitationID}", s.sessionOnly(s.revokeInvitation))

			r.Get("/users", s.scope("users:read", s.listUsers))
			r.Get("/dashboard", s.scope("boards:read", s.dashboard))
			r.Get("/my-items", s.scope("items:read", s.myItems))
			r.Get("/search", s.scope("items:read", s.search))

			r.Get("/boards", s.scope("boards:read", s.listBoards))
			r.Post("/boards", s.scope("boards:write", s.createBoard))
			r.Get("/boards/{boardID}", s.scope("boards:read", s.getBoard))
			r.Get("/boards/{boardID}/members", s.scope("boards:read", s.listBoardMembers))
			r.Patch("/boards/{boardID}/members/{userID}", s.scope("boards:write", s.updateBoardMember))
			r.Delete("/boards/{boardID}/members/{userID}", s.scope("boards:write", s.deleteBoardMember))
			r.Patch("/boards/{boardID}", s.scope("boards:write", s.updateBoard))
			r.Delete("/boards/{boardID}", s.scope("boards:write", s.deleteBoard))
			r.Post("/boards/{boardID}/columns", s.scope("boards:write", s.createColumn))
			r.Patch("/boards/{boardID}/columns/{columnID}", s.scope("boards:write", s.updateColumn))
			r.Delete("/boards/{boardID}/columns/{columnID}", s.scope("boards:write", s.deleteColumn))
			r.Post("/boards/{boardID}/groups", s.scope("boards:write", s.createGroup))
			r.Get("/boards/{boardID}/activity", s.scope("boards:read", s.boardActivity))
			r.Get("/boards/{boardID}/items", s.scope("items:read", s.listItems))
			r.Post("/boards/{boardID}/items", s.scope("items:write", s.createItem))

			r.Patch("/groups/{groupID}", s.scope("boards:write", s.updateGroup))
			r.Delete("/groups/{groupID}", s.scope("boards:write", s.deleteGroup))

			r.Get("/items/{itemID}", s.scope("items:read", s.getItem))
			r.Patch("/items/{itemID}", s.scope("items:write", s.updateItem))
			r.Delete("/items/{itemID}", s.scope("items:write", s.deleteItem))
			r.Get("/items/{itemID}/comments", s.scope("items:read", s.listComments))
			r.Post("/items/{itemID}/comments", s.scope("items:write", s.createComment))
			r.Delete("/comments/{commentID}", s.scope("items:write", s.deleteComment))
		})
	})

	// The SPA is embedded in the Go binary, so production only needs one process.
	// FRONTEND_DIST can point at an on-disk build during UI development.
	var assets fs.FS = web.Dist()
	if s.cfg.FrontendDist != "" {
		if st, err := os.Stat(s.cfg.FrontendDist); err == nil && st.IsDir() {
			assets = os.DirFS(s.cfg.FrontendDist)
		}
	}
	spa := spaHandler(assets)
	r.NotFound(spa.ServeHTTP)
	return r
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Client.Ping(ctx, nil); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "mongo": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "mongo": true, "time": time.Now().UTC()})
}

func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"oidcEnabled":         s.cfg.OIDCEnabled(),
		"oidcName":            s.cfg.OIDCName,
		"registrationEnabled": s.cfg.AllowRegistration,
		"demoMode":            s.cfg.SeedDemo,
	})
}

func spaHandler(assets fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(assets))
	serveIndex := func(w http.ResponseWriter) {
		data, err := fs.ReadFile(assets, "index.html")
		if err != nil {
			http.Error(w, "frontend is not built", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(data)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		clean := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if clean == "" || clean == "." {
			serveIndex(w)
			return
		}
		if info, err := fs.Stat(assets, clean); err == nil && !info.IsDir() {
			if strings.HasPrefix(clean, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		serveIndex(w)
	})
}
