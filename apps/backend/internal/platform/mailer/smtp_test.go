package mailer

import (
	"context"
	"net"
	"net/textproto"
	"strings"
	"testing"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

func smtpFixture(t *testing.T) (backendconfig.SMTPConfig, <-chan string) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	messages := make(chan string, 1)
	go func() {
		connection, err := listener.Accept()
		if err != nil {
			return
		}
		defer connection.Close()
		_ = connection.SetDeadline(time.Now().Add(5 * time.Second))
		protocol := textproto.NewConn(connection)
		_ = protocol.PrintfLine("220 localhost ESMTP")
		for {
			line, err := protocol.ReadLine()
			if err != nil {
				return
			}
			switch {
			case strings.HasPrefix(line, "EHLO"), strings.HasPrefix(line, "HELO"), strings.HasPrefix(line, "MAIL FROM"), strings.HasPrefix(line, "RCPT TO"):
				_ = protocol.PrintfLine("250 OK")
			case line == "DATA":
				_ = protocol.PrintfLine("354 Send message")
				data, err := protocol.ReadDotBytes()
				if err != nil {
					return
				}
				messages <- string(data)
				_ = protocol.PrintfLine("250 Accepted")
			case line == "QUIT":
				_ = protocol.PrintfLine("221 Bye")
				return
			default:
				_ = protocol.PrintfLine("500 Unsupported")
			}
		}
	}()
	return backendconfig.SMTPConfig{Host: "127.0.0.1", Port: listener.Addr().(*net.TCPAddr).Port, From: "accounts@example.test", TLSMode: "none"}, messages
}

func TestSMTPDeliversResetLinkToLocalMailbox(t *testing.T) {
	settings, messages := smtpFixture(t)
	link := "http://localhost:5173/auth/reset-password#token=" + strings.Repeat("a", 64)
	if err := NewSMTP(settings).Send(context.Background(), "user@example.test", link); err != nil {
		t.Fatal(err)
	}
	message := <-messages
	if !strings.Contains(message, link) || !strings.Contains(message, "To: user@example.test") {
		t.Fatal("reset email lacks recipient or link")
	}
}

func TestSMTPFailsClosedWhenRequiredTLSIsUnavailable(t *testing.T) {
	settings, messages := smtpFixture(t)
	settings.TLSMode = "starttls"
	if err := NewSMTP(settings).Send(context.Background(), "user@example.test", "https://app.example.test/reset#token=secret"); err == nil {
		t.Fatal("SMTP TLS downgrade was accepted")
	}
	select {
	case <-messages:
		t.Fatal("email was sent without required TLS")
	default:
	}
}

func TestSMTPRejectsHeaderInjectionAndUnknownTLSModes(t *testing.T) {
	settings := backendconfig.SMTPConfig{Host: "127.0.0.1", Port: 1, From: "accounts@example.test", TLSMode: "none"}
	for _, recipient := range []string{"user@example.test\r\nBcc: attacker@example.test", "invalid"} {
		if err := NewSMTP(settings).Send(context.Background(), recipient, "https://app.example.test/reset"); err == nil {
			t.Fatal("invalid recipient accepted")
		}
	}
	settings.TLSMode = "optional"
	if err := NewSMTP(settings).Send(context.Background(), "user@example.test", "https://app.example.test/reset"); err == nil {
		t.Fatal("unknown TLS policy accepted")
	}
}
