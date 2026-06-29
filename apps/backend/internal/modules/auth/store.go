package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

var ErrEmailExists = errors.New("email already exists")
var ErrUserNotFound = errors.New("user not found")

type UserStore struct {
	db *sql.DB
}

func NewUserStore(db *sql.DB) *UserStore {
	return &UserStore{db: db}
}

func (store *UserStore) Create(email, name, description string, passwordHash []byte) (*User, error) {
	normalized := normalizeEmail(email)
	if normalized == "" {
		return nil, errors.New("invalid email")
	}
	user := &User{
		ID:           newID("usr"),
		Email:        normalized,
		Name:         strings.TrimSpace(name),
		Description:  strings.TrimSpace(description),
		AvatarURL:    "",
		PasswordHash: passwordHash,
		CreatedAt:    time.Now().UTC(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `INSERT INTO users (id, email, name, description, avatar_url, password_hash, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := store.db.ExecContext(ctx, query, user.ID, user.Email, user.Name, user.Description, user.AvatarURL, user.PasswordHash, user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrEmailExists
		}
		return nil, err
	}
	return user, nil
}

func (store *UserStore) GetByEmail(email string) (*User, bool) {
	normalized := normalizeEmail(email)
	if normalized == "" {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `SELECT id, email, name, description, avatar_url, password_hash, created_at
FROM users
WHERE email = $1`
	row := store.db.QueryRowContext(ctx, query, normalized)
	user, err := scanUser(row)
	if err != nil {
		return nil, false
	}
	return user, true
}

func (store *UserStore) GetByID(id string) (*User, bool) {
	if strings.TrimSpace(id) == "" {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `SELECT id, email, name, description, avatar_url, password_hash, created_at
FROM users
WHERE id = $1`
	row := store.db.QueryRowContext(ctx, query, id)
	user, err := scanUser(row)
	if err != nil {
		return nil, false
	}
	return user, true
}

func (store *UserStore) Update(userID string, name, description *string) (*User, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrUserNotFound
	}
	updateParts := make([]string, 0, 2)
	args := make([]any, 0, 3)
	argPos := 1
	if name != nil {
		updateParts = append(updateParts, "name = $1")
		args = append(args, strings.TrimSpace(*name))
		argPos++
	}
	if description != nil {
		updateParts = append(updateParts, "description = $"+strconv.Itoa(argPos))
		args = append(args, strings.TrimSpace(*description))
		argPos++
	}
	if len(updateParts) == 0 {
		user, ok := store.GetByID(userID)
		if !ok {
			return nil, ErrUserNotFound
		}
		return user, nil
	}
	args = append(args, userID)
	query := `UPDATE users SET ` + strings.Join(updateParts, ", ") + ` WHERE id = $` + strconv.Itoa(argPos) + `
RETURNING id, email, name, description, avatar_url, password_hash, created_at`
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	row := store.db.QueryRowContext(ctx, query, args...)
	user, err := scanUser(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return user, nil
}

func (store *UserStore) UpdateAvatarURL(userID string, avatarURL string) (*User, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrUserNotFound
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `UPDATE users SET avatar_url = $1 WHERE id = $2
RETURNING id, email, name, description, avatar_url, password_hash, created_at`
	row := store.db.QueryRowContext(ctx, query, strings.TrimSpace(avatarURL), userID)
	user, err := scanUser(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return user, nil
}

type SessionStore struct {
	db *sql.DB
}

func NewSessionStore(db *sql.DB) *SessionStore {
	return &SessionStore{db: db}
}

func (store *SessionStore) Create(userID string, ttl time.Duration) *Session {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	createdAt := time.Now().UTC()
	session := &Session{
		Token:     newToken(),
		UserID:    userID,
		CreatedAt: createdAt,
		ExpiresAt: createdAt.Add(ttl),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `INSERT INTO sessions (token, user_id, created_at, expires_at)
VALUES ($1, $2, $3, $4)`
	_, err := store.db.ExecContext(ctx, query, session.Token, session.UserID, session.CreatedAt, session.ExpiresAt)
	if err != nil {
		return nil
	}
	return session
}

func (store *SessionStore) Get(token string) (*Session, bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `SELECT token, user_id, created_at, expires_at
FROM sessions
WHERE token = $1 AND expires_at > NOW()`
	row := store.db.QueryRowContext(ctx, query, token)
	session := &Session{}
	err := row.Scan(&session.Token, &session.UserID, &session.CreatedAt, &session.ExpiresAt)
	if err != nil {
		return nil, false
	}
	return session, true
}

func (store *SessionStore) Delete(token string) {
	token = strings.TrimSpace(token)
	if token == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const query = `DELETE FROM sessions WHERE token = $1`
	_, _ = store.db.ExecContext(ctx, query, token)
}

func normalizeEmail(email string) string {
	value := strings.TrimSpace(strings.ToLower(email))
	if value == "" {
		return ""
	}
	return value
}

func newID(prefix string) string {
	return prefix + "_" + newRandomHex(16)
}

func newToken() string {
	return newRandomHex(32)
}

func newRandomHex(size int) string {
	buffer := make([]byte, size)
	_, err := rand.Read(buffer)
	if err != nil {
		return hex.EncodeToString([]byte(time.Now().Format("20060102150405.000")))
	}
	return hex.EncodeToString(buffer)
}

func scanUser(scanner interface{ Scan(dest ...any) error }) (*User, error) {
	user := &User{}
	err := scanner.Scan(&user.ID, &user.Email, &user.Name, &user.Description, &user.AvatarURL, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
