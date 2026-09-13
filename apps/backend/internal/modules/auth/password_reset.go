package auth

import (
	"context"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"net/url"
	"time"

	backendidentity "github.com/Prodivix/prodivix/apps/backend/internal/platform/identity"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type PasswordResetMailer interface {
	Send(context.Context, string, string) error
}

type PasswordResetService struct {
	store    *PasswordResetStore
	mailer   PasswordResetMailer
	resetURL string
	ttl      time.Duration
}

func NewPasswordResetService(store *PasswordResetStore, mailer PasswordResetMailer, resetURL string, ttl time.Duration) *PasswordResetService {
	return &PasswordResetService{store: store, mailer: mailer, resetURL: resetURL, ttl: ttl}
}

func (service *PasswordResetService) request(ctx context.Context, email string) error {
	token, err := backendidentity.NewRandomHex(32)
	if err != nil {
		return err
	}
	digest := authTokenDigest(token)
	found, err := service.store.Issue(ctx, email, digest, service.ttl)
	if err != nil || !found {
		return err
	}
	link, err := url.Parse(service.resetURL)
	if err != nil {
		return err
	}
	link.Fragment = "token=" + token
	if err := service.mailer.Send(ctx, email, link.String()); err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if revokeErr := service.store.Revoke(cleanupCtx, digest); revokeErr != nil {
			log.Print("password reset delivery cleanup failed")
		}
		return err
	}
	return nil
}

func (handler *Handler) HandleForgotPassword(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAuthJSONBytes)
	var request struct {
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, 400, "API-1001", "Invalid request payload.")
		return
	}
	if !allowAuthAttempt(c, handler.resetRequests, request.Email, "Too many password reset requests. Try again later.") {
		return
	}
	email := normalizeEmail(request.Email)
	if !isValidEmail(email) {
		respondError(c, 400, "API-4001", "Email is invalid.")
		return
	}
	if handler.passwordReset == nil {
		respondError(c, 503, "API-6001", "Password reset email is currently unavailable. Try again later.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if err := handler.passwordReset.request(ctx, email); err != nil {
		// A fixed message avoids copying SMTP replies, addresses or reset links to logs.
		log.Print("password reset request could not be delivered")
		respondError(c, 503, "API-6001", "Password reset email is currently unavailable. Try again later.")
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"accepted": true})
}

func (handler *Handler) HandleResetPassword(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAuthJSONBytes)
	var request struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, 400, "API-1001", "Invalid request payload.")
		return
	}
	if !allowAuthAttempt(c, handler.resetAttempts, request.Token, "Too many password reset attempts. Try again later.") {
		return
	}
	decoded, err := hex.DecodeString(request.Token)
	if err != nil || len(decoded) != 32 || hex.EncodeToString(decoded) != request.Token {
		respondError(c, 400, "API-2004", "This password reset link is invalid or expired. Request a new link.")
		return
	}
	if message := passwordValidationMessage(request.Password); message != "" {
		respondError(c, 400, "API-4001", message)
		return
	}
	if handler.passwordReset == nil {
		respondError(c, 503, "API-6001", "Password reset is currently unavailable. Try again later.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(request.Password), bcrypt.DefaultCost)
	if err != nil {
		respondError(c, 500, "API-9001", "Could not secure password.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	err = handler.passwordReset.store.Complete(ctx, authTokenDigest(request.Token), hash)
	if errors.Is(err, ErrInvalidResetToken) {
		respondError(c, 400, "API-2004", "This password reset link is invalid or expired. Request a new link.")
		return
	}
	if err != nil {
		respondError(c, 500, "API-5001", "Could not reset password. Try again later.")
		return
	}
	c.Status(http.StatusNoContent)
}

func passwordValidationMessage(password string) string {
	if len(password) < 8 {
		return "Password must be at least 8 characters."
	}
	if len(password) > 72 {
		return "Password must be 72 bytes or fewer."
	}
	return ""
}
