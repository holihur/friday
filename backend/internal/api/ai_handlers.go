package api

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/ai"
	"friday/backend/internal/models"
	"friday/backend/internal/secret"
)

type AIConfigView struct {
	Configured  bool      `json:"configured"`
	Provider    string    `json:"provider"`
	BaseURL     string    `json:"baseUrl"`
	Model       string    `json:"model"`
	APIKeyLast4 string    `json:"apiKeyLast4,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt,omitempty"`
}

func (s *Server) aiConfigs() *mongo.Collection { return s.db.Database.Collection("user_ai_configs") }

func (s *Server) findAIConfig(ctx context.Context, userID primitive.ObjectID) (*models.UserAIConfig, error) {
	var cfg models.UserAIConfig
	err := s.aiConfigs().FindOne(ctx, bson.M{"userId": userID}).Decode(&cfg)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func aiView(cfg *models.UserAIConfig) AIConfigView {
	if cfg == nil {
		return AIConfigView{Configured: false, Provider: "openai-compatible"}
	}
	return AIConfigView{
		Configured:  true,
		Provider:    cfg.Provider,
		BaseURL:     cfg.BaseURL,
		Model:       cfg.Model,
		APIKeyLast4: cfg.APIKeyLast4,
		UpdatedAt:   cfg.UpdatedAt,
	}
}

func (s *Server) getAIConfig(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	cfg, err := s.findAIConfig(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"config": aiView(cfg)})
}

func (s *Server) updateAIConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"baseUrl"`
		Model    string `json:"model"`
		APIKey   string `json:"apiKey"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Provider = strings.TrimSpace(req.Provider)
	if req.Provider == "" {
		req.Provider = "openai-compatible"
	}
	if req.Provider != "openai-compatible" {
		writeError(w, http.StatusBadRequest, "only openai-compatible providers are supported")
		return
	}
	baseURL, err := validateAIBaseURL(r.Context(), req.BaseURL, s.cfg.AIAllowPrivateEndpoints)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Model = strings.TrimSpace(req.Model)
	if req.Model == "" || len(req.Model) > 120 {
		writeError(w, http.StatusBadRequest, "model is required")
		return
	}
	a := authFrom(r)
	existing, err := s.findAIConfig(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	encrypted := ""
	last4 := ""
	if existing != nil {
		encrypted = existing.APIKeyEncrypted
		last4 = existing.APIKeyLast4
	}
	if key := strings.TrimSpace(req.APIKey); key != "" {
		encrypted, err = secret.Encrypt(secret.Key(s.cfg), key)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not encrypt provider key")
			return
		}
		if len(key) >= 4 {
			last4 = key[len(key)-4:]
		} else {
			last4 = "****"
		}
	}
	if encrypted == "" {
		writeError(w, http.StatusBadRequest, "provider API key is required")
		return
	}
	now := time.Now()
	_, err = s.aiConfigs().UpdateOne(r.Context(), bson.M{"userId": a.User.ID}, bson.M{
		"$set": bson.M{
			"provider":        req.Provider,
			"baseUrl":         baseURL,
			"model":           req.Model,
			"apiKeyEncrypted": encrypted,
			"apiKeyLast4":     last4,
			"updatedAt":       now,
		},
		"$setOnInsert": bson.M{"createdAt": now},
	}, options.Update().SetUpsert(true))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save AI settings")
		return
	}
	cfg, _ := s.findAIConfig(r.Context(), a.User.ID)
	writeJSON(w, http.StatusOK, map[string]any{"config": aiView(cfg)})
}

func (s *Server) deleteAIConfig(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	if _, err := s.aiConfigs().DeleteOne(r.Context(), bson.M{"userId": a.User.ID}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove AI settings")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) testAIConfig(w http.ResponseWriter, r *http.Request) {
	a := authFrom(r)
	cfg, err := s.findAIConfig(r.Context(), a.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	if cfg == nil {
		writeError(w, http.StatusBadRequest, "AI is not configured")
		return
	}
	key, err := secret.Decrypt(secret.Key(s.cfg), cfg.APIKeyEncrypted)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not decrypt provider key")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	if err := ai.Test(ctx, ai.Config{BaseURL: cfg.BaseURL, APIKey: key, Model: cfg.Model}); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func validateAIBaseURL(_ context.Context, raw string, allowPrivate bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("base URL is required")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return "", fmt.Errorf("invalid base URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("base URL must use http or https")
	}
	if u.User != nil {
		return "", fmt.Errorf("base URL must not contain credentials")
	}
	if !allowPrivate {
		host := strings.ToLower(u.Hostname())
		if host == "localhost" || strings.HasSuffix(host, ".localhost") {
			return "", fmt.Errorf("private AI endpoints are disabled; set AI_ALLOW_PRIVATE_ENDPOINTS=true for local models")
		}
		ips, err := net.LookupIP(host)
		if err != nil {
			return "", fmt.Errorf("could not resolve AI endpoint host")
		}
		for _, ip := range ips {
			if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
				return "", fmt.Errorf("private AI endpoints are disabled; set AI_ALLOW_PRIVATE_ENDPOINTS=true for local models")
			}
		}
	}
	return strings.TrimRight(u.String(), "/"), nil
}
