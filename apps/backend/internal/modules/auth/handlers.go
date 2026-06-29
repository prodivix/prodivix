package auth

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const (
	avatarFormField       = "avatar"
	maxAvatarBytes        = 2 << 20
	maxAvatarRequestBytes = maxAvatarBytes + 64<<10
)

var allowedAvatarContentTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/avif": ".avif",
}

type Handler struct {
	users    *UserStore
	sessions *SessionStore
	tokenTTL time.Duration
}

func NewHandler(users *UserStore, sessions *SessionStore, tokenTTL time.Duration) *Handler {
	return &Handler{users: users, sessions: sessions, tokenTTL: tokenTTL}
}

func (handler *Handler) RequireAuth() gin.HandlerFunc {
	return RequireAuth(
		ResolveToken,
		func(token string) (string, bool) {
			session, ok := handler.sessions.Get(token)
			if !ok {
				return "", false
			}
			return session.UserID, true
		},
		func(userID string) (*User, bool) {
			return handler.users.GetByID(userID)
		},
		func(c *gin.Context) {
			respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		},
	)
}

func (handler *Handler) Routes(requireAuth gin.HandlerFunc) RouteHandlers {
	return RouteHandlers{
		Register:     handler.HandleRegister,
		Login:        handler.HandleLogin,
		Logout:       handler.HandleLogout,
		Me:           handler.HandleMe,
		UpdateMe:     handler.HandleUpdateMe,
		UpdateAvatar: handler.HandleUpdateAvatar,
		GetUser:      handler.HandleGetUser,
		RequireAuth:  requireAuth,
	}
}

func (handler *Handler) HandleRegister(c *gin.Context) {
	var request struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	email := strings.TrimSpace(request.Email)
	password := request.Password
	if !isValidEmail(email) {
		respondError(c, http.StatusBadRequest, "API-4001", "Email is invalid.")
		return
	}
	if len(password) < 8 {
		respondError(c, http.StatusBadRequest, "API-4001", "Password must be at least 8 characters.")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "API-9001", "Could not secure password.")
		return
	}
	user, err := handler.users.Create(email, request.Name, request.Description, passwordHash)
	if err != nil {
		if errors.Is(err, ErrEmailExists) {
			respondError(c, http.StatusConflict, "API-4009", "Email already registered.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not create user.")
		return
	}
	session := handler.sessions.Create(user.ID, handler.tokenTTL)
	if session == nil {
		respondError(c, http.StatusInternalServerError, "API-9001", "Could not create session.")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": NewPublicUser(user), "token": session.Token, "expiresAt": session.ExpiresAt})
}

func (handler *Handler) HandleLogin(c *gin.Context) {
	var request struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	user, ok := handler.users.GetByEmail(request.Email)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Invalid email or password.")
		return
	}
	if bcrypt.CompareHashAndPassword(user.PasswordHash, []byte(request.Password)) != nil {
		respondError(c, http.StatusUnauthorized, "API-2001", "Invalid email or password.")
		return
	}
	session := handler.sessions.Create(user.ID, handler.tokenTTL)
	if session == nil {
		respondError(c, http.StatusInternalServerError, "API-9001", "Could not create session.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": NewPublicUser(user), "token": session.Token, "expiresAt": session.ExpiresAt})
}

func (handler *Handler) HandleLogout(c *gin.Context) {
	token := ResolveToken(c)
	if token != "" {
		handler.sessions.Delete(token)
	}
	c.Status(http.StatusNoContent)
}

func (handler *Handler) HandleMe(c *gin.Context) {
	user, ok := GetAuthUser[User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": NewPublicUser(user)})
}

func (handler *Handler) HandleGetUser(c *gin.Context) {
	userID := c.Param("id")
	user, ok := handler.users.GetByID(userID)
	if !ok {
		respondError(c, http.StatusNotFound, "API-4004", "User not found.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": NewPublicUser(user)})
}

func (handler *Handler) HandleUpdateMe(c *gin.Context) {
	user, ok := GetAuthUser[User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	var request struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Invalid request payload.")
		return
	}
	updated, err := handler.users.Update(user.ID, request.Name, request.Description)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "User not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not update user.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": NewPublicUser(updated)})
}

func (handler *Handler) HandleUpdateAvatar(c *gin.Context) {
	user, ok := GetAuthUser[User](c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "API-2001", "Authentication required.")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarRequestBytes)
	file, err := c.FormFile(avatarFormField)
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Avatar file is required.")
		return
	}
	if file.Size <= 0 || file.Size > maxAvatarBytes {
		respondError(c, http.StatusBadRequest, "API-4001", "Avatar must be 2 MB or smaller.")
		return
	}
	src, err := file.Open()
	if err != nil {
		respondError(c, http.StatusBadRequest, "API-1001", "Could not read avatar file.")
		return
	}
	defer src.Close()

	header := make([]byte, 512)
	bytesRead, err := io.ReadFull(src, header)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		respondError(c, http.StatusBadRequest, "API-1001", "Could not read avatar file.")
		return
	}
	contentType := http.DetectContentType(header[:bytesRead])
	extension, ok := allowedAvatarContentTypes[contentType]
	if !ok {
		respondError(c, http.StatusBadRequest, "API-4001", "Avatar must be a PNG, JPEG, WebP, or AVIF image.")
		return
	}
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not process avatar file.")
		return
	}

	uploadDir := filepath.Join("data", "uploads", "avatars", user.ID)
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not prepare avatar storage.")
		return
	}
	fileName := newID("avatar") + extension
	destinationPath := filepath.Join(uploadDir, fileName)
	destination, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not save avatar file.")
		return
	}
	defer destination.Close()
	if _, err := io.Copy(destination, io.LimitReader(src, maxAvatarBytes+1)); err != nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not save avatar file.")
		return
	}
	if err := destination.Sync(); err != nil {
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not save avatar file.")
		return
	}

	avatarURL := "/uploads/avatars/" + user.ID + "/" + fileName
	updated, err := handler.users.UpdateAvatarURL(user.ID, avatarURL)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			respondError(c, http.StatusNotFound, "API-4004", "User not found.")
			return
		}
		respondError(c, http.StatusInternalServerError, "API-5001", "Could not update avatar.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": NewPublicUser(updated)})
}

func respondError(c *gin.Context, status int, code, message string) {
	backendresponse.Error(c, status, code, message)
}

func isValidEmail(email string) bool {
	email = strings.TrimSpace(email)
	if email == "" {
		return false
	}
	return strings.Contains(email, "@")
}
