package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/oauth2"

	"friday/backend/internal/models"
)

var ErrOIDCNotConfigured = errors.New("oidc is not configured")

type oidcClaims struct {
	Sub               string `json:"sub"`
	Email             string `json:"email"`
	EmailVerified     *bool  `json:"email_verified"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	Picture           string `json:"picture"`
}

type OIDCIdentity struct {
	Issuer string
	Sub    string
	Email  string
	Name   string
}

func (s *Service) OIDCConfig(ctx context.Context) (*oidc.Provider, *oauth2.Config, error) {
	if !s.Cfg.OIDCEnabled() {
		return nil, nil, ErrOIDCNotConfigured
	}

	s.oidcOnce.Do(func() {
		initCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		provider, err := oidc.NewProvider(initCtx, s.Cfg.OIDCIssuer)
		if err != nil {
			s.oidcErr = err
			return
		}
		s.oidcProvider = provider
		s.oauthConfig = &oauth2.Config{
			ClientID:     s.Cfg.OIDCClientID,
			ClientSecret: s.Cfg.OIDCClientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  s.Cfg.OIDCRedirectURL,
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
		}
	})
	if s.oidcErr != nil {
		return nil, nil, s.oidcErr
	}
	return s.oidcProvider, s.oauthConfig, nil
}

func (s *Service) VerifyOIDCCallback(ctx context.Context, code, expectedNonce string) (*models.User, error) {
	provider, oauthCfg, err := s.OIDCConfig(ctx)
	if err != nil {
		return nil, err
	}

	token, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange oidc code: %w", err)
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return nil, errors.New("oidc provider did not return an id_token")
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: s.Cfg.OIDCClientID}).Verify(ctx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}
	if expectedNonce != "" && idToken.Nonce != expectedNonce {
		return nil, errors.New("id_token nonce does not match the sign-in request")
	}
	var claims oidcClaims
	if err := idToken.Claims(&claims); err != nil {
		return nil, err
	}
	if claims.Email == "" {
		return nil, errors.New("oidc provider did not return an email address")
	}
	if claims.EmailVerified != nil && !*claims.EmailVerified {
		return nil, errors.New("the identity provider has not verified this email address")
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = claims.PreferredUsername
	}
	if name == "" {
		name = strings.Split(claims.Email, "@")[0]
	}
	return s.FindOrCreateOIDCUser(ctx, OIDCIdentity{
		Issuer: idToken.Issuer,
		Sub:    claims.Sub,
		Email:  NormalizeEmail(claims.Email),
		Name:   name,
	})
}

func (s *Service) FindOrCreateOIDCUser(ctx context.Context, ident OIDCIdentity) (*models.User, error) {
	var u models.User
	err := s.Users().FindOne(ctx, bson.M{"oidcIssuer": ident.Issuer, "oidcSubject": ident.Sub}).Decode(&u)
	if err == nil {
		u.OIDCConnected = true
		return &u, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	err = s.Users().FindOne(ctx, bson.M{"email": ident.Email}).Decode(&u)
	if err == nil {
		// Link an existing local account, unless it already points at another identity.
		if u.OIDCIssuer != "" && (u.OIDCIssuer != ident.Issuer || u.OIDCSubject != ident.Sub) {
			return nil, errors.New("this email is already linked to a different identity provider")
		}
		_, err = s.Users().UpdateOne(ctx, bson.M{"_id": u.ID}, bson.M{"$set": bson.M{
			"oidcIssuer":  ident.Issuer,
			"oidcSubject": ident.Sub,
			"lastLoginAt": time.Now(),
			"updatedAt":   time.Now(),
		}})
		if err != nil {
			return nil, err
		}
		u.OIDCIssuer = ident.Issuer
		u.OIDCSubject = ident.Sub
		u.OIDCConnected = true
		return &u, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	now := time.Now()
	u = models.User{
		ID:            primitive.NewObjectID(),
		Email:         ident.Email,
		Name:          ident.Name,
		AvatarColor:   RandomAvatarColor(),
		OIDCIssuer:    ident.Issuer,
		OIDCSubject:   ident.Sub,
		LastLoginAt:   &now,
		CreatedAt:     now,
		UpdatedAt:     now,
		OIDCConnected: true,
	}
	if _, err := s.Users().InsertOne(ctx, u); err != nil {
		return nil, err
	}
	return &u, nil
}
