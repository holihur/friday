package mail

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"friday/backend/internal/config"
)

type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

type Sender interface {
	Send(ctx context.Context, msg Message) error
	Enabled() bool
}

func New(cfg *config.Config) Sender {
	if cfg.SMTPEnabled() {
		return &smtpSender{cfg: cfg}
	}
	return &logSender{}
}

type logSender struct{}

func (l *logSender) Enabled() bool { return false }

func (l *logSender) Send(_ context.Context, msg Message) error {
	slog.Info("email (dev log; SMTP not configured)", "to", msg.To, "subject", msg.Subject, "body", msg.Text)
	return nil
}

type smtpSender struct {
	cfg *config.Config
}

func (s *smtpSender) Enabled() bool { return true }

func (s *smtpSender) Send(ctx context.Context, msg Message) error {
	from, err := mail.ParseAddress(s.cfg.SMTPFrom)
	if err != nil || from.Address == "" {
		from = &mail.Address{Name: s.cfg.SMTPFromName, Address: "no-reply@friday.local"}
	}
	to, err := mail.ParseAddress(msg.To)
	if err != nil {
		return fmt.Errorf("invalid recipient: %w", err)
	}
	host, _, _ := net.SplitHostPort(s.cfg.SMTPHost)
	addr := s.cfg.SMTPHost
	if !strings.Contains(addr, ":") {
		addr = fmt.Sprintf("%s:%d", addr, s.cfg.SMTPPort)
	}
	if host == "" {
		host = s.cfg.SMTPHost
	}

	dialer := &net.Dialer{Timeout: 12 * time.Second}
	var conn net.Conn
	if s.cfg.SMTPImplicitTLS {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(20 * time.Second))

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()
	if !s.cfg.SMTPImplicitTLS && s.cfg.SMTPTLS {
		ok, _ := client.Extension("STARTTLS")
		if !ok {
			return fmt.Errorf("smtp server does not advertise STARTTLS; set SMTP_TLS=false only for trusted local relays")
		}
		if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.cfg.SMTPUsername != "" {
		auth := smtp.PlainAuth("", s.cfg.SMTPUsername, s.cfg.SMTPPassword, host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(from.Address); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(to.Address); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	body := buildMIME(from, to, msg)
	if _, err := w.Write([]byte(body)); err != nil {
		_ = w.Close()
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close data: %w", err)
	}
	_ = client.Quit()
	return nil
}

func buildMIME(from, to *mail.Address, msg Message) string {
	boundary := randomBoundary()
	var b strings.Builder
	b.WriteString("From: " + from.String() + "\r\n")
	b.WriteString("To: " + to.String() + "\r\n")
	b.WriteString("Subject: " + mime.BEncoding.Encode("utf-8", msg.Subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n")
	b.WriteString("\r\n")
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(base64.StdEncoding.EncodeToString([]byte(msg.Text)))
	b.WriteString("\r\n--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/html; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(base64.StdEncoding.EncodeToString([]byte(msg.HTML)))
	b.WriteString("\r\n--" + boundary + "--\r\n")
	return b.String()
}

func randomBoundary() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "friday-" + base64.RawURLEncoding.EncodeToString(b)
}
