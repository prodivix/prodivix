package github

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func githubStub(t *testing.T, installations []int64) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.URL.Path == "/login/oauth/access_token":
			if err := request.ParseForm(); err != nil {
				writer.WriteHeader(http.StatusBadRequest)
				return
			}
			if request.PostForm.Get("code") != "auth-code" {
				_ = json.NewEncoder(writer).Encode(map[string]string{"error": "bad_verification_code"})
				return
			}
			_ = json.NewEncoder(writer).Encode(map[string]string{"access_token": "user-token"})
		case request.URL.Path == "/user":
			if request.Header.Get("Authorization") != "Bearer user-token" {
				writer.WriteHeader(http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{"id": 4242, "login": "octocat"})
		case request.URL.Path == "/user/installations":
			if request.Header.Get("Authorization") != "Bearer user-token" {
				writer.WriteHeader(http.StatusUnauthorized)
				return
			}
			entries := make([]map[string]any, 0, len(installations))
			for _, id := range installations {
				entries = append(entries, map[string]any{"id": id})
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"total_count":   len(entries),
				"installations": entries,
			})
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
}

func TestUserIdentityVerifierResolvesTheAuthorizingAccount(t *testing.T) {
	server := githubStub(t, []int64{11, 42})
	defer server.Close()
	verifier := NewUserIdentityVerifier("client", "secret", server.URL, server.URL, server.Client())

	token, err := verifier.ExchangeUserAuthorization(context.Background(), "auth-code")
	if err != nil {
		t.Fatal(err)
	}
	identity, err := verifier.ResolveUserIdentity(context.Background(), token)
	if err != nil {
		t.Fatal(err)
	}
	if identity.ID != 4242 || identity.Login != "octocat" {
		t.Fatalf("unexpected identity: %+v", identity)
	}
}

// The whole point of the linkage: access follows GitHub's own answer, not the
// installation id the client happened to send.
func TestUserIdentityVerifierFollowsGitHubInstallationAccess(t *testing.T) {
	server := githubStub(t, []int64{11, 42})
	defer server.Close()
	verifier := NewUserIdentityVerifier("client", "secret", server.URL, server.URL, server.Client())

	allowed, err := verifier.UserCanAccessInstallation(context.Background(), "user-token", 42)
	if err != nil || !allowed {
		t.Fatalf("expected a listed installation to be allowed: allowed=%v err=%v", allowed, err)
	}
	denied, err := verifier.UserCanAccessInstallation(context.Background(), "user-token", 999)
	if err != nil || denied {
		t.Fatalf("expected an unlisted installation to be refused: allowed=%v err=%v", denied, err)
	}
}

func TestUserIdentityVerifierRejectsAnUnusableAuthorizationCode(t *testing.T) {
	server := githubStub(t, nil)
	defer server.Close()
	verifier := NewUserIdentityVerifier("client", "secret", server.URL, server.URL, server.Client())

	if _, err := verifier.ExchangeUserAuthorization(context.Background(), "wrong-code"); !errors.Is(err, ErrUserAuthorizationUnavailable) {
		t.Fatalf("expected a rejected code to fail closed: err=%v", err)
	}
	if _, err := verifier.ExchangeUserAuthorization(context.Background(), "   "); !errors.Is(err, ErrUserAuthorizationUnavailable) {
		t.Fatalf("expected a missing code to fail closed: err=%v", err)
	}
}

func TestUserIdentityVerifierRejectsAnUnauthorizedToken(t *testing.T) {
	server := githubStub(t, []int64{42})
	defer server.Close()
	verifier := NewUserIdentityVerifier("client", "secret", server.URL, server.URL, server.Client())

	_, err := verifier.ResolveUserIdentity(context.Background(), "forged-token")
	if !errors.Is(err, ErrUserInstallationAccessDenied) {
		t.Fatalf("expected a forged token to be refused: err=%v", err)
	}
	if err != nil && strings.Contains(err.Error(), "forged-token") {
		t.Fatal("error must not echo the token")
	}
}
