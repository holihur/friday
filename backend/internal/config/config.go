package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              string
	AppURL            string
	MongoURI          string
	MongoDB           string
	AllowRegistration bool
	SeedDemo          bool
	SessionTTL        time.Duration
	CookieSecure      bool
	CORSOrigins       []string
	FrontendDist      string

	OIDCIssuer       string
	OIDCClientID     string
	OIDCClientSecret string
	OIDCRedirectURL  string
	OIDCName         string

	SMTPHost        string
	SMTPPort        int
	SMTPUsername    string
	SMTPPassword    string
	SMTPFrom        string
	SMTPFromName    string
	SMTPTLS         bool
	SMTPImplicitTLS bool
}

func Load() *Config {
	// Local development: config may live at repo root or backend/.
	_ = godotenv.Load(".env", "../.env")

	appURL := env("APP_URL", "http://localhost:8090")
	c := &Config{
		Port:              env("PORT", "8090"),
		AppURL:            strings.TrimRight(appURL, "/"),
		MongoURI:          env("MONGO_URI", "mongodb://127.0.0.1:27017"),
		MongoDB:           env("MONGO_DB", "friday"),
		AllowRegistration: envBool("ALLOW_REGISTRATION", true),
		SeedDemo:          envBool("SEED_DEMO", true),
		SessionTTL:        time.Duration(envInt("SESSION_TTL_HOURS", 168)) * time.Hour,
		CookieSecure:      envBool("COOKIE_SECURE", strings.HasPrefix(appURL, "https://")),
		CORSOrigins:       splitCSV(env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		FrontendDist:      os.Getenv("FRONTEND_DIST"),

		OIDCIssuer:       os.Getenv("OIDC_ISSUER"),
		OIDCClientID:     os.Getenv("OIDC_CLIENT_ID"),
		OIDCClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
		OIDCRedirectURL:  env("OIDC_REDIRECT_URL", "http://localhost:8090/api/auth/oidc/callback"),
		OIDCName:         env("OIDC_NAME", "Single sign-on"),

		SMTPHost:        os.Getenv("SMTP_HOST"),
		SMTPPort:        envInt("SMTP_PORT", 587),
		SMTPUsername:    os.Getenv("SMTP_USERNAME"),
		SMTPPassword:    os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:        env("SMTP_FROM", "Friday <no-reply@friday.local>"),
		SMTPFromName:    env("SMTP_FROM_NAME", "Friday"),
		SMTPTLS:         envBool("SMTP_TLS", true),
		SMTPImplicitTLS: envBool("SMTP_IMPLICIT_TLS", false),
	}
	return c
}

func (c *Config) SMTPEnabled() bool { return c.SMTPHost != "" }

func (c *Config) OIDCEnabled() bool {
	return c.OIDCIssuer != "" && c.OIDCClientID != "" && c.OIDCClientSecret != ""
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func splitCSV(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
