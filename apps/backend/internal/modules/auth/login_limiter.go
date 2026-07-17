package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync"
	"time"
)

const (
	loginLimitWindow     = 5 * time.Minute
	loginLimitPerIP      = 30
	loginLimitPerAccount = 10
)

type loginAttemptWindow struct {
	startedAt time.Time
	count     int
}

type loginAttemptLimiter struct {
	mu        sync.Mutex
	now       func() time.Time
	byIP      map[string]loginAttemptWindow
	byAccount map[string]loginAttemptWindow
	requests  uint64
}

func newLoginAttemptLimiter() *loginAttemptLimiter {
	return &loginAttemptLimiter{
		now:       time.Now,
		byIP:      make(map[string]loginAttemptWindow),
		byAccount: make(map[string]loginAttemptWindow),
	}
}

func (limiter *loginAttemptLimiter) allow(ip, email string) (bool, time.Duration) {
	if limiter == nil {
		return false, loginLimitWindow
	}
	now := limiter.now().UTC()
	ip = strings.TrimSpace(ip)
	accountDigest := sha256.Sum256([]byte(normalizeEmail(email)))
	accountKey := hex.EncodeToString(accountDigest[:])

	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.requests++
	if limiter.requests%256 == 0 {
		limiter.removeExpired(now)
	}
	if allowed, retryAfter := consumeLoginWindow(limiter.byIP, ip, loginLimitPerIP, now); !allowed {
		return false, retryAfter
	}
	if allowed, retryAfter := consumeLoginWindow(limiter.byAccount, accountKey, loginLimitPerAccount, now); !allowed {
		return false, retryAfter
	}
	return true, 0
}

func consumeLoginWindow(windows map[string]loginAttemptWindow, key string, limit int, now time.Time) (bool, time.Duration) {
	window := windows[key]
	if window.startedAt.IsZero() || now.Sub(window.startedAt) >= loginLimitWindow {
		windows[key] = loginAttemptWindow{startedAt: now, count: 1}
		return true, 0
	}
	if window.count >= limit {
		return false, loginLimitWindow - now.Sub(window.startedAt)
	}
	window.count++
	windows[key] = window
	return true, 0
}

func (limiter *loginAttemptLimiter) removeExpired(now time.Time) {
	for key, window := range limiter.byIP {
		if now.Sub(window.startedAt) >= loginLimitWindow {
			delete(limiter.byIP, key)
		}
	}
	for key, window := range limiter.byAccount {
		if now.Sub(window.startedAt) >= loginLimitWindow {
			delete(limiter.byAccount, key)
		}
	}
}
