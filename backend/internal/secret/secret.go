package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"strings"

	"friday/backend/internal/config"
)

func Key(cfg *config.Config) []byte {
	raw := strings.TrimSpace(cfg.EncryptionKey)
	if raw != "" {
		if b, err := base64.StdEncoding.DecodeString(raw); err == nil && len(b) == 32 {
			return b
		}
		if b, err := base64.RawStdEncoding.DecodeString(raw); err == nil && len(b) == 32 {
			return b
		}
		if b, err := hex.DecodeString(raw); err == nil && len(b) == 32 {
			return b
		}
		sum := sha256.Sum256([]byte(raw))
		slog.Warn("APP_ENCRYPTION_KEY is not 32-byte base64/hex; using SHA-256 of the provided value")
		return sum[:]
	}
	slog.Warn("APP_ENCRYPTION_KEY is not set; using an insecure development key. Set it before storing provider keys in production.")
	sum := sha256.Sum256([]byte("friday-dev:" + cfg.MongoDB + ":" + cfg.AppURL))
	return sum[:]
}

func Encrypt(key []byte, plain string) (string, error) {
	if plain == "" {
		return "", errors.New("plaintext is empty")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.RawStdEncoding.EncodeToString(out), nil
}

func Decrypt(key []byte, encoded string) (string, error) {
	raw, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("invalid ciphertext")
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
