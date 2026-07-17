package auth

import "time"

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	AvatarURL    string    `json:"avatarUrl"`
	PasswordHash []byte    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type PublicUser struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	AvatarURL   string    `json:"avatarUrl"`
	CreatedAt   time.Time `json:"createdAt"`
}

type PublicProfile struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	AvatarURL   string    `json:"avatarUrl"`
	CreatedAt   time.Time `json:"createdAt"`
}

func NewPublicUser(user *User) PublicUser {
	if user == nil {
		return PublicUser{}
	}
	return PublicUser{
		ID:          user.ID,
		Email:       user.Email,
		Name:        user.Name,
		Description: user.Description,
		AvatarURL:   user.AvatarURL,
		CreatedAt:   user.CreatedAt,
	}
}

func NewPublicProfile(user *User) PublicProfile {
	if user == nil {
		return PublicProfile{}
	}
	return PublicProfile{
		ID:          user.ID,
		Name:        user.Name,
		Description: user.Description,
		AvatarURL:   user.AvatarURL,
		CreatedAt:   user.CreatedAt,
	}
}

type Session struct {
	ID        string    `json:"-"`
	Token     string    `json:"token"`
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}
