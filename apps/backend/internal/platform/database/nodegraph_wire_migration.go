package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/nodegraphcontract"
)

type persistedNodeGraphDocument struct {
	workspaceID string
	documentID  string
	contentRev  int64
	content     json.RawMessage
}

const (
	nodeGraphWireMigrationBatchSize = 256

	lockPersistedNodeGraphDocuments = `LOCK TABLE workspace_documents IN SHARE ROW EXCLUSIVE MODE`

	selectPersistedNodeGraphDocuments = `SELECT workspace_id, id, content_rev, content_json
FROM workspace_documents
WHERE doc_type = 'pir-graph'
  AND ($1 OR (workspace_id, id) > ($2, $3))
ORDER BY workspace_id, id
LIMIT $4
FOR UPDATE`

	updatePersistedNodeGraphDocument = `UPDATE workspace_documents
SET content_json = $1::jsonb
WHERE workspace_id = $2 AND id = $3 AND content_rev = $4 AND content_json = $5::jsonb`

	enforceNodeGraphWireV2 = `ALTER TABLE workspace_documents
ADD CONSTRAINT workspace_documents_nodegraph_wire_v2_check
CHECK (
	doc_type <> 'pir-graph'
	OR (content_json->>'version') IS NOT DISTINCT FROM '2'
) NOT VALID`

	validateNodeGraphWireV2 = `ALTER TABLE workspace_documents
VALIDATE CONSTRAINT workspace_documents_nodegraph_wire_v2_check`
)

// migratePersistedNodeGraphDocuments upgrades every graph atomically before
// current-model patch paths become available to a serving process.
func migratePersistedNodeGraphDocuments(
	ctx context.Context,
	tx *sql.Tx,
) error {
	if _, err := tx.ExecContext(ctx, lockPersistedNodeGraphDocuments); err != nil {
		return fmt.Errorf("lock persisted NodeGraph documents: %w", err)
	}

	firstBatch := true
	lastWorkspaceID := ""
	lastDocumentID := ""
	for {
		documents, err := readPersistedNodeGraphDocumentBatch(
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
			if err := migratePersistedNodeGraphDocument(
				ctx,
				tx,
				document,
			); err != nil {
				return err
			}
		}
		lastDocument := documents[len(documents)-1]
		lastWorkspaceID = lastDocument.workspaceID
		lastDocumentID = lastDocument.documentID
		firstBatch = false
	}

	if _, err := tx.ExecContext(ctx, enforceNodeGraphWireV2); err != nil {
		return fmt.Errorf("install persisted NodeGraph v2 constraint: %w", err)
	}
	if _, err := tx.ExecContext(ctx, validateNodeGraphWireV2); err != nil {
		return fmt.Errorf("validate persisted NodeGraph v2 constraint: %w", err)
	}
	return nil
}

func readPersistedNodeGraphDocumentBatch(
	ctx context.Context,
	tx *sql.Tx,
	firstBatch bool,
	lastWorkspaceID string,
	lastDocumentID string,
) ([]persistedNodeGraphDocument, error) {
	rows, err := tx.QueryContext(
		ctx,
		selectPersistedNodeGraphDocuments,
		firstBatch,
		lastWorkspaceID,
		lastDocumentID,
		nodeGraphWireMigrationBatchSize,
	)
	if err != nil {
		return nil, fmt.Errorf("read persisted NodeGraph documents: %w", err)
	}
	documents := make(
		[]persistedNodeGraphDocument,
		0,
		nodeGraphWireMigrationBatchSize,
	)
	for rows.Next() {
		var document persistedNodeGraphDocument
		if err := rows.Scan(
			&document.workspaceID,
			&document.documentID,
			&document.contentRev,
			&document.content,
		); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan persisted NodeGraph document: %w", err)
		}
		document.content = append(json.RawMessage(nil), document.content...)
		documents = append(documents, document)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate persisted NodeGraph documents: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close persisted NodeGraph document rows: %w", err)
	}
	return documents, nil
}

func migratePersistedNodeGraphDocument(
	ctx context.Context,
	tx *sql.Tx,
	document persistedNodeGraphDocument,
) error {
	upgraded, err := nodegraphcontract.UpgradeDocument(document.content)
	if err != nil {
		return fmt.Errorf(
			"migrate NodeGraph document %s/%s at content revision %d: %w",
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
		updatePersistedNodeGraphDocument,
		string(upgraded.Document),
		document.workspaceID,
		document.documentID,
		document.contentRev,
		string(document.content),
	)
	if err != nil {
		return fmt.Errorf(
			"persist NodeGraph document %s/%s migration: %w",
			document.workspaceID,
			document.documentID,
			err,
		)
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf(
			"read NodeGraph document %s/%s migration result: %w",
			document.workspaceID,
			document.documentID,
			err,
		)
	}
	if updated != 1 {
		return fmt.Errorf(
			"persist NodeGraph document %s/%s migration: content revision CAS failed",
			document.workspaceID,
			document.documentID,
		)
	}
	return nil
}
