package database

func passwordResetMigration() migration {
	return migration{
		version: 47,
		name:    "product-password-reset",
		statements: []string{`CREATE TABLE auth_password_resets (
			user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			token_digest TEXT NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
			created_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
		)`},
	}
}
