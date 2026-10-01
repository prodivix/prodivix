package project

import (
	"encoding/json"
	"errors"
	"time"
)

var ErrProjectNotFound = errors.New("project not found")
var ErrInvalidResourceType = errors.New("invalid resource type")

// ErrProjectNotPublishable marks a deterministic, permanent precondition: the
// Workspace holds no PIR document the community projection could publish.
var ErrProjectNotPublishable = errors.New("project has no publishable PIR document")
var ErrPublicationRevisionConflict = errors.New("the saved workspace revision changed before publication")

type PublicationExpectedDocument struct {
	DocumentID string `json:"documentId"`
	ContentRev int64  `json:"contentRev"`
	MetaRev    int64  `json:"metaRev"`
}
type PublicationExpected struct {
	WorkspaceRev int64                         `json:"workspaceRev"`
	RouteRev     int64                         `json:"routeRev"`
	OpSeq        int64                         `json:"opSeq"`
	Documents    []PublicationExpectedDocument `json:"documents"`
}

type ResourceType string

const (
	ResourceTypeProject   ResourceType = "project"
	ResourceTypeComponent ResourceType = "component"
	ResourceTypeNodeGraph ResourceType = "nodegraph"
)

type Project struct {
	ID           string       `json:"id"`
	OwnerID      string       `json:"ownerId"`
	ResourceType ResourceType `json:"resourceType"`
	Name         string       `json:"name"`
	Description  string       `json:"description"`
	IsPublic     bool         `json:"isPublic"`
	StarsCount   int          `json:"starsCount"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

type ProjectSummary struct {
	ID           string       `json:"id"`
	ResourceType ResourceType `json:"resourceType"`
	Name         string       `json:"name"`
	Description  string       `json:"description"`
	IsPublic     bool         `json:"isPublic"`
	StarsCount   int          `json:"starsCount"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

type CommunityProjectSummary struct {
	ID           string       `json:"id"`
	ResourceType ResourceType `json:"resourceType"`
	Name         string       `json:"name"`
	Description  string       `json:"description"`
	AuthorID     string       `json:"authorId"`
	AuthorName   string       `json:"authorName"`
	StarsCount   int          `json:"starsCount"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

type CommunityProjectDetail struct {
	Project
	PIR        json.RawMessage `json:"pir"`
	AuthorName string          `json:"authorName"`
}
