package verification

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type StoredObject struct {
	Locator string
	Size    int64
	Digest  string
}

type StoredObjectInfo struct {
	Locator    string
	ModifiedAt time.Time
}

type ArtifactObjectStore interface {
	PutStaging(ctx context.Context, promotionID string, artifactID string, source io.Reader, maximumBytes int64) (StoredObject, error)
	OpenStaging(ctx context.Context, locator string) (io.ReadCloser, error)
	DurableLocator(workspaceID string, expectedDigest string) (string, error)
	Promote(ctx context.Context, workspaceID string, expectedDigest string, expectedSize int64, stagingLocator string) (StoredObject, error)
	OpenDurable(ctx context.Context, locator string) (io.ReadCloser, error)
	DeleteStaging(ctx context.Context, locator string) error
	DeleteDurable(ctx context.Context, locator string) error
	ListStaging(ctx context.Context, modifiedBefore time.Time, limit int) ([]StoredObjectInfo, error)
	ListDurable(ctx context.Context, modifiedBefore time.Time, limit int) ([]StoredObjectInfo, error)
	CleanupTemporary(ctx context.Context, modifiedBefore time.Time, limit int) (int, error)
}

type FilesystemArtifactStore struct {
	root string
}

func NewFilesystemArtifactStore(root string) (*FilesystemArtifactStore, error) {
	absolute, err := filepath.Abs(strings.TrimSpace(root))
	if err != nil || strings.TrimSpace(root) == "" {
		return nil, errors.New("verification artifact store root is required")
	}
	for _, directory := range []string{
		filepath.Join(absolute, "staging"),
		filepath.Join(absolute, "objects"),
		filepath.Join(absolute, "temporary"),
	} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return nil, fmt.Errorf("create verification artifact store directory: %w", err)
		}
	}
	return &FilesystemArtifactStore{root: filepath.Clean(absolute)}, nil
}

func storeComponent(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

func (store *FilesystemArtifactStore) PutStaging(
	ctx context.Context,
	promotionID string,
	artifactID string,
	source io.Reader,
	maximumBytes int64,
) (StoredObject, error) {
	if store == nil || source == nil || maximumBytes < 0 {
		return StoredObject{}, ErrInvalid
	}
	relative := filepath.Join("staging", storeComponent(promotionID), storeComponent(artifactID)+".blob")
	target, err := store.resolve(relative, "staging")
	if err != nil {
		return StoredObject{}, err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return StoredObject{}, err
	}
	temporary, err := os.CreateTemp(filepath.Join(store.root, "temporary"), "stage-*.tmp")
	if err != nil {
		return StoredObject{}, err
	}
	temporaryName := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryName)
	}()
	hasher := sha256.New()
	written, err := copyContext(ctx, io.MultiWriter(temporary, hasher), io.LimitReader(source, maximumBytes+1))
	if err != nil {
		return StoredObject{}, err
	}
	if written > maximumBytes {
		return StoredObject{}, coded("VER-5005", "Artifact exceeds its byte budget.", ErrArtifactRejected)
	}
	if err := temporary.Sync(); err != nil {
		return StoredObject{}, err
	}
	if err := temporary.Close(); err != nil {
		return StoredObject{}, err
	}
	if err := linkOrVerify(temporaryName, target, "sha256-"+hex.EncodeToString(hasher.Sum(nil)), written); err != nil {
		return StoredObject{}, err
	}
	return StoredObject{
		Locator: filepath.ToSlash(relative),
		Size:    written,
		Digest:  "sha256-" + hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}

func (store *FilesystemArtifactStore) OpenStaging(ctx context.Context, locator string) (io.ReadCloser, error) {
	return store.open(ctx, locator, "staging")
}

func (store *FilesystemArtifactStore) Promote(
	ctx context.Context,
	workspaceID string,
	expectedDigest string,
	expectedSize int64,
	stagingLocator string,
) (StoredObject, error) {
	if !digestPattern.MatchString(expectedDigest) || expectedSize < 0 || expectedSize > maximumArtifactBytes {
		return StoredObject{}, ErrInvalid
	}
	source, err := store.OpenStaging(ctx, stagingLocator)
	if err != nil {
		return StoredObject{}, err
	}
	defer source.Close()
	relative, err := store.DurableLocator(workspaceID, expectedDigest)
	if err != nil {
		return StoredObject{}, err
	}
	target, err := store.resolve(relative, "objects")
	if err != nil {
		return StoredObject{}, err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return StoredObject{}, err
	}
	temporary, err := os.CreateTemp(filepath.Join(store.root, "temporary"), "promote-*.tmp")
	if err != nil {
		return StoredObject{}, err
	}
	temporaryName := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryName)
	}()
	hasher := sha256.New()
	written, err := copyContext(ctx, io.MultiWriter(temporary, hasher), io.LimitReader(source, expectedSize+1))
	if err != nil {
		return StoredObject{}, err
	}
	observed := "sha256-" + hex.EncodeToString(hasher.Sum(nil))
	if written != expectedSize || observed != expectedDigest {
		return StoredObject{}, coded("VER-5001", "Staged artifact changed before durable promotion.", ErrArtifactRejected)
	}
	if err := temporary.Sync(); err != nil {
		return StoredObject{}, err
	}
	if err := temporary.Close(); err != nil {
		return StoredObject{}, err
	}
	if err := linkOrVerify(temporaryName, target, expectedDigest, expectedSize); err != nil {
		return StoredObject{}, err
	}
	return StoredObject{Locator: filepath.ToSlash(relative), Size: expectedSize, Digest: expectedDigest}, nil
}

