package verification

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"testing"
	"time"
)

func TestFilesystemArtifactStoreIsContentAddressedAndEnumeratesOldOrphans(t *testing.T) {
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	body := []byte(`{"safe":"artifact"}`)
	staged, err := store.PutStaging(ctx, "promotion-a", "artifact-a", bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatal(err)
	}
	durable, err := store.Promote(ctx, "workspace-a", digestBytes(body), int64(len(body)), staged.Locator)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := store.Promote(ctx, "workspace-a", digestBytes(body), int64(len(body)), staged.Locator)
	if err != nil || replayed != durable {
		t.Fatalf("content-addressed replay = %#v, %v; want %#v", replayed, err, durable)
	}
	reader, err := store.OpenDurable(ctx, durable.Locator)
	if err != nil {
		t.Fatal(err)
	}
	observed, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil || !bytes.Equal(observed, body) {
		t.Fatalf("durable bytes = %q, %v", observed, err)
	}
	old := time.Now().Add(-time.Hour)
	for _, locator := range []string{staged.Locator, durable.Locator} {
		namespace := "staging"
		if locator == durable.Locator {
			namespace = "objects"
		}
		resolved, err := store.resolve(locator, namespace)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(resolved, old, old); err != nil {
			t.Fatal(err)
		}
	}
	staging, err := store.ListStaging(ctx, time.Now().Add(-time.Minute), 10)
	if err != nil || len(staging) != 1 || staging[0].Locator != staged.Locator {
		t.Fatalf("staging enumeration = %#v, %v", staging, err)
	}
	objects, err := store.ListDurable(ctx, time.Now().Add(-time.Minute), 10)
	if err != nil || len(objects) != 1 || objects[0].Locator != durable.Locator {
		t.Fatalf("durable enumeration = %#v, %v", objects, err)
	}
	for _, locator := range []string{"../outside", "objects/../../outside", "/absolute"} {
		if _, err := store.OpenDurable(ctx, locator); err == nil {
			t.Fatalf("unsafe locator %q was accepted", locator)
		}
	}
}

func TestArtifactValidatorFailsClosedForIdentityActiveContentAndSecrets(t *testing.T) {
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	validator := NewArtifactValidator(NewCandidateValidator([]string{"known-canary"}))
	for name, body := range map[string][]byte{
		"active": []byte(`{"content":"<script>alert(1)</script>"}`),
		"secret": []byte(`{"value":"known-canary"}`),
		"unsafe": []byte(`{"__proto__":{"polluted":true}}`),
	} {
		t.Run(name, func(t *testing.T) {
			staged, err := store.PutStaging(
				context.Background(), "promotion-"+name, "artifact-"+name,
				bytes.NewReader(body), int64(len(body)),
			)
			if err != nil {
				t.Fatal(err)
			}
			_, err = validator.validateArtifactBody(context.Background(), store, CandidateArtifact{
				ID: "artifact-" + name, Kind: ArtifactReplayRecord,
				ExpectedDigest: digestBytes(body), ExpectedSize: int64(len(body)),
				ExpectedMediaType: "application/json",
			}, staged.Locator)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("unsafe artifact accepted: %v", err)
			}
		})
	}
}
