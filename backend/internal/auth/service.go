package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"

	"friday/backend/internal/config"
	"friday/backend/internal/database"
	"friday/backend/internal/models"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrTOTPRequired       = errors.New("totp required")
	ErrTOTPInvalid        = errors.New("invalid authenticator code")
	ErrChallengeExpired   = errors.New("login challenge expired, please sign in again")
)

// Every token's scope set is one of these.
var AllPATScopes = []string{
	"boards:read",
	"boards:write",
	"items:read",
	"items:write",
	"users:read",
}

var avatarColors = []string{"#6161ff", "#00c875", "#fdab3d", "#e2445c", "#579bfc", "#a25ddc", "#00a9a5", "#ff7a00"}

// dummyHash keeps failed email lookups roughly as expensive as wrong passwords.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("friday-dummy-password"), bcrypt.DefaultCost)

type Service struct {
	DB  *database.DB
	Cfg *config.Config

	oidcOnce     sync.Once
	oidcProvider *oidc.Provider
	oauthConfig  *oauth2.Config
	oidcErr      error
}

func New(db *database.DB, cfg *config.Config) *Service {
	return &Service{DB: db, Cfg: cfg}
}

func (s *Service) Users() *mongo.Collection      { return s.DB.Database.Collection("users") }
func (s *Service) Sessions() *mongo.Collection   { return s.DB.Database.Collection("sessions") }
func (s *Service) Challenges() *mongo.Collection { return s.DB.Database.Collection("login_challenges") }
func (s *Service) PATs() *mongo.Collection       { return s.DB.Database.Collection("personal_access_tokens") }
func (s *Service) PasswordResets() *mongo.Collection {
	return s.DB.Database.Collection("password_reset_tokens")
}

// ---------- Passwords ----------

func NormalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

func (s *Service) FindUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.Users().FindOne(ctx, bson.M{"email": NormalizeEmail(email)}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Service) FindUserByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var u models.User
	err := s.Users().FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// VerifyPassword returns (user, nil) on success. Unknown users still run a bcrypt compare.
func (s *Service) VerifyPassword(ctx context.Context, email, password string) (*models.User, error) {
	u, err := s.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if u == nil || u.PasswordHash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return nil, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	return u, nil
}

// ---------- Sessions ----------

func randomToken(prefix string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + base64.RawURLEncoding.EncodeToString(b), nil
}

func tokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *Service) CreateSession(ctx context.Context, userID primitive.ObjectID, userAgent, ip string) (string, *models.Session, error) {
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	raw, err := randomToken("sess_")
	if err != nil {
		return "", nil, err
	}
	now := time.Now()
	sess := &models.Session{
		ID:        primitive.NewObjectID(),
		TokenHash: tokenHash(raw),
		UserID:    userID,
		UserAgent: userAgent,
		IP:        ip,
		ExpiresAt: now.Add(s.Cfg.SessionTTL),
		CreatedAt: now,
	}
	if _, err := s.Sessions().InsertOne(ctx, sess); err != nil {
		return "", nil, err
	}
	_, _ = s.Users().UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"lastLoginAt": now, "updatedAt": now}})
	return raw, sess, nil
}

func (s *Service) AuthenticateSession(ctx context.Context, raw string) (*models.User, *models.Session, error) {
	if raw == "" {
		return nil, nil, ErrInvalidToken
	}
	var sess models.Session
	err := s.Sessions().FindOne(ctx, bson.M{"tokenHash": tokenHash(raw)}).Decode(&sess)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil, ErrInvalidToken
	}
	if err != nil {
		return nil, nil, err
	}
	if time.Now().After(sess.ExpiresAt) {
		_, _ = s.Sessions().DeleteOne(ctx, bson.M{"_id": sess.ID})
		return nil, nil, ErrInvalidToken
	}
	u, err := s.FindUserByID(ctx, sess.UserID)
	if err != nil {
		return nil, nil, err
	}
	if u == nil {
		return nil, nil, ErrInvalidToken
	}
	return u, &sess, nil
}

func (s *Service) RevokeSession(ctx context.Context, raw string) error {
	_, err := s.Sessions().DeleteOne(ctx, bson.M{"tokenHash": tokenHash(raw)})
	return err
}

func (s *Service) RevokeOtherSessions(ctx context.Context, userID primitive.ObjectID, keepRaw string) error {
	filter := bson.M{"userId": userID}
	if keepRaw != "" {
		filter["tokenHash"] = bson.M{"$ne": tokenHash(keepRaw)}
	}
	_, err := s.Sessions().DeleteMany(ctx, filter)
	return err
}