func (store *FilesystemArtifactStore) DurableLocator(
	workspaceID string,
	expectedDigest string,
) (string, error) {
	if store == nil || validateIdentifier(workspaceID, "workspace id") != nil ||
		!digestPattern.MatchString(expectedDigest) {
		return "", ErrInvalid
	}
	digestHex := strings.TrimPrefix(expectedDigest, "sha256-")
	return filepath.ToSlash(filepath.Join(
		"objects",
		storeComponent(workspaceID),
		digestHex[:2],
		digestHex+".blob",
	)), nil
}

func (store *FilesystemArtifactStore) OpenDurable(ctx context.Context, locator string) (io.ReadCloser, error) {
	return store.open(ctx, locator, "objects")
}

func (store *FilesystemArtifactStore) DeleteStaging(ctx context.Context, locator string) error {
	return store.delete(ctx, locator, "staging")
}

func (store *FilesystemArtifactStore) DeleteDurable(ctx context.Context, locator string) error {
	return store.delete(ctx, locator, "objects")
}

func (store *FilesystemArtifactStore) ListStaging(
	ctx context.Context,
	modifiedBefore time.Time,
	limit int,
) ([]StoredObjectInfo, error) {
	return store.list(ctx, "staging", modifiedBefore, limit)
}

func (store *FilesystemArtifactStore) ListDurable(
	ctx context.Context,
	modifiedBefore time.Time,
	limit int,
) ([]StoredObjectInfo, error) {
	return store.list(ctx, "objects", modifiedBefore, limit)
}

func (store *FilesystemArtifactStore) CleanupTemporary(
	ctx context.Context,
	modifiedBefore time.Time,
	limit int,
) (int, error) {
	if store == nil || modifiedBefore.IsZero() || limit < 1 || limit > 10_000 {
		return 0, ErrInvalid
	}
	root := filepath.Join(store.root, "temporary")
	removed := 0
	err := filepath.WalkDir(root, func(candidate string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if removed >= limit {
			return filepath.SkipAll
		}
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() || info.ModTime().After(modifiedBefore) {
			return nil
		}
		if err := os.Remove(candidate); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		removed++
		return nil
	})
	return removed, err
}

func (store *FilesystemArtifactStore) list(
	ctx context.Context,
	namespace string,
	modifiedBefore time.Time,
	limit int,
) ([]StoredObjectInfo, error) {
	if store == nil || (namespace != "staging" && namespace != "objects") ||
		modifiedBefore.IsZero() || limit < 1 || limit > 10_000 {
		return nil, ErrInvalid
	}
	root := filepath.Join(store.root, namespace)
	result := make([]StoredObjectInfo, 0, limit)
	err := filepath.WalkDir(root, func(candidate string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if len(result) >= limit {
			return filepath.SkipAll
		}
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() || info.ModTime().After(modifiedBefore) {
			return nil
		}
		relative, err := filepath.Rel(store.root, candidate)
		if err != nil {
			return err
		}
		locator := filepath.ToSlash(relative)
		if _, err := store.resolve(relative, namespace); err != nil {
			return err
		}
		result = append(result, StoredObjectInfo{
			Locator: locator, ModifiedAt: info.ModTime().UTC(),
		})
		return nil
	})
	sort.Slice(result, func(left, right int) bool {
		return result[left].Locator < result[right].Locator
	})
	return result, err
}

func (store *FilesystemArtifactStore) open(ctx context.Context, locator string, namespace string) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	resolved, err := store.resolve(filepath.FromSlash(locator), namespace)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(resolved)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrArtifactMissing
	}
	return file, err
}

func (store *FilesystemArtifactStore) delete(ctx context.Context, locator string, namespace string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	resolved, err := store.resolve(filepath.FromSlash(locator), namespace)
	if err != nil {
		return err
	}
	err = os.Remove(resolved)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (store *FilesystemArtifactStore) resolve(relative string, namespace string) (string, error) {
	if store == nil || (namespace != "staging" && namespace != "objects") ||
		filepath.IsAbs(relative) || strings.ContainsRune(relative, '\x00') {
		return "", ErrInvalid
	}
	clean := filepath.Clean(relative)
	namespaceRoot := filepath.Join(store.root, namespace)
	resolved := filepath.Join(store.root, clean)
	within, err := filepath.Rel(namespaceRoot, resolved)
	if err != nil || within == ".." || strings.HasPrefix(within, ".."+string(filepath.Separator)) ||
		within == "." {
		return "", coded("VER-5005", "Artifact locator is outside its server-owned namespace.", ErrInvalid)
	}
	return resolved, nil
}

func linkOrVerify(source string, target string, expectedDigest string, expectedSize int64) error {
	if err := os.Link(source, target); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrExist) {
		return fmt.Errorf("atomically install verification artifact: %w", err)
	}
	file, err := os.Open(target)
	if err != nil {
		return err
	}
	defer file.Close()
	hasher := sha256.New()
	size, err := io.Copy(hasher, io.LimitReader(file, expectedSize+1))
	if err != nil {
		return err
	}
	if size != expectedSize || "sha256-"+hex.EncodeToString(hasher.Sum(nil)) != expectedDigest {
		return coded("VER-5001", "Content-addressed artifact collision detected.", ErrConflict)
	}
	return nil
}

func copyContext(ctx context.Context, destination io.Writer, source io.Reader) (int64, error) {
	buffer := make([]byte, 64*1024)
	var total int64
	for {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		count, readErr := source.Read(buffer)
		if count > 0 {
			written, writeErr := destination.Write(buffer[:count])
			total += int64(written)
			if writeErr != nil {
				return total, writeErr
			}
			if written != count {
				return total, io.ErrShortWrite
			}
		}
		if errors.Is(readErr, io.EOF) {
			return total, nil
		}
		if readErr != nil {
			return total, readErr
		}
	}
}
