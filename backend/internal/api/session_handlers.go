package api

import (
	"net/http"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"friday/backend/internal/models"
)

type SessionView struct {
	models.Session
	Current bool `json:"current"`
}

func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	sessions, err := s.auth.ListSessions(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load sessions")
		return
	}
	out := make([]SessionView, 0, len(sessions))
	for _, sess := range sessions {
		out = append(out, SessionView{Session: sess, Current: a.Session != nil && a.Session.ID == sess.ID})
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

func (s *Server) revokeSession(w http.ResponseWriter, r *http.Request) {
	sessionID, err := primitive.ObjectIDFromHex(r.PathValue("sessionID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	a := authFrom(r)
	if a.Session != nil && a.Session.ID == sessionID {
		writeError(w, http.StatusBadRequest, "use sign out to end the current session")
		return
	}
	ok, err := s.auth.RevokeSessionByID(r.Context(), a.User.ID, sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke session")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) revokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	if a.Session == nil {
		writeError(w, http.StatusBadRequest, "current session is required")
		return
	}
	n, err := s.auth.RevokeOtherSessionsByID(r.Context(), a.User.ID, a.Session.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke sessions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"revoked": n})
}
