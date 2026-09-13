package config

import (
	"testing"
	"time"
)

func TestPasswordResetConfigRequiresTrustedURLAndEncryptedSMTP(t *testing.T) {
	valid := PasswordResetConfig{URL: "https://app.example.test/auth/reset-password", TTL: 30 * time.Minute, SMTP: SMTPConfig{Host: "smtp.example.test", Port: 587, From: "accounts@example.test", TLSMode: "starttls"}}
	if err := validatePasswordResetConfig(valid, "production"); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name   string
		change func(*PasswordResetConfig)
	}{
		{"untrusted HTTP link", func(c *PasswordResetConfig) { c.URL = "http://app.example.test/auth/reset-password" }},
		{"URL credentials", func(c *PasswordResetConfig) { c.URL = "https://user:secret@app.example.test/auth/reset-password" }},
		{"URL query", func(c *PasswordResetConfig) { c.URL += "?next=untrusted" }},
		{"URL fragment", func(c *PasswordResetConfig) { c.URL += "#unexpected" }},
		{"SMTP header injection", func(c *PasswordResetConfig) { c.SMTP.From = "accounts@example.test\r\nBcc: elsewhere@example.test" }},
		{"SMTP downgrade", func(c *PasswordResetConfig) { c.SMTP.TLSMode = "none" }},
		{"incomplete auth", func(c *PasswordResetConfig) { c.SMTP.Username = "sender" }},
		{"unknown TLS mode", func(c *PasswordResetConfig) { c.SMTP.TLSMode = "optional" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			c := valid
			test.change(&c)
			if err := validatePasswordResetConfig(c, "production"); err == nil {
				t.Fatal("unsafe mail configuration was accepted")
			}
		})
	}
	local := valid
	local.URL = "http://localhost:5173/auth/reset-password"
	local.SMTP.Host = "127.0.0.1"
	local.SMTP.Port = 1025
	local.SMTP.TLSMode = "none"
	if err := validatePasswordResetConfig(local, "development"); err != nil {
		t.Fatal(err)
	}
	if err := validatePasswordResetConfig(local, "production"); err == nil {
		t.Fatal("development mailbox was accepted in production")
	}
}

func TestLoadPasswordResetConfigRejectsInvalidBounds(t *testing.T) {
	t.Setenv("BACKEND_PASSWORD_RESET_URL", "https://app.example.test/auth/reset-password")
	t.Setenv("BACKEND_SMTP_HOST", "smtp.example.test")
	t.Setenv("BACKEND_SMTP_FROM", "accounts@example.test")
	for _, test := range []struct{ key, value string }{
		{"BACKEND_SMTP_PORT", "0"}, {"BACKEND_SMTP_PORT", "65536"}, {"BACKEND_SMTP_PORT", "invalid"},
		{"BACKEND_PASSWORD_RESET_TTL", "0s"}, {"BACKEND_PASSWORD_RESET_TTL", "2h"},
	} {
		t.Run(test.key+test.value, func(t *testing.T) {
			t.Setenv(test.key, test.value)
			if _, err := loadPasswordResetConfig("production"); err == nil {
				t.Fatal("invalid mail bounds were accepted")
			}
		})
	}
}
