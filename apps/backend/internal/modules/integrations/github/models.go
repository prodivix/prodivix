package github

import (
	"encoding/json"
	"time"
)

type InstallationStatus string

const (
	InstallationStatusActive  InstallationStatus = "active"
	InstallationStatusDeleted InstallationStatus = "deleted"
	InstallationStatusRevoked InstallationStatus = "revoked"
)

type RepositoryBindingStatus string

const (
	RepositoryBindingStatusActive   RepositoryBindingStatus = "active"
	RepositoryBindingStatusDisabled RepositoryBindingStatus = "disabled"
	RepositoryBindingStatusRevoked  RepositoryBindingStatus = "revoked"
	RepositoryBindingStatusError    RepositoryBindingStatus = "error"
)

type GitSyncTrack string

const (
	GitSyncTrackPIR       GitSyncTrack = "pir"
	GitSyncTrackArtifacts GitSyncTrack = "artifacts"
)

type InstallationRecord struct {
	InstallationID int64              `json:"installationId"`
	AccountLogin   string             `json:"accountLogin"`
	AccountType    string             `json:"accountType"`
	AccountID      int64              `json:"accountId"`
	Status         InstallationStatus `json:"status"`
	Raw            json.RawMessage    `json:"raw,omitempty"`
	CreatedAt      time.Time          `json:"createdAt"`
	UpdatedAt      time.Time          `json:"updatedAt"`
}

type InstallationRepositoryRecord struct {
	InstallationID int64     `json:"installationId"`
	RepositoryID   int64     `json:"repositoryId"`
	Owner          string    `json:"owner"`
	Name           string    `json:"name"`
	FullName       string    `json:"fullName"`
	Private        bool      `json:"private"`
	DefaultBranch  string    `json:"defaultBranch"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type RepositoryBindingRecord struct {
	ID             string                  `json:"id"`
	UserID         string                  `json:"userId"`
	ProjectID      string                  `json:"projectId"`
	WorkspaceID    string                  `json:"workspaceId"`
	Provider       string                  `json:"provider"`
	InstallationID int64                   `json:"installationId"`
	Owner          string                  `json:"owner"`
	Repo           string                  `json:"repo"`
	DefaultBranch  string                  `json:"defaultBranch"`
	Status         RepositoryBindingStatus `json:"status"`
	Branch         string                  `json:"branch"`
	PIR            GitTrackSyncState       `json:"pir"`
	Artifacts      GitTrackSyncState       `json:"artifacts"`
	CreatedAt      time.Time               `json:"createdAt"`
	UpdatedAt      time.Time               `json:"updatedAt"`
}

type GitTrackSyncState struct {
	Track         GitSyncTrack `json:"track"`
	Dirty         bool         `json:"dirty"`
	LastSyncedRev *int64       `json:"lastSyncedRev,omitempty"`
	LastSyncedAt  *time.Time   `json:"lastSyncedAt,omitempty"`
	LastCommitSHA string       `json:"lastCommitSha"`
	LastErrorCode string       `json:"lastErrorCode"`
}

type WebhookEventRecord struct {
	DeliveryID     string          `json:"deliveryId"`
	EventType      string          `json:"eventType"`
	InstallationID *int64          `json:"installationId,omitempty"`
	Action         string          `json:"action"`
	Payload        json.RawMessage `json:"payload"`
	Processed      bool            `json:"processed"`
	CreatedAt      time.Time       `json:"createdAt"`
}

type UpsertRepositoryBindingParams struct {
	UserID         string
	ProjectID      string
	WorkspaceID    string
	InstallationID int64
	Owner          string
	Repo           string
	DefaultBranch  string
	Branch         string
}

type GitHubWebhookPayload struct {
	Action       string `json:"action"`
	Installation *struct {
		ID      int64 `json:"id"`
		Account *struct {
			ID    int64  `json:"id"`
			Login string `json:"login"`
			Type  string `json:"type"`
		} `json:"account"`
	} `json:"installation"`
	Repositories        []GitHubRepositoryPayload `json:"repositories"`
	RepositoriesAdded   []GitHubRepositoryPayload `json:"repositories_added"`
	RepositoriesRemoved []GitHubRepositoryPayload `json:"repositories_removed"`
}

type GitHubRepositoryPayload struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	Owner         *struct {
		Login string `json:"login"`
	} `json:"owner"`
}
