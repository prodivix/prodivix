package workspace

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	MaxWorkspaceAssetBlobBytes            = 32 * 1024 * 1024
	MaxWorkspaceAssetImportBlobCount      = 256
	MaxWorkspaceAssetImportTotalBlobBytes = 128 * 1024 * 1024
)

var (
	ErrWorkspaceAssetBlobInvalid  = errors.New("workspace asset blob is invalid")
	ErrWorkspaceAssetBlobNotFound = errors.New("workspace asset blob not found")
	ErrWorkspaceAssetBlobConflict = errors.New("workspace asset blob identity conflict")
)

var (
	workspaceAssetDigestPattern    = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)
	workspaceAssetMediaTypePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$`)
)

type WorkspaceAssetBlobReference struct {
	Kind       string `json:"kind"`
	Digest     string `json:"digest"`
	ByteLength int64  `json:"byteLength"`
	MediaType  string `json:"mediaType"`
}

type WorkspaceAssetBlob struct {
	Reference WorkspaceAssetBlobReference
	Contents  []byte
	CreatedAt time.Time
}

// WorkspaceAssetBlobImport is an ephemeral, request-scoped exact-byte input.
// Canonical Workspace documents continue to persist references only.
type WorkspaceAssetBlobImport struct {
	Reference WorkspaceAssetBlobReference
	Contents  []byte
}

type WorkspaceAssetBlobPutResult struct {
	Kind      string
	Reference WorkspaceAssetBlobReference
}

func computeWorkspaceAssetDigest(contents []byte) string {
	digest := sha256.Sum256(contents)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func normalizeWorkspaceAssetMediaType(value string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if len(normalized) > 127 || !workspaceAssetMediaTypePattern.MatchString(normalized) {
		return "", ErrWorkspaceAssetBlobInvalid
	}
	return normalized, nil
}

func createWorkspaceAssetBlobReference(digest string, mediaType string, byteLength int64) (WorkspaceAssetBlobReference, error) {
	digest = strings.TrimSpace(digest)
	if !workspaceAssetDigestPattern.MatchString(digest) || byteLength < 0 || byteLength > MaxWorkspaceAssetBlobBytes {
		return WorkspaceAssetBlobReference{}, ErrWorkspaceAssetBlobInvalid
	}
	normalizedMediaType, err := normalizeWorkspaceAssetMediaType(mediaType)
	if err != nil {
		return WorkspaceAssetBlobReference{}, err
	}
	return WorkspaceAssetBlobReference{
		Kind:       "workspace-blob",
		Digest:     digest,
		ByteLength: byteLength,
		MediaType:  normalizedMediaType,
	}, nil
}

func readWorkspaceAssetDocumentReference(document WorkspaceDocumentRecord) (WorkspaceAssetBlobReference, error) {
	var content struct {
		Mime string `json:"mime"`
		Size int64  `json:"size"`
		Blob struct {
			Kind       string `json:"kind"`
			Digest     string `json:"digest"`
			ByteLength int64  `json:"byteLength"`
			MediaType  string `json:"mediaType"`
		} `json:"blob"`
	}
	if err := json.Unmarshal(document.Content, &content); err != nil {
		return WorkspaceAssetBlobReference{}, err
	}
	reference, err := createWorkspaceAssetBlobReference(content.Blob.Digest, content.Blob.MediaType, content.Blob.ByteLength)
	if err != nil || content.Blob.Kind != "workspace-blob" || content.Mime != reference.MediaType || content.Size != reference.ByteLength {
		return WorkspaceAssetBlobReference{}, fmt.Errorf("%w: asset document %s", ErrWorkspaceAssetBlobInvalid, document.ID)
	}
	return reference, nil
}

func normalizeWorkspaceAssetBlobImports(
	imports []WorkspaceAssetBlobImport,
	documents map[string]WorkspaceDocumentRecord,
) ([]WorkspaceAssetBlobImport, error) {
	requiredByDigest := make(map[string]WorkspaceAssetBlobReference)
	for _, document := range documents {
		if document.Type != WorkspaceDocumentTypeAsset {
			continue
		}
		reference, err := readWorkspaceAssetDocumentReference(document)
		if err != nil {
			return nil, err
		}
		if existing, exists := requiredByDigest[reference.Digest]; exists &&
			(existing.ByteLength != reference.ByteLength || existing.MediaType != reference.MediaType) {
			return nil, fmt.Errorf("%w: asset digest %s", ErrWorkspaceAssetBlobConflict, reference.Digest)
		}
		requiredByDigest[reference.Digest] = reference
	}

	if len(imports) > MaxWorkspaceAssetImportBlobCount {
		return nil, fmt.Errorf("%w: asset import blob count exceeds limit", ErrWorkspaceAssetBlobInvalid)
	}
	normalizedByDigest := make(map[string]WorkspaceAssetBlobImport, len(imports))
	var totalBytes int64
	for _, candidate := range imports {
		if candidate.Reference.Kind != "workspace-blob" || len(candidate.Contents) > MaxWorkspaceAssetBlobBytes {
			return nil, ErrWorkspaceAssetBlobInvalid
		}
		reference, err := createWorkspaceAssetBlobReference(
			candidate.Reference.Digest,
			candidate.Reference.MediaType,
			int64(len(candidate.Contents)),
		)
		if err != nil || candidate.Reference.ByteLength != reference.ByteLength || computeWorkspaceAssetDigest(candidate.Contents) != reference.Digest {
			return nil, ErrWorkspaceAssetBlobInvalid
		}
		if _, exists := normalizedByDigest[reference.Digest]; exists {
			return nil, fmt.Errorf("%w: duplicate asset digest %s", ErrWorkspaceAssetBlobConflict, reference.Digest)
		}
		required, exists := requiredByDigest[reference.Digest]
		if !exists {
			return nil, fmt.Errorf("%w: unreferenced asset digest %s", ErrWorkspaceAssetBlobInvalid, reference.Digest)
		}
		if required.ByteLength != reference.ByteLength || required.MediaType != reference.MediaType {
			return nil, fmt.Errorf("%w: asset digest %s", ErrWorkspaceAssetBlobConflict, reference.Digest)
		}
		totalBytes += reference.ByteLength
		if totalBytes > MaxWorkspaceAssetImportTotalBlobBytes {
			return nil, fmt.Errorf("%w: asset import byte budget exceeded", ErrWorkspaceAssetBlobInvalid)
		}
		normalizedByDigest[reference.Digest] = WorkspaceAssetBlobImport{
			Reference: reference,
			Contents:  append([]byte(nil), candidate.Contents...),
		}
	}
	for digest := range requiredByDigest {
		if _, exists := normalizedByDigest[digest]; !exists {
			return nil, fmt.Errorf("%w: asset digest %s", ErrWorkspaceAssetBlobNotFound, digest)
		}
	}

	digests := make([]string, 0, len(normalizedByDigest))
	for digest := range normalizedByDigest {
		digests = append(digests, digest)
	}
	sort.Strings(digests)
	normalized := make([]WorkspaceAssetBlobImport, 0, len(digests))
	for _, digest := range digests {
		normalized = append(normalized, normalizedByDigest[digest])
	}
	return normalized, nil
}

func insertWorkspaceAssetBlobImports(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	imports []WorkspaceAssetBlobImport,
) error {
	const insert = `INSERT INTO workspace_asset_blobs (
	workspace_id, digest, media_type, byte_length, contents, created_at
) VALUES ($1, $2, $3, $4, $5, NOW())`
	for _, blob := range imports {
		if _, err := tx.ExecContext(
			ctx,
			insert,
			workspaceID,
			blob.Reference.Digest,
			blob.Reference.MediaType,
			blob.Reference.ByteLength,
			blob.Contents,
		); err != nil {
			return err
		}
	}
	return nil
}

// PutWorkspaceAssetBlob verifies bytes before creating one Workspace-scoped,
// idempotent blob.
func (store *WorkspaceStore) PutWorkspaceAssetBlob(
	ctx context.Context,
	ownerID string,
	workspaceID string,
	digest string,
	mediaType string,
	contents []byte,
) (WorkspaceAssetBlobPutResult, error) {
	if store == nil || store.db == nil {
		return WorkspaceAssetBlobPutResult{}, errors.New("workspace store is not initialized")
	}
	if len(contents) > MaxWorkspaceAssetBlobBytes {
		return WorkspaceAssetBlobPutResult{}, ErrWorkspaceAssetBlobInvalid
	}
	reference, err := createWorkspaceAssetBlobReference(digest, mediaType, int64(len(contents)))
	if err != nil || computeWorkspaceAssetDigest(contents) != reference.Digest {
		return WorkspaceAssetBlobPutResult{}, ErrWorkspaceAssetBlobInvalid
	}
	if err := store.VerifyWorkspaceOwner(ctx, ownerID, workspaceID); err != nil {
		return WorkspaceAssetBlobPutResult{}, err
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	const insert = `INSERT INTO workspace_asset_blobs (
	workspace_id, digest, media_type, byte_length, contents, created_at
) VALUES ($1, $2, $3, $4, $5, NOW())
ON CONFLICT (workspace_id, digest) DO NOTHING`
	result, err := store.db.ExecContext(
		ctx,
		insert,
		strings.TrimSpace(workspaceID),
		reference.Digest,
		reference.MediaType,
		reference.ByteLength,
		contents,
	)
	if err != nil {
		return WorkspaceAssetBlobPutResult{}, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return WorkspaceAssetBlobPutResult{}, err
	}
	if rows == 1 {
		return WorkspaceAssetBlobPutResult{Kind: "stored", Reference: reference}, nil
	}
	// An authorized exact-byte retry refreshes only an existing orphan's
	// retention window. Referenced blobs keep their NULL orphan marker.
	const refreshRetention = `UPDATE workspace_asset_blobs
