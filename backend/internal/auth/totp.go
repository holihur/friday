package auth

import (
	"context"
	"crypto/rand"
	"strings"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"

	"friday/backend/internal/models"
)

const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func (s *Service) SetupTOTP(ctx context.Context, user *models.User) (string, string, error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Friday",
		AccountName: user.Email,
	})
	if err != nil {
		return "", "", err
	}
	_, err = s.Users().UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{
		"$set":   bson.M{"totpSecret": key.Secret(), "totpEnabled": false, "updatedAt": time.Now()},
		"$unset": bson.M{"totpRecoveryCodes": ""},
	})
	if err != nil {
		return "", "", err
	}
	return key.Secret(), key.URL(), nil
}

func ValidTOTP(secret, code string) bool {
	ok, err := totp.ValidateCustom(code, secret, time.Now().UTC(), totp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	return err == nil && ok
}

func (s *Service) EnableTOTP(ctx context.Context, user *models.User, code string) ([]string, error) {
	if user.TOTPSecret == "" || !ValidTOTP(user.TOTPSecret, code) {
		return nil, ErrTOTPInvalid
	}
	codes, hashes, err := generateRecoveryCodes(10)
	if err != nil {
		return nil, err
	}
	_, err = s.Users().UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{
		"$set": bson.M{"totpEnabled": true, "totpRecoveryCodes": hashes, "updatedAt": time.Now()},
	})
	if err != nil {
		return nil, err
	}
	return codes, nil
}

func generateRecoveryCodes(n int) ([]string, []string, error) {
	codes := make([]string, 0, n)
	hashes := make([]string, 0, n)
	for i := 0; i < n; i++ {
		buf := make([]byte, 8)
		if _, err := rand.Read(buf); err != nil {
			return nil, nil, err
		}
		raw := make([]byte, 8)
		for j, b := range buf {
			raw[j] = recoveryAlphabet[int(b)%len(recoveryAlphabet)]
		}
		code := string(raw[:4]) + "-" + string(raw[4:])
		hash, err := bcrypt.GenerateFromPassword([]byte(normalizeRecoveryCode(code)), bcrypt.DefaultCost)
		if err != nil {
			return nil, nil, err
		}
		codes = append(codes, code)
		hashes = append(hashes, string(hash))
	}
	return codes, hashes, nil
}

func normalizeRecoveryCode(code string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	code = strings.ReplaceAll(code, "-", "")
	code = strings.ReplaceAll(code, " ", "")
	return code
}

func (s *Service) ConsumeTOTPRecoveryCode(ctx context.Context, userID primitive.ObjectID, code string) (bool, error) {
	u, err := s.FindUserByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if u == nil {
		return false, ErrTOTPInvalid
	}
	normalized := normalizeRecoveryCode(code)
	if len(normalized) != 8 {
		return false, nil
	}
	for _, hash := range u.TOTPRecoveryCodes {
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(normalized)) == nil {
			_, err := s.Users().UpdateOne(ctx, bson.M{"_id": userID}, bson.M{
				"$pull": bson.M{"totpRecoveryCodes": hash},
				"$set":  bson.M{"updatedAt": time.Now()},
			})
			return true, err
		}
	}
	return false, nil
}

func (s *Service) DisableTOTP(ctx context.Context, userID primitive.ObjectID, code string) error {
	u, err := s.FindUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if u == nil || !u.TOTPEnabled || u.TOTPSecret == "" || !ValidTOTP(u.TOTPSecret, code) {
		ok, err := s.ConsumeTOTPRecoveryCode(ctx, userID, code)
		if err != nil || !ok {
			return ErrTOTPInvalid
		}
	}
	_, err = s.Users().UpdateOne(ctx, bson.M{"_id": userID}, bson.M{
		"$unset": bson.M{"totpSecret": "", "totpRecoveryCodes": ""},
		"$set":   bson.M{"totpEnabled": false, "updatedAt": time.Now()},
	})
	return err
}
