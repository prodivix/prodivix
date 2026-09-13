package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync"
	"time"
)

const (
	authLimitWindow     = 5 * time.Minute
	authLimitPerIP      = 30
	authLimitPerAccount = 10
)

type authAttemptWindow struct {
	startedAt time.Time
	count     int
}

type authAttemptLimiter struct {
	mu        sync.Mutex
	now       func() time.Time
	byIP      map[string]authAttemptWindow
	byAccount map[string]authAttemptWindow
	requests  uint64
}

func newAuthAttemptLimiter() *authAttemptLimiter {
	return &authAttemptLimiter{
		now:       time.Now,
		byIP:      make(map[string]authAttemptWindow),
		byAccount: make(map[string]authAttemptWindow),
	}
}

func (limiter *authAttemptLimiter) allow(ip, email string) (bool, time.Duration) {
	if limiter == nil {
		return false, authLimitWindow
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
	if allowed, retryAfter := consumeAuthWindow(limiter.byIP, ip, authLimitPerIP, now); !allowed {
		return false, retryAfter
	}
	if allowed, retryAfter := consumeAuthWindow(limiter.byAccount, accountKey, authLimitPerAccount, now); !allowed {
		return false, retryAfter
	}
	return true, 0
}

func consumeAuthWindow(windows map[string]authAttemptWindow, key string, limit int, now time.Time) (bool, time.Duration) {
	window := windows[key]
	if window.startedAt.IsZero() || now.Sub(window.startedAt) >= authLimitWindow {
		windows[key] = authAttemptWindow{startedAt: now, count: 1}
		return true, 0
	}
	if window.count >= limit {
		return false, authLimitWindow - now.Sub(window.startedAt)
	}
	window.count++
	windows[key] = window
	return true, 0
}

func (limiter *authAttemptLimiter) removeExpired(now time.Time) {
	for key, window := range limiter.byIP {
		if now.Sub(window.startedAt) >= authLimitWindow {
			delete(limiter.byIP, key)
		}
	}
	for key, window := range limiter.byAccount {
		if now.Sub(window.startedAt) >= authLimitWindow {
			delete(limiter.byAccount, key)
		}
	}
}