func (s *Service) ListSessions(ctx context.Context, userID primitive.ObjectID) ([]models.Session, error) {
	out := []models.Session{}
	cur, err := s.Sessions().Find(ctx, bson.M{"userId": userID, "expiresAt": bson.M{"$gt": time.Now()}}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Service) RevokeSessionByID(ctx context.Context, userID, sessionID primitive.ObjectID) (bool, error) {
	res, err := s.Sessions().DeleteOne(ctx, bson.M{"_id": sessionID, "userId": userID})
	if err != nil {
		return false, err
	}
	return res.DeletedCount > 0, nil
}

func (s *Service) RevokeOtherSessionsByID(ctx context.Context, userID, currentSessionID primitive.ObjectID) (int64, error) {
	res, err := s.Sessions().DeleteMany(ctx, bson.M{"userId": userID, "_id": bson.M{"$ne": currentSessionID}})
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

// NewCSRFToken returns a double-submit cookie token.
func NewCSRFToken() (string, error) { return randomToken("csrf_") }

// ---------- Login challenges (step 2 of TOTP login) ----------

func (s *Service) CreateLoginChallenge(ctx context.Context, userID primitive.ObjectID) (string, error) {
	raw, err := randomToken("chl_")
	if err != nil {
		return "", err
	}
	now := time.Now()
	ch := &models.LoginChallenge{
		ID:        primitive.NewObjectID(),
		TokenHash: tokenHash(raw),
		UserID:    userID,
		ExpiresAt: now.Add(5 * time.Minute),
		CreatedAt: now,
	}
	if _, err := s.Challenges().InsertOne(ctx, ch); err != nil {
		return "", err
	}
	return raw, nil
}

func (s *Service) FindLoginChallenge(ctx context.Context, raw string) (*models.LoginChallenge, error) {
	var ch models.LoginChallenge
	err := s.Challenges().FindOne(ctx, bson.M{"tokenHash": tokenHash(raw)}).Decode(&ch)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrChallengeExpired
	}
	if err != nil {
		return nil, err
	}
	if time.Now().After(ch.ExpiresAt) || ch.Attempts >= 5 {
		_, _ = s.Challenges().DeleteOne(ctx, bson.M{"_id": ch.ID})
		return nil, ErrChallengeExpired
	}
	return &ch, nil
}

func (s *Service) FailLoginChallenge(ctx context.Context, id primitive.ObjectID) {
	_, _ = s.Challenges().UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"attempts": 1}})
}

func (s *Service) ConsumeLoginChallenge(ctx context.Context, id primitive.ObjectID) {
	_, _ = s.Challenges().DeleteOne(ctx, bson.M{"_id": id})
}

// ---------- Personal access tokens ----------

func ValidScope(scope string) bool {
	for _, s := range AllPATScopes {
		if s == scope {
			return true
		}
	}
	return false
}

func (s *Service) CreatePAT(ctx context.Context, userID primitive.ObjectID, name string, scopes []string, expiresAt *time.Time) (string, *models.PersonalAccessToken, error) {
	raw, err := randomToken("fdy_")
	if err != nil {
		return "", nil, err
	}
	pat := &models.PersonalAccessToken{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		Name:      name,
		Prefix:    raw[:12],
		TokenHash: tokenHash(raw),
		Scopes:    scopes,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	if _, err := s.PATs().InsertOne(ctx, pat); err != nil {
		return "", nil, err
	}
	return raw, pat, nil
}

func (s *Service) AuthenticatePAT(ctx context.Context, raw string) (*models.User, *models.PersonalAccessToken, error) {
	var pat models.PersonalAccessToken
	err := s.PATs().FindOne(ctx, bson.M{"tokenHash": tokenHash(raw)}).Decode(&pat)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil, ErrInvalidToken
	}
	if err != nil {
		return nil, nil, err
	}
	now := time.Now()
	if pat.ExpiresAt != nil && now.After(*pat.ExpiresAt) {
		return nil, nil, ErrInvalidToken
	}
	u, err := s.FindUserByID(ctx, pat.UserID)
	if err != nil {
		return nil, nil, err
	}
	if u == nil {
		return nil, nil, ErrInvalidToken
	}
	_, _ = s.PATs().UpdateOne(ctx, bson.M{"_id": pat.ID}, bson.M{"$set": bson.M{"lastUsedAt": now}})
	pat.LastUsedAt = &now
	return u, &pat, nil
}

func (s *Service) ListPATs(ctx context.Context, userID primitive.ObjectID) ([]models.PersonalAccessToken, error) {
	cur, err := s.PATs().Find(ctx, bson.M{"userId": userID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []models.PersonalAccessToken{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// HasScope implements the scope hierarchy: domain:write implies domain:read.
func HasScope(scopes []string, needed string) bool {
	for _, scope := range scopes {
		if scope == "*" || scope == needed {
			return true
		}
		if strings.HasSuffix(needed, ":read") && scope == strings.TrimSuffix(needed, ":read")+":write" {
			return true
		}
	}
	return false
}

// ---------- Password reset ----------

func (s *Service) CreatePasswordReset(ctx context.Context, userID primitive.ObjectID) (string, error) {
	raw, err := randomToken("prt_")
	if err != nil {
		return "", err
	}
	_, _ = s.PasswordResets().DeleteMany(ctx, bson.M{"userId": userID})
	now := time.Now()
	_, err = s.PasswordResets().InsertOne(ctx, models.PasswordResetToken{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		TokenHash: tokenHash(raw),
		ExpiresAt: now.Add(30 * time.Minute),
		CreatedAt: now,
	})
	if err != nil {
		return "", err
	}
	return raw, nil
}

func (s *Service) ConsumePasswordReset(ctx context.Context, raw string) (*models.PasswordResetToken, error) {
	var token models.PasswordResetToken
	err := s.PasswordResets().FindOne(ctx, bson.M{"tokenHash": tokenHash(raw)}).Decode(&token)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrInvalidToken
	}
	if err != nil {
		return nil, err
	}
	if time.Now().After(token.ExpiresAt) {
		_, _ = s.PasswordResets().DeleteOne(ctx, bson.M{"_id": token.ID})
		return nil, ErrInvalidToken
	}
	return &token, nil
}

func (s *Service) DeletePasswordResets(ctx context.Context, userID primitive.ObjectID) {
	_, _ = s.PasswordResets().DeleteMany(ctx, bson.M{"userId": userID})
}

func RandomAvatarColor() string {
	b := make([]byte, 1)
	_, _ = rand.Read(b)
	return avatarColors[int(b[0])%len(avatarColors)]
}

func Initials(name string) string {
	parts := strings.Fields(strings.TrimSpace(name))
	if len(parts) == 0 {
		return "?"
	}
	if len(parts) == 1 {
		return strings.ToUpper(string([]rune(parts[0])[0]))
	}
	return strings.ToUpper(string([]rune(parts[0])[0]) + string([]rune(parts[1])[0]))
}
