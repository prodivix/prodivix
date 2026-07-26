package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrUserAuthorizationUnavailable means the callback carried no user
// authorization code, so nothing proves who performed the installation. The
// GitHub App must have "Request user authorization (OAuth) during
// installation" enabled for the setup redirect to include one.
var ErrUserAuthorizationUnavailable = errors.New("github user authorization code is unavailable")

// ErrUserInstallationAccessDenied means GitHub does not list the installation
// among those the authenticated user can access.
var ErrUserInstallationAccessDenied = errors.New("github user cannot access the installation")

const (
	defaultGitHubOAuthBaseURL      = "https://github.com"
	defaultGitHubAPIBaseURL        = "https://api.github.com"
	githubUserRequestTimeout       = 15 * time.Second
	maximumGitHubResponseSize      = 2 << 20
	githubInstallationsPerPage     = 100
	maximumGitHubInstallationPages = 10
)

// GitHubUserIdentity is the account that authorized the installation callback.
type GitHubUserIdentity struct {
	ID    int64
	Login string
}

// UserIdentityVerifier resolves the GitHub account behind a setup callback and
// answers whether that account may access an installation. It is the only
// authority for that question: the backend must never infer installation
// ownership from a client-supplied installation_id.
type UserIdentityVerifier interface {
	ExchangeUserAuthorization(ctx context.Context, code string) (string, error)
	ResolveUserIdentity(ctx context.Context, userToken string) (GitHubUserIdentity, error)
	UserCanAccessInstallation(ctx context.Context, userToken string, installationID int64) (bool, error)
}

type httpUserIdentityVerifier struct {
	clientID     string
	clientSecret string
	oauthBaseURL string
	apiBaseURL   string
	client       *http.Client
}

// NewUserIdentityVerifier builds the GitHub-backed verifier. The base URLs are
// overridable so tests can drive the whole flow against a local server.
func NewUserIdentityVerifier(clientID, clientSecret, oauthBaseURL, apiBaseURL string, client *http.Client) UserIdentityVerifier {
	if client == nil {
		client = &http.Client{Timeout: githubUserRequestTimeout}
	}
	return &httpUserIdentityVerifier{
		clientID:     strings.TrimSpace(clientID),
		clientSecret: strings.TrimSpace(clientSecret),
		oauthBaseURL: strings.TrimRight(orDefault(oauthBaseURL, defaultGitHubOAuthBaseURL), "/"),
		apiBaseURL:   strings.TrimRight(orDefault(apiBaseURL, defaultGitHubAPIBaseURL), "/"),
		client:       client,
	}
}

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func (verifier *httpUserIdentityVerifier) ExchangeUserAuthorization(ctx context.Context, code string) (string, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return "", ErrUserAuthorizationUnavailable
	}
	if verifier.clientID == "" || verifier.clientSecret == "" {
		return "", ErrUserAuthorizationUnavailable
	}
	form := url.Values{}
	form.Set("client_id", verifier.clientID)
	form.Set("client_secret", verifier.clientSecret)
	form.Set("code", code)
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		verifier.oauthBaseURL+"/login/oauth/access_token",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	body, err := verifier.send(request)
	if err != nil {
		return "", err
	}
	var decoded struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return "", err
	}
	if strings.TrimSpace(decoded.AccessToken) == "" {
		return "", ErrUserAuthorizationUnavailable
	}
	return decoded.AccessToken, nil
}

func (verifier *httpUserIdentityVerifier) ResolveUserIdentity(ctx context.Context, userToken string) (GitHubUserIdentity, error) {
	request, err := verifier.authorizedRequest(ctx, userToken, verifier.apiBaseURL+"/user")
	if err != nil {
		return GitHubUserIdentity{}, err
	}
	body, err := verifier.send(request)
	if err != nil {
		return GitHubUserIdentity{}, err
	}
	var decoded struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return GitHubUserIdentity{}, err
	}
	if decoded.ID <= 0 {
		return GitHubUserIdentity{}, ErrUserAuthorizationUnavailable
	}
	return GitHubUserIdentity{ID: decoded.ID, Login: decoded.Login}, nil
}

// UserCanAccessInstallation asks GitHub directly. `GET /user/installations` is
// scoped to the authenticated user, so a caller cannot widen it by supplying a
// different installation id.
func (verifier *httpUserIdentityVerifier) UserCanAccessInstallation(ctx context.Context, userToken string, installationID int64) (bool, error) {
	if installationID <= 0 {
		return false, nil
	}
	for page := 1; page <= maximumGitHubInstallationPages; page++ {
		endpoint := fmt.Sprintf(
			"%s/user/installations?per_page=%d&page=%d",
			verifier.apiBaseURL,
			githubInstallationsPerPage,
			page,
		)
		request, err := verifier.authorizedRequest(ctx, userToken, endpoint)
		if err != nil {
			return false, err
		}
		body, err := verifier.send(request)
		if err != nil {
			return false, err
		}
		var decoded struct {
			TotalCount    int `json:"total_count"`
			Installations []struct {
				ID int64 `json:"id"`
			} `json:"installations"`
		}
		if err := json.Unmarshal(body, &decoded); err != nil {
			return false, err
		}
		for _, installation := range decoded.Installations {
			if installation.ID == installationID {
				return true, nil
			}
		}
		if len(decoded.Installations) < githubInstallationsPerPage {
			return false, nil
		}
	}
	return false, nil
}

func (verifier *httpUserIdentityVerifier) authorizedRequest(ctx context.Context, userToken, endpoint string) (*http.Request, error) {
	userToken = strings.TrimSpace(userToken)
	if userToken == "" {
		return nil, ErrUserAuthorizationUnavailable
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+userToken)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	return request, nil
}

func (verifier *httpUserIdentityVerifier) send(request *http.Request) ([]byte, error) {
	response, err := verifier.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumGitHubResponseSize))
	if err != nil {
		return nil, err
	}
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return nil, ErrUserInstallationAccessDenied
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		// Never echo the body: it can carry tokens or account detail.
		return nil, fmt.Errorf("github request failed with status %d", response.StatusCode)
	}
	return body, nil
}
