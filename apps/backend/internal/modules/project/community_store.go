package project

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

func (store *ProjectStore) ListPublic(options CommunityListOptions) ([]CommunityProjectSummary, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if options.Page <= 0 {
		options.Page = 1
	}
	if options.PageSize <= 0 {
		options.PageSize = 20
	}
	if options.PageSize > 100 {
		options.PageSize = 100
	}

	sortOrder := "p.updated_at DESC, p.created_at DESC"
	if strings.EqualFold(strings.TrimSpace(options.Sort), "popular") {
		sortOrder = "p.stars_count DESC, p.updated_at DESC, p.created_at DESC"
	}

	clauses := []string{
		"p.is_public = TRUE",
		"p.published_pir_json IS NOT NULL",
	}
	args := make([]any, 0, 4)
	argIndex := 1

	if keyword := strings.TrimSpace(options.Keyword); keyword != "" {
		pattern := "%" + keyword + "%"
		clauses = append(
			clauses,
			fmt.Sprintf("(p.name ILIKE $%d OR p.description ILIKE $%d OR u.name ILIKE $%d)", argIndex, argIndex, argIndex),
		)
		args = append(args, pattern)
		argIndex++
	}

	resourceType := normalizeResourceType(options.ResourceType)
	if resourceType != "" {
		if !isValidResourceType(resourceType) {
			return nil, ErrInvalidResourceType
		}
		clauses = append(clauses, fmt.Sprintf("p.resource_type = $%d", argIndex))
		args = append(args, resourceType)
		argIndex++
	}

	limitArg := fmt.Sprintf("$%d", argIndex)
	offsetArg := fmt.Sprintf("$%d", argIndex+1)
	args = append(args, options.PageSize, (options.Page-1)*options.PageSize)

	query := `SELECT p.id, p.resource_type, p.name, p.description, p.owner_id, u.name, p.stars_count, p.created_at, p.updated_at
FROM projects p
JOIN users u ON u.id = p.owner_id
WHERE ` + strings.Join(clauses, " AND ") + `
ORDER BY ` + sortOrder + `
LIMIT ` + limitArg + ` OFFSET ` + offsetArg

	rows, err := store.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]CommunityProjectSummary, 0)
	for rows.Next() {
		var summary CommunityProjectSummary
		if err := rows.Scan(
			&summary.ID,
			&summary.ResourceType,
			&summary.Name,
			&summary.Description,
			&summary.AuthorID,
			&summary.AuthorName,
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

func (store *ProjectStore) GetPublicByID(projectID string) (*CommunityProjectDetail, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const query = `SELECT p.id, p.owner_id, p.resource_type, p.name, p.description, p.published_pir_json, p.is_public, p.stars_count, p.created_at, p.updated_at, u.name
FROM projects p
JOIN users u ON u.id = p.owner_id
WHERE p.id = $1 AND p.is_public = TRUE`

	var detail CommunityProjectDetail
	var pirBytes []byte
	err := store.db.QueryRowContext(ctx, query, projectID).Scan(
		&detail.ID,
		&detail.OwnerID,
		&detail.ResourceType,
		&detail.Name,
		&detail.Description,
		&pirBytes,
		&detail.IsPublic,
		&detail.StarsCount,
		&detail.CreatedAt,
		&detail.UpdatedAt,
		&detail.AuthorName,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	if len(pirBytes) == 0 {
		return nil, ErrProjectNotFound
	}
	detail.PIR = json.RawMessage(pirBytes)
	return &detail, nil
}
