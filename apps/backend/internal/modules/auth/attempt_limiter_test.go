package auth

import (
	"fmt"
	"testing"
	"time"
)

func TestAuthAttemptLimiterPartitionsByIPAndAccount(t *testing.T) {
	limiter := newAuthAttemptLimiter()
	now := time.Unix(1_700_000_000, 0)
	limiter.now = func() time.Time { return now }

	for attempt := 0; attempt < authLimitPerAccount; attempt++ {
		if allowed, _ := limiter.allow("192.0.2.1", "User@example.test"); !allowed {
			t.Fatalf("attempt %d was rejected early", attempt)
		}
	}
	if allowed, retryAfter := limiter.allow("192.0.2.2", " user@example.test "); allowed || retryAfter != authLimitWindow {
		t.Fatalf("expected account partition to be limited, got %v, %v", allowed, retryAfter)
	}

	now = now.Add(authLimitWindow)
	if allowed, _ := limiter.allow("192.0.2.2", "user@example.test"); !allowed {
		t.Fatal("expected expired window to reopen")
	}
}

func TestAuthAttemptLimiterBoundsDistinctAccountsPerIP(t *testing.T) {
	limiter := newAuthAttemptLimiter()
	now := time.Unix(1_700_000_000, 0)
	limiter.now = func() time.Time { return now }
	for attempt := 0; attempt < authLimitPerIP; attempt++ {
		if allowed, _ := limiter.allow("192.0.2.1", fmt.Sprintf("user-%d@example.test", attempt)); !allowed {
			t.Fatalf("attempt %d was rejected early", attempt)
		}
	}
	now = now.Add(time.Minute)
	if allowed, retryAfter := limiter.allow("192.0.2.1", "another@example.test"); allowed || retryAfter != 4*time.Minute {
		t.Fatalf("expected the IP limit and remaining window, got %v, %v", allowed, retryAfter)
	}
	if allowed, _ := limiter.allow("192.0.2.2", "another@example.test"); !allowed {
		t.Fatal("an unrelated IP and account should remain available")
	}
}
