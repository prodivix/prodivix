package mailer

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

type SMTP struct{ settings backendconfig.SMTPConfig }

func NewSMTP(settings backendconfig.SMTPConfig) *SMTP { return &SMTP{settings: settings} }

// Send keeps SMTP credentials and the one-time link inside a bounded server transport.
// Provider replies are never returned to the browser or copied to application logs.
func (sender *SMTP) Send(ctx context.Context, recipient, resetURL string) error {
	address, err := mail.ParseAddress(recipient)
	if err != nil || address.Address != recipient || strings.ContainsAny(recipient+resetURL, "\r\n") {
		return errors.New("invalid password reset email")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	settings := sender.settings
	switch settings.TLSMode {
	case "starttls", "implicit":
	case "none":
		ip := net.ParseIP(settings.Host)
		if (settings.Host != "localhost" && (ip == nil || !ip.IsLoopback())) || settings.Username != "" || settings.Password != "" {
			return errors.New("unencrypted SMTP requires an unauthenticated loopback mailbox")
		}
	default:
		return errors.New("password reset mail TLS mode is invalid")
	}
	target := net.JoinHostPort(settings.Host, strconv.Itoa(settings.Port))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	tlsConfig := &tls.Config{ServerName: settings.Host, MinVersion: tls.VersionTLS12}
	var connection net.Conn
	if settings.TLSMode == "implicit" {
		connection, err = (&tls.Dialer{NetDialer: dialer, Config: tlsConfig}).DialContext(ctx, "tcp", target)
	} else {
		connection, err = dialer.DialContext(ctx, "tcp", target)
	}
	if err != nil {
		return errors.New("password reset mail transport unavailable")
	}
	defer connection.Close()
	stopCancellation := context.AfterFunc(ctx, func() { _ = connection.Close() })
	defer stopCancellation()
	deadline, _ := ctx.Deadline()
	if err := connection.SetDeadline(deadline); err != nil {
		return errors.New("password reset mail transport unavailable")
	}
	client, err := smtp.NewClient(connection, settings.Host)
	if err != nil {
		return errors.New("password reset mail transport unavailable")
	}
	defer client.Close()
	if settings.TLSMode == "starttls" {
		if err := client.StartTLS(tlsConfig); err != nil {
			return errors.New("password reset mail TLS failed")
		}
	}
	if settings.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", settings.Username, settings.Password, settings.Host)); err != nil {
			return errors.New("password reset mail authentication failed")
		}
	}
	if err := client.Mail(settings.From); err != nil {
		return errors.New("password reset mail sender rejected")
	}
	if err := client.Rcpt(recipient); err != nil {
		return errors.New("password reset mail recipient rejected")
	}
	writer, err := client.Data()
	if err != nil {
		return errors.New("password reset mail delivery unavailable")
	}
	message := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: Reset your Prodivix password\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nUse this one-time link to reset your Prodivix password:\r\n\r\n%s\r\n\r\nThe link expires shortly. Request a new link if it has expired.\r\nIf you did not request this change, you can ignore this email.\r\n\r\n请使用上方的一次性链接重置 Prodivix 密码。链接过期后可重新申请。\r\n如果这不是你的操作，请忽略此邮件。\r\n", settings.From, recipient, resetURL)
	if _, err := io.WriteString(writer, message); err != nil {
		return errors.New("password reset mail delivery failed")
	}
	if err := writer.Close(); err != nil {
		return errors.New("password reset mail delivery failed")
	}
	_ = client.Quit()
	return nil
}
