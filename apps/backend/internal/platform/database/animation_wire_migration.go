package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/animationcontract"
)

type persistedAnimationDocument struct {
	workspaceID string
	documentID  string
	contentRev  int64
	content     json.RawMessage
}

const (
	animationWireMigrationBatchSize = 256

	lockPersistedAnimationDocuments = `LOCK TABLE workspace_documents IN SHARE ROW EXCLUSIVE MODE`

	selectPersistedAnimationDocuments = `SELECT workspace_id, id, content_rev, content_json
FROM workspace_documents
WHERE doc_type = 'pir-animation'
  AND ($1 OR (workspace_id, id) > ($2, $3))
ORDER BY workspace_id, id
LIMIT $4
FOR UPDATE`

	updatePersistedAnimationDocument = `UPDATE workspace_documents
SET content_json = $1::jsonb
WHERE workspace_id = $2 AND id = $3 AND content_rev = $4 AND content_json = $5::jsonb`

	enforceAnimationWireV2 = `ALTER TABLE workspace_documents
ADD CONSTRAINT workspace_documents_animation_wire_v2_check
CHECK (
	doc_type <> 'pir-animation'
	OR (content_json->>'version') IS NOT DISTINCT FROM '2'
) NOT VALID`

	validateAnimationWireV2 = `ALTER TABLE workspace_documents
VALIDATE CONSTRAINT workspace_documents_animation_wire_v2_check`
)

// migratePersistedAnimationDocuments upgrades every Animation document
// atomically before current-model patch paths become available.
func migratePersistedAnimationDocuments(
	ctx context.Context,
	tx *sql.Tx,
) error {
	if _, err := tx.ExecContext(ctx, lockPersistedAnimationDocuments); err != nil {
		return fmt.Errorf("lock persisted Animation documents: %w", err)
	}

	firstBatch := true
	lastWorkspaceID := ""
	lastDocumentID := ""
	for {
		documents, err := readPersistedAnimationDocumentBatch(
			ctx,
			tx,
			firstBatch,
			lastWorkspaceID,
			lastDocumentID,
		)
		if err != nil {
			return err
		}
		if len(documents) == 0 {
			break
		}
		for _, document := range documents {
			if err := migratePersistedAnimationDocument(ctx, tx, document); err != nil {
				return err
			}
		}
		lastDocument := documents[len(documents)-1]
		lastWorkspaceID = lastDocument.workspaceID
		lastDocumentID = lastDocument.documentID
		firstBatch = false
	}

	if _, err := tx.ExecContext(ctx, enforceAnimationWireV2); err != nil {
		return fmt.Errorf("install persisted Animation v2 constraint: %w", err)
	}
	if _, err := tx.ExecContext(ctx, validateAnimationWireV2); err != nil {
		return fmt.Errorf("validate persisted Animation v2 constraint: %w", err)
	}
	return nil
}

func readPersistedAnimationDocumentBatch(
	ctx context.Context,
	tx *sql.Tx,
	firstBatch bool,
	lastWorkspaceID string,
	lastDocumentID string,
) ([]persistedAnimationDocument, error) {
	rows, err := tx.QueryContext(
		ctx,
		selectPersistedAnimationDocuments,
		firstBatch,
		lastWorkspaceID,
		lastDocumentID,
		animationWireMigrationBatchSize,
	)
	if err != nil {
		return nil, fmt.Errorf("read persisted Animation documents: %w", err)
	}
	documents := make(
		[]persistedAnimationDocument,
		0,
		animationWireMigrationBatchSize,
	)
	for rows.Next() {
		var document persistedAnimationDocument
		if err := rows.Scan(
			&document.workspaceID,
			&document.documentID,
			&document.contentRev,
			&document.content,
		); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan persisted Animation document: %w", err)
		}
		document.content = append(json.RawMessage(nil), document.content...)
		documents = append(documents, document)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate persisted Animation documents: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close persisted Animation document rows: %w", err)
	}
	return documents, nil
}

func migratePersistedAnimationDocument(
	ctx context.Context,
	tx *sql.Tx,
	document persistedAnimationDocument,
) error {
	upgraded, err := animationcontract.UpgradeDocument(document.content)
	if err != nil {
		return fmt.Errorf(
			"migrate Animation document %s/%s at content revision %d: %w",
			document.workspaceID,
			document.documentID,
			document.contentRev,
			err,
		)
	}
	if !upgraded.Migrated {
		return nil
	}
	result, err := tx.ExecContext(
		ctx,
		updatePersistedAnimationDocument,
		string(upgraded.Document),
		document.workspaceID,
		document.documentID,
		document.contentRev,
		string(document.content),
	)
	if err != nil {
		return fmt.Errorf(
			"persist Animation document %s/%s migration: %w",
			document.workspaceID,
			document.documentID,
			err,
		)
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf(
			"read Animation document %s/%s migration result: %w",
			document.workspaceID,
			document.documentID,
			err,
		)
	}
	if updated != 1 {
		return fmt.Errorf(
			"persist Animation document %s/%s migration: content revision CAS failed",
			document.workspaceID,
			document.documentID,
		)
	}
	return nil
}
