package api

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"friday/backend/internal/auth"
	"friday/backend/internal/models"
)

const (
	sessionCookie = "friday_session"
	csrfCookie    = "friday_csrf"
	oidcCookie    = "friday_oidc_state"
)

type ctxKey int

const authedKey ctxKey = 1

type authed struct {
	User      *models.User
	Scopes    []string
	Method    string // "session" or "pat"
	PAT       *models.PersonalAccessToken
	Session   *models.Session
	ViaCookie bool
}

func authFrom(r *http.Request) *authed {
	a, _ := r.Context().Value(authedKey).(*authed)
	return a
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var (
			a        *authed
			rawToken string
			fromAuth = false
		)

		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			rawToken = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
			fromAuth = true
		}

		if rawToken != "" {
			if strings.HasPrefix(rawToken, "fdy_") {
				u, pat, err := s.auth.AuthenticatePAT(r.Context(), rawToken)
				if err != nil {
					writeError(w, http.StatusUnauthorized, "invalid or expired access token")
					return
				}
				a = &authed{User: u, Scopes: pat.Scopes, Method: "pat", PAT: pat}
			} else {
				u, sess, err := s.auth.AuthenticateSession(r.Context(), rawToken)
				if err != nil {
					writeError(w, http.StatusUnauthorized, "invalid or expired session")
					return
				}
				a = &authed{User: u, Scopes: []string{"*"}, Method: "session", Session: sess}
			}
		} else if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
			rawToken = c.Value
			u, sess, err := s.auth.AuthenticateSession(r.Context(), rawToken)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "invalid or expired session")
				return
			}
			a = &authed{User: u, Scopes: []string{"*"}, Method: "session", Session: sess, ViaCookie: true}
		}

		if a == nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		// Double-submit CSRF protection for cookie-authenticated mutations.
		// Bearer tokens are not ambient credentials, so they do not need CSRF.
		if a.ViaCookie && isMutating(r.Method) {
			c, err := r.Cookie(csrfCookie)
			header := r.Header.Get("X-CSRF-Token")
			if err != nil || c.Value == "" || header == "" ||
				subtle.ConstantTimeCompare([]byte(c.Value), []byte(header)) != 1 {
				writeError(w, http.StatusForbidden, "missing or invalid CSRF token")
				return
			}
		}

		_ = fromAuth
		ctx := context.WithValue(r.Context(), authedKey, a)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) scope(needed string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a := authFrom(r)
		if a == nil || !auth.HasScope(a.Scopes, needed) {
			writeError(w, http.StatusForbidden, "missing scope: "+needed)
			return
		}
		h(w, r)
	}
}

func (s *Server) sessionOnly(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a := authFrom(r)
		if a == nil || a.Method != "session" {
			writeError(w, http.StatusForbidden, "this endpoint requires a browser session")
			return
		}
		h(w, r)
	}
}

func isMutating(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	return true
}

func (s *Server) cors(next http.Handler) http.Handler {
	allowed := func(origin string) bool {
		if origin == "" {
			return false
		}
		if origin == s.cfg.AppURL {
			return true
		}
		for _, o := range s.cfg.CORSOrigins {
			if o == origin {
				return true
			}
		}
		return false
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, X-Requested-With")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) setSessionCookies(w http.ResponseWriter, rawSession string) {
	csrf, err := auth.NewCSRFToken()
	if err != nil {
		csrf = ""
	}
	maxAge := int(s.cfg.SessionTTL.Seconds())
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    rawSession,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookie,
		Value:    csrf,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: false,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookies(w http.ResponseWriter) {
	for _, name := range []string{sessionCookie, csrfCookie} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: name == sessionCookie,
			Secure:   s.cfg.CookieSecure,
			SameSite: http.SameSiteLaxMode,
			Expires:  time.Unix(0, 0),
		})
	}
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if s.cfg.CookieSecure || strings.HasPrefix(s.cfg.AppURL, "https://") {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}
