package config

import (
	"errors"
	"net"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type PasswordResetConfig struct {
	URL  string
	TTL  time.Duration
	SMTP SMTPConfig
}

type SMTPConfig struct {
	Host     string
	Port     int
	From     string
	Username string
	Password string
	TLSMode  string
}

func loadPasswordResetConfig(environment string) (PasswordResetConfig, error) {
	settings := PasswordResetConfig{
		URL: strings.TrimSpace(os.Getenv("BACKEND_PASSWORD_RESET_URL")),
		TTL: 30 * time.Minute,
		SMTP: SMTPConfig{
			Host:     strings.TrimSpace(os.Getenv("BACKEND_SMTP_HOST")),
			From:     strings.TrimSpace(os.Getenv("BACKEND_SMTP_FROM")),
			Username: os.Getenv("BACKEND_SMTP_USERNAME"),
			Password: os.Getenv("BACKEND_SMTP_PASSWORD"),
			TLSMode:  getEnv("BACKEND_SMTP_TLS_MODE", "starttls"),
		},
	}
	if settings.URL == "" && settings.SMTP.Host == "" && settings.SMTP.From == "" && settings.SMTP.Username == "" && settings.SMTP.Password == "" {
		return PasswordResetConfig{}, nil
	}
	port, err := strconv.Atoi(getEnv("BACKEND_SMTP_PORT", "587"))
	if err != nil || port < 1 || port > 65535 {
		return PasswordResetConfig{}, errors.New("BACKEND_SMTP_PORT must be between 1 and 65535")
	}
	settings.SMTP.Port = port
	settings.TTL, err = getEnvPositiveDuration("BACKEND_PASSWORD_RESET_TTL", 30*time.Minute)
	if err != nil || settings.TTL > time.Hour {
		return PasswordResetConfig{}, errors.New("BACKEND_PASSWORD_RESET_TTL must be positive and at most 1h")
	}
	if err := validatePasswordResetConfig(settings, environment); err != nil {
		return PasswordResetConfig{}, err
	}
	return settings, nil
}

func validatePasswordResetConfig(settings PasswordResetConfig, environment string) error {
	local := environment == "development" || environment == "test"
	resetURL, err := url.Parse(settings.URL)
	if err != nil || resetURL.Hostname() == "" || resetURL.User != nil || resetURL.RawQuery != "" || resetURL.Fragment != "" ||
		(resetURL.Scheme != "https" && !(local && resetURL.Scheme == "http" && isLoopbackHost(resetURL.Hostname()))) {
		return errors.New("BACKEND_PASSWORD_RESET_URL must be a trusted HTTPS page without credentials, query or fragment; HTTP is allowed only for local development")
	}
	from, err := mail.ParseAddress(settings.SMTP.From)
	if err != nil || from.Address != settings.SMTP.From || strings.ContainsAny(settings.SMTP.From, "\r\n") {
		return errors.New("BACKEND_SMTP_FROM must be a single email address")
	}
	if settings.SMTP.Host == "" || strings.ContainsAny(settings.SMTP.Host, " /\\\r\n\t") {
		return errors.New("BACKEND_SMTP_HOST must be a hostname or IP address")
	}
	if (settings.SMTP.Username == "") != (settings.SMTP.Password == "") {
		return errors.New("BACKEND_SMTP_USERNAME and BACKEND_SMTP_PASSWORD must be configured together")
	}
	switch settings.SMTP.TLSMode {
	case "starttls", "implicit":
	case "none":
		if !local || !isLoopbackHost(settings.SMTP.Host) || settings.SMTP.Username != "" {
			return errors.New("unencrypted SMTP is allowed only for an unauthenticated local development mailbox")
		}
	default:
		return errors.New("BACKEND_SMTP_TLS_MODE must be starttls, implicit or none")
	}
	return nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
