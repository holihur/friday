package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if r.Body == nil {
		writeError(w, http.StatusBadRequest, "request body is required")
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func pathObjectID(w http.ResponseWriter, r *http.Request, key string) (primitive.ObjectID, bool) {
	id, err := primitive.ObjectIDFromHex(r.PathValue(key))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid "+key)
		return primitive.NilObjectID, false
	}
	return id, true
}

func statusOK(w http.ResponseWriter, v any) { writeJSON(w, http.StatusOK, v) }

var errNotFound = errors.New("not found")
