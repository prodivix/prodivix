package project

import (
	"encoding/json"
	"errors"
	"time"
)

var ErrProjectNotFound = errors.New("project not found")
var ErrInvalidResourceType = errors.New("invalid resource type")

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
