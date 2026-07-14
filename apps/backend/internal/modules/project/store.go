package project

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type ProjectStore struct {
	db *sql.DB
}

type CommunityListOptions struct {
	Keyword      string
	ResourceType ResourceType
	Sort         string
	Page         int
	PageSize     int
}

type PrepareProjectParams struct {
	OwnerID      string
	Name         string
	Description  string
	ResourceType ResourceType
	IsPublic     bool
}

func NewProjectStore(db *sql.DB) *ProjectStore {
	return &ProjectStore{db: db}
}

func (store *ProjectStore) PrepareProject(params PrepareProjectParams) (*Project, error) {
	resourceType := normalizeResourceType(params.ResourceType)
	if !isValidResourceType(resourceType) {
		return nil, ErrInvalidResourceType
	}

	return &Project{
		ID:           newID("prj"),
		OwnerID:      strings.TrimSpace(params.OwnerID),
		ResourceType: resourceType,
		Name:         strings.TrimSpace(params.Name),
		Description:  strings.TrimSpace(params.Description),
		IsPublic:     params.IsPublic,
		StarsCount:   0,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}, nil
}

// InsertPreparedProject participates in the caller-owned transaction that also creates the canonical Workspace.
// New resources remain unpublished until PublishWorkspaceProjection records an explicit projection.
func (store *ProjectStore) InsertPreparedProject(ctx context.Context, tx *sql.Tx, project *Project) error {
	if store == nil || tx == nil || project == nil {
		return errors.New("project insert requires store, transaction and project")
	}
	project.IsPublic = false

	const query = `INSERT INTO projects (id, owner_id, resource_type, name, description, published_pir_json, is_public, stars_count, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 0, $8, $9)`
	_, err := tx.ExecContext(ctx, query,
		project.ID,
		project.OwnerID,
		project.ResourceType,
		project.Name,
		project.Description,
		nil,
		false,
		project.CreatedAt,
		project.UpdatedAt,
	)
	return err
}

func (store *ProjectStore) ListByOwner(ownerID string) ([]ProjectSummary, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const query = `SELECT id, resource_type, name, description, is_public, stars_count, created_at, updated_at
FROM projects
WHERE owner_id = $1
ORDER BY updated_at DESC, created_at DESC`

	rows, err := store.db.QueryContext(ctx, query, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]ProjectSummary, 0)
	for rows.Next() {
		var summary ProjectSummary
		if err := rows.Scan(
			&summary.ID,
			&summary.ResourceType,
			&summary.Name,
			&summary.Description,
			&summary.IsPublic,
			&summary.StarsCount,
			&summary.CreatedAt,
			&summary.UpdatedAt,
		); err != nil {
			return nil, err
		}
		projects = append(projects, summary)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return projects, nil
}

func (store *ProjectStore) GetByID(ownerID, projectID string) (*Project, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const query = `SELECT id, owner_id, resource_type, name, description, is_public, stars_count, created_at, updated_at
FROM projects
WHERE owner_id = $1 AND id = $2`

	row := store.db.QueryRowContext(ctx, query, ownerID, projectID)
	project, err := scanProject(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return project, nil
}

func (store *ProjectStore) PublishWorkspaceProjection(ownerID, projectID string, pir json.RawMessage) (*Project, error) {
	normalizedPIR, err := normalizePIR(pir)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const query = `UPDATE projects
SET published_pir_json = $3::jsonb,
    is_public = TRUE,
    updated_at = NOW()
WHERE owner_id = $1 AND id = $2
RETURNING id, owner_id, resource_type, name, description, is_public, stars_count, created_at, updated_at`

	row := store.db.QueryRowContext(ctx, query, ownerID, projectID, string(normalizedPIR))
	project, err := scanProject(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return project, nil
}

func (store *ProjectStore) UpdateProject(ownerID, projectID string, name, description *string) (*Project, error) {
	var nextName any
	var nextDescription any
	if name != nil {
		nextName = strings.TrimSpace(*name)
	}
	if description != nil {
		nextDescription = strings.TrimSpace(*description)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const query = `UPDATE projects
SET name = COALESCE($3, name),
    description = COALESCE($4, description),
    updated_at = NOW()
WHERE owner_id = $1 AND id = $2
RETURNING id, owner_id, resource_type, name, description, is_public, stars_count, created_at, updated_at`

	row := store.db.QueryRowContext(ctx, query, ownerID, projectID, nextName, nextDescription)
	project, err := scanProject(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return project, nil
}

func (store *ProjectStore) Delete(ownerID, projectID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const query = `DELETE FROM projects WHERE owner_id = $1 AND id = $2`
	result, err := store.db.ExecContext(ctx, query, ownerID, projectID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func scanProject(scanner interface{ Scan(dest ...any) error }) (*Project, error) {
	project := &Project{}
	err := scanner.Scan(
		&project.ID,
		&project.OwnerID,
		&project.ResourceType,
		&project.Name,
		&project.Description,
		&project.IsPublic,
		&project.StarsCount,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return project, nil
}
