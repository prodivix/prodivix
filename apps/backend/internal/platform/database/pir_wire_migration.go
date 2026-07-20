package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/pircontract"
)

type persistedPIRDocument struct {
	workspaceID string
	documentID  string
	contentRev  int64
	content     json.RawMessage
}

const (
	pirWireMigrationBatchSize = 256

	lockPersistedPIRDocuments = `LOCK TABLE workspace_documents IN SHARE ROW EXCLUSIVE MODE`

	selectPersistedPIRDocuments = `SELECT workspace_id, id, content_rev, content_json
FROM workspace_documents
WHERE doc_type IN ('pir-page', 'pir-layout', 'pir-component')
  AND ($1 OR (workspace_id, id) > ($2, $3))
ORDER BY workspace_id, id
LIMIT $4
FOR UPDATE`

	updatePersistedPIRDocument = `UPDATE workspace_documents
SET content_json = $1::jsonb
WHERE workspace_id = $2 AND id = $3 AND content_rev = $4 AND content_json = $5::jsonb`

	enforcePIRWireV16 = `ALTER TABLE workspace_documents
ADD CONSTRAINT workspace_documents_pir_wire_v1_6_check
CHECK (
	doc_type NOT IN ('pir-page', 'pir-layout', 'pir-component')
	OR (content_json->>'version') IS NOT DISTINCT FROM '1.6'
) NOT VALID`

	validatePIRWireV16 = `ALTER TABLE workspace_documents
VALIDATE CONSTRAINT workspace_documents_pir_wire_v1_6_check`
)

// migratePersistedPIRDocuments upgrades the complete historical wire set under
// the migration transaction before the process can accept current path patches.
func migratePersistedPIRDocuments(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, lockPersistedPIRDocuments); err != nil {
		return fmt.Errorf("lock persisted PIR documents: %w", err)
	}

	firstBatch := true
	lastWorkspaceID := ""
	lastDocumentID := ""
	for {
		documents, err := readPersistedPIRDocumentBatch(
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
			if err := migratePersistedPIRDocument(ctx, tx, document); err != nil {
				return err
			}
		}
		lastDocument := documents[len(documents)-1]
		lastWorkspaceID = lastDocument.workspaceID
		lastDocumentID = lastDocument.documentID
		firstBatch = false
	}

	if _, err := tx.ExecContext(ctx, enforcePIRWireV16); err != nil {
		return fmt.Errorf("install persisted PIR v1.6 constraint: %w", err)
	}
	if _, err := tx.ExecContext(ctx, validatePIRWireV16); err != nil {
		return fmt.Errorf("validate persisted PIR v1.6 constraint: %w", err)
	}
	return nil
}

func readPersistedPIRDocumentBatch(
	ctx context.Context,
	tx *sql.Tx,
	firstBatch bool,
	lastWorkspaceID string,
	lastDocumentID string,
) ([]persistedPIRDocument, error) {
	rows, err := tx.QueryContext(
		ctx,
		selectPersistedPIRDocuments,
		firstBatch,
		lastWorkspaceID,
		lastDocumentID,
		pirWireMigrationBatchSize,
	)
	if err != nil {
		return nil, fmt.Errorf("read persisted PIR documents: %w", err)
	}
	documents := make([]persistedPIRDocument, 0, pirWireMigrationBatchSize)
	for rows.Next() {
		var document persistedPIRDocument
		if err := rows.Scan(&document.workspaceID, &document.documentID, &document.contentRev, &document.content); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan persisted PIR document: %w", err)
		}
		document.content = append(json.RawMessage(nil), document.content...)
		documents = append(documents, document)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate persisted PIR documents: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close persisted PIR document rows: %w", err)
	}
	return documents, nil
}

func migratePersistedPIRDocument(ctx context.Context, tx *sql.Tx, document persistedPIRDocument) error {
	upgraded, err := pircontract.UpgradeDocument(document.content)
	if err != nil {
		return fmt.Errorf(
			"migrate PIR document %s/%s at content revision %d: %w",
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
		updatePersistedPIRDocument,
		string(upgraded.Document),
		document.workspaceID,
		document.documentID,
		document.contentRev,
		string(document.content),
	)
	if err != nil {
		return fmt.Errorf("persist PIR document %s/%s migration: %w", document.workspaceID, document.documentID, err)
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read PIR document %s/%s migration result: %w", document.workspaceID, document.documentID, err)
	}
	if updated != 1 {
		return fmt.Errorf("persist PIR document %s/%s migration: content revision CAS failed", document.workspaceID, document.documentID)
	}
	return nil
}
