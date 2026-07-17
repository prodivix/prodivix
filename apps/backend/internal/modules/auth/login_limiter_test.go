package auth

import (
	"testing"
	"time"
)

func TestLoginAttemptLimiterPartitionsByIPAndAccount(t *testing.T) {
	limiter := newLoginAttemptLimiter()
	now := time.Unix(1_700_000_000, 0)
	limiter.now = func() time.Time { return now }

	for attempt := 0; attempt < loginLimitPerAccount; attempt++ {
		if allowed, _ := limiter.allow("192.0.2.1", "User@example.test"); !allowed {
			t.Fatalf("attempt %d was rejected early", attempt)
		}
	}
	if allowed, retryAfter := limiter.allow("192.0.2.2", "user@example.test"); allowed || retryAfter <= 0 {
		t.Fatalf("expected account partition to be limited, got %v, %v", allowed, retryAfter)
	}

	now = now.Add(loginLimitWindow)
	if allowed, _ := limiter.allow("192.0.2.2", "user@example.test"); !allowed {
		t.Fatal("expected expired window to reopen")
	}
}