SET unreferenced_since = NOW()
WHERE workspace_id = $1
  AND digest = $2
  AND media_type = $3
  AND byte_length = $4
  AND contents = $5
  AND unreferenced_since IS NOT NULL`
	if _, err := store.db.ExecContext(
		ctx,
		refreshRetention,
		strings.TrimSpace(workspaceID),
		reference.Digest,
		reference.MediaType,
		reference.ByteLength,
		contents,
	); err != nil {
		return WorkspaceAssetBlobPutResult{}, err
	}

	const existingQuery = `SELECT media_type, byte_length, contents
FROM workspace_asset_blobs
WHERE workspace_id = $1 AND digest = $2`
	var existingMediaType string
	var existingByteLength int64
	var existingContents []byte
	if err := store.db.QueryRowContext(
		ctx,
		existingQuery,
		strings.TrimSpace(workspaceID),
		reference.Digest,
	).Scan(&existingMediaType, &existingByteLength, &existingContents); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return WorkspaceAssetBlobPutResult{}, ErrWorkspaceAssetBlobConflict
		}
		return WorkspaceAssetBlobPutResult{}, err
	}
	if existingMediaType != reference.MediaType ||
		existingByteLength != reference.ByteLength ||
		computeWorkspaceAssetDigest(existingContents) != reference.Digest {
		return WorkspaceAssetBlobPutResult{}, ErrWorkspaceAssetBlobConflict
	}
	return WorkspaceAssetBlobPutResult{Kind: "existing", Reference: reference}, nil
}

func (store *WorkspaceStore) GetWorkspaceAssetBlobForOwner(
	ctx context.Context,
	ownerID string,
	workspaceID string,
	digest string,
) (*WorkspaceAssetBlob, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if !workspaceAssetDigestPattern.MatchString(strings.TrimSpace(digest)) {
		return nil, ErrWorkspaceAssetBlobInvalid
	}
	if err := store.VerifyWorkspaceOwner(ctx, ownerID, workspaceID); err != nil {
		return nil, err
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	const query = `SELECT media_type, byte_length, contents, created_at
FROM workspace_asset_blobs
WHERE workspace_id = $1 AND digest = $2`
	var mediaType string
	var byteLength int64
	var contents []byte
	var createdAt time.Time
	if err := store.db.QueryRowContext(
		ctx,
		query,
		strings.TrimSpace(workspaceID),
		strings.TrimSpace(digest),
	).Scan(&mediaType, &byteLength, &contents, &createdAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceAssetBlobNotFound
		}
		return nil, err
	}
	reference, err := createWorkspaceAssetBlobReference(digest, mediaType, byteLength)
	if err != nil || int64(len(contents)) != reference.ByteLength || computeWorkspaceAssetDigest(contents) != reference.Digest {
		return nil, fmt.Errorf("%w: stored blob verification failed", ErrWorkspaceAssetBlobConflict)
	}
	return &WorkspaceAssetBlob{
		Reference: reference,
		Contents:  append([]byte(nil), contents...),
		CreatedAt: createdAt,
	}, nil
}

func validateWorkspaceAssetBlobReferences(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	documents map[string]WorkspaceDocumentRecord,
) error {
	documentIDs := make([]string, 0, len(documents))
	for documentID := range documents {
		documentIDs = append(documentIDs, documentID)
	}
	sort.Strings(documentIDs)
	for _, documentID := range documentIDs {
		document := documents[documentID]
		if document.Type != WorkspaceDocumentTypeAsset {
			continue
		}
		reference, err := readWorkspaceAssetDocumentReference(document)
		if err != nil {
			return err
		}
		const query = `SELECT media_type, byte_length
FROM workspace_asset_blobs
WHERE workspace_id = $1 AND digest = $2`
		var storedMediaType string
		var storedByteLength int64
		if err := tx.QueryRowContext(ctx, query, workspaceID, reference.Digest).Scan(&storedMediaType, &storedByteLength); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("%w: asset document %s", ErrWorkspaceAssetBlobNotFound, document.ID)
			}
			return err
		}
		if storedMediaType != reference.MediaType || storedByteLength != reference.ByteLength {
			return fmt.Errorf("%w: asset document %s", ErrWorkspaceAssetBlobConflict, document.ID)
		}
	}
	return nil
}
