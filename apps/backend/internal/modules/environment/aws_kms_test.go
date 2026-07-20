package environment

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awskms "github.com/aws/aws-sdk-go-v2/service/kms"
	awskmstypes "github.com/aws/aws-sdk-go-v2/service/kms/types"
)

const (
	oldAWSKMSKeyARN       = "arn:aws:kms:us-east-1:111122223333:key/11111111-1111-1111-1111-111111111111"
	newAWSKMSKeyARN       = "arn:aws:kms:us-east-1:111122223333:key/77777777-7777-7777-7777-777777777777"
	primaryAWSKMSMRKARN   = "arn:aws:kms:us-east-1:111122223333:key/mrk-1234abcd1234abcd1234abcd1234abcd"
	replicaAWSKMSMRKARN   = "arn:aws:kms:eu-west-1:111122223333:key/mrk-1234abcd1234abcd1234abcd1234abcd"
	unrelatedAWSKMSMRKARN = "arn:aws:kms:eu-west-1:111122223333:key/mrk-9999abcd9999abcd9999abcd9999abcd"
)

type fakeAWSKMSClient struct {
	encrypt func(context.Context, *awskms.EncryptInput) (*awskms.EncryptOutput, error)
	decrypt func(context.Context, *awskms.DecryptInput) (*awskms.DecryptOutput, error)
}

func (client *fakeAWSKMSClient) Encrypt(ctx context.Context, input *awskms.EncryptInput, _ ...func(*awskms.Options)) (*awskms.EncryptOutput, error) {
	return client.encrypt(ctx, input)
}

func (client *fakeAWSKMSClient) Decrypt(ctx context.Context, input *awskms.DecryptInput, _ ...func(*awskms.Options)) (*awskms.DecryptOutput, error) {
	return client.decrypt(ctx, input)
}

type memoryAWSKMSRecord struct {
	keyIdentity string
	plaintext   []byte
	contextMap  map[string]string
}

type memoryAWSKMSClient struct {
	mutex   sync.Mutex
	next    byte
	records map[string]memoryAWSKMSRecord
}

func newMemoryAWSKMSClient() *memoryAWSKMSClient {
	return &memoryAWSKMSClient{records: map[string]memoryAWSKMSRecord{}}
}

func (client *memoryAWSKMSClient) Encrypt(_ context.Context, input *awskms.EncryptInput, _ ...func(*awskms.Options)) (*awskms.EncryptOutput, error) {
	client.mutex.Lock()
	defer client.mutex.Unlock()
	client.next++
	ciphertext := bytes.Repeat([]byte{client.next}, 96)
	client.records[string(ciphertext)] = memoryAWSKMSRecord{
		keyIdentity: func() string {
			identity, _ := stableAWSKMSKeyIdentity(aws.ToString(input.KeyId))
			return identity
		}(),
		plaintext:  append([]byte(nil), input.Plaintext...),
		contextMap: cloneStringMap(input.EncryptionContext),
	}
	return &awskms.EncryptOutput{
		CiphertextBlob:      ciphertext,
		EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
		KeyId:               input.KeyId,
	}, nil
}

func (client *memoryAWSKMSClient) Decrypt(_ context.Context, input *awskms.DecryptInput, _ ...func(*awskms.Options)) (*awskms.DecryptOutput, error) {
	client.mutex.Lock()
	defer client.mutex.Unlock()
	record, ok := client.records[string(input.CiphertextBlob)]
	keyIdentity, _ := stableAWSKMSKeyIdentity(aws.ToString(input.KeyId))
	if !ok || record.keyIdentity != keyIdentity || !reflect.DeepEqual(record.contextMap, input.EncryptionContext) {
		return nil, errors.New("invalid ciphertext")
	}
	return &awskms.DecryptOutput{
		Plaintext:           append([]byte(nil), record.plaintext...),
		EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
		KeyId:               input.KeyId,
	}, nil
}

func cloneStringMap(input map[string]string) map[string]string {
	result := make(map[string]string, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func TestAWSKMSWrapAndUnwrapUseExactKeyAndHashedEncryptionContext(t *testing.T) {
	dataKey := bytes.Repeat([]byte{0x42}, 32)
	additionalData := []byte("workspace-1\x00environment-1\x00revision-1\x00binding-1")
	ciphertext := bytes.Repeat([]byte{0x99}, 96)
	digest := sha256.Sum256(additionalData)
	expectedContext := map[string]string{
		"prodivix-aad-sha256": hex.EncodeToString(digest[:]),
		"prodivix-purpose":    "environment-secret-data-key-v2",
	}
	decryptCalls := 0
	client := &fakeAWSKMSClient{
		encrypt: func(_ context.Context, input *awskms.EncryptInput) (*awskms.EncryptOutput, error) {
			if aws.ToString(input.KeyId) != newAWSKMSKeyARN || !bytes.Equal(input.Plaintext, dataKey) || input.EncryptionAlgorithm != awskmstypes.EncryptionAlgorithmSpecSymmetricDefault || !reflect.DeepEqual(input.EncryptionContext, expectedContext) {
				t.Fatalf("unexpected AWS KMS Encrypt input: %#v", input)
			}
			for _, value := range input.EncryptionContext {
				if value == string(additionalData) {
					t.Fatal("raw Workspace/environment identity entered CloudTrail-visible encryption context")
				}
			}
			return &awskms.EncryptOutput{
				CiphertextBlob:      append([]byte(nil), ciphertext...),
				EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
				KeyId:               aws.String(newAWSKMSKeyARN),
			}, nil
		},
		decrypt: func(_ context.Context, input *awskms.DecryptInput) (*awskms.DecryptOutput, error) {
			decryptCalls++
			if aws.ToString(input.KeyId) != newAWSKMSKeyARN || !bytes.Equal(input.CiphertextBlob, ciphertext) || input.EncryptionAlgorithm != awskmstypes.EncryptionAlgorithmSpecSymmetricDefault || !reflect.DeepEqual(input.EncryptionContext, expectedContext) {
				t.Fatalf("unexpected AWS KMS Decrypt input: %#v", input)
			}
			return &awskms.DecryptOutput{
				Plaintext:           append([]byte(nil), dataKey...),
				EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
				KeyId:               aws.String(newAWSKMSKeyARN),
			}, nil
		},
	}
	kms, err := newAWSKMS("key-new", map[string]string{"key-new": newAWSKMSKeyARN}, client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	keyID, metadata, wrapped, err := kms.WrapDataKey(t.Context(), dataKey, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if keyID != "key-new" || len(metadata) != sha256.Size || !bytes.Equal(wrapped, ciphertext) {
		t.Fatalf("unexpected wrapped key envelope: key=%q metadata=%d ciphertext=%d", keyID, len(metadata), len(wrapped))
	}
	unwrapped, err := kms.UnwrapDataKey(t.Context(), keyID, metadata, wrapped, additionalData)
	if err != nil || !bytes.Equal(unwrapped, dataKey) {
		t.Fatalf("unwrap exact AWS KMS data key: %v", err)
	}
	clearBytes(unwrapped)

	tamperedMetadata := append([]byte(nil), metadata...)
	tamperedMetadata[0] ^= 0xff
	if _, err := kms.UnwrapDataKey(t.Context(), keyID, tamperedMetadata, wrapped, additionalData); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("tampered provider metadata was not rejected: %v", err)
	}
	if _, err := kms.UnwrapDataKey(t.Context(), keyID, metadata, wrapped, []byte("wrong-aad")); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("wrong authenticated context was not rejected: %v", err)
	}
	if decryptCalls != 1 {
		t.Fatalf("local correlation gate called KMS for tampered envelopes: calls=%d", decryptCalls)
	}
}

func TestAWSKMSMultiRegionReplicaUsesStableIdentityAndRejectsUnrelatedKeys(t *testing.T) {
	if err := validateAWSKMSMultiRegionReplicaPair(primaryAWSKMSMRKARN, replicaAWSKMSMRKARN); err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]string{
		{primaryAWSKMSMRKARN, unrelatedAWSKMSMRKARN},
		{oldAWSKMSKeyARN, newAWSKMSKeyARN},
		{primaryAWSKMSMRKARN, primaryAWSKMSMRKARN},
	} {
		if err := validateAWSKMSMultiRegionReplicaPair(pair[0], pair[1]); err == nil {
			t.Fatalf("unrelated or same-Region KMS keys were accepted: %q %q", pair[0], pair[1])
		}
	}
	if err := validateAWSKMSRegion("us-east-1", map[string]string{"key-mrk": primaryAWSKMSMRKARN}); err != nil {
		t.Fatal(err)
	}
	if err := validateAWSKMSRegion("eu-west-1", map[string]string{"key-mrk": replicaAWSKMSMRKARN}); err != nil {
		t.Fatal(err)
	}

	client := newMemoryAWSKMSClient()
	primary, err := newAWSKMS("key-mrk", map[string]string{"key-mrk": primaryAWSKMSMRKARN}, client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	replica, err := newAWSKMS("key-mrk", map[string]string{"key-mrk": replicaAWSKMSMRKARN}, client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	dataKey := bytes.Repeat([]byte{0x5a}, 32)
	additionalData := []byte("workspace\x00environment\x00revision\x00binding")
	keyID, metadata, ciphertext, err := primary.WrapDataKey(t.Context(), dataKey, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if primary.ProviderID() != "aws.kms/v2" || keyID != "key-mrk" {
		t.Fatalf("unexpected MRK provider identity: provider=%q key=%q", primary.ProviderID(), keyID)
	}
	unwrapped, err := replica.UnwrapDataKey(t.Context(), keyID, metadata, ciphertext, additionalData)
	if err != nil || !bytes.Equal(unwrapped, dataKey) {
		t.Fatalf("related MRK replica did not unwrap the primary ciphertext: %v", err)
	}
	clearBytes(unwrapped)

	unrelated, _ := newAWSKMS("key-mrk", map[string]string{"key-mrk": unrelatedAWSKMSMRKARN}, client, time.Second)
	if _, err := unrelated.UnwrapDataKey(t.Context(), keyID, metadata, ciphertext, additionalData); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("unrelated MRK key passed the stable identity fence: %v", err)
	}
	nonMRKReplica, _ := newAWSKMS("key-mrk", map[string]string{
		"key-mrk": "arn:aws:kms:eu-west-1:111122223333:key/11111111-1111-1111-1111-111111111111",
	}, client, time.Second)
	if _, err := nonMRKReplica.UnwrapDataKey(t.Context(), keyID, metadata, ciphertext, additionalData); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("single-Region key crossed the exact ARN fence: %v", err)
	}
}

func TestAWSKMSEnvelopeRotationRewrapsOnlyTheDataKey(t *testing.T) {
	client := newMemoryAWSKMSClient()
	oldKMS, err := newAWSKMS("key-old", map[string]string{"key-old": oldAWSKMSKeyARN}, client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	oldCipher, _ := newSecretEnvelopeCipher(oldKMS)
	additionalData := []byte("workspace\x00environment\x00revision\x00binding")
	secret := []byte("prodivix-managed-kms-secret-canary")
	original, err := oldCipher.encrypt(t.Context(), secret, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if original.KeyProvider != awsKMSProviderID || original.KeyID != "key-old" {
		t.Fatalf("unexpected original managed KMS identity: %#v", original)
	}

	rotatingKMS, err := newAWSKMS("key-new", map[string]string{
		"key-old": oldAWSKMSKeyARN,
		"key-new": newAWSKMSKeyARN,
	}, client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	rotatingCipher, _ := newSecretEnvelopeCipher(rotatingKMS)
	rotated, err := rotatingCipher.rewrap(t.Context(), original, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if rotated.KeyID != "key-new" || bytes.Equal(rotated.WrappedKey, original.WrappedKey) || bytes.Equal(rotated.WrappedKeyNonce, original.WrappedKeyNonce) {
		t.Fatal("managed KMS rotation did not replace the wrapped data-key envelope")
	}
	if !bytes.Equal(rotated.Nonce, original.Nonce) || !bytes.Equal(rotated.Ciphertext, original.Ciphertext) {
		t.Fatal("managed KMS rotation decrypted or rewrote Secret ciphertext")
	}
	material, err := rotatingCipher.decrypt(t.Context(), rotated, additionalData)
	if err != nil || !bytes.Equal(material, secret) {
		t.Fatalf("rotated managed KMS envelope did not resolve: %v", err)
	}
	clearBytes(material)

	retiredKMS, _ := newAWSKMS("key-new", map[string]string{"key-new": newAWSKMSKeyARN}, client, time.Second)
	retiredCipher, _ := newSecretEnvelopeCipher(retiredKMS)
	if _, err := retiredCipher.decrypt(t.Context(), original, additionalData); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("retired managed KMS key remained addressable: %v", err)
	}
}

func TestAWSKMSMigrationRewrapsStaticProviderWithoutReencryptingSecret(t *testing.T) {
	staticKMS, err := newStaticKeyRingKMS("key-static-old", map[string]string{
		"key-static-old": encodedKey(0x11),
	})
	if err != nil {
		t.Fatal(err)
	}
	staticCipher, _ := newSecretEnvelopeCipher(staticKMS)
	additionalData := []byte("workspace\x00environment\x00revision\x00binding")
	secret := []byte("prodivix-static-to-managed-kms-canary")
	original, err := staticCipher.encrypt(t.Context(), secret, additionalData)
	if err != nil {
		t.Fatal(err)
	}

	client := newMemoryAWSKMSClient()
	managedKMS, err := newAWSKMS("key-cloud-new", map[string]string{"key-cloud-new": newAWSKMSKeyARN}, client, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	store := newStoreWithKMS(nil, "", managedKMS, nil, staticKMS)
	rotated, err := store.rewrapSecretEnvelope(t.Context(), original, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if rotated.KeyProvider != awsKMSProviderID || rotated.KeyID != "key-cloud-new" {
		t.Fatalf("static envelope did not migrate to managed KMS: %#v", rotated)
	}
	if !bytes.Equal(rotated.Nonce, original.Nonce) || !bytes.Equal(rotated.Ciphertext, original.Ciphertext) {
		t.Fatal("static-to-managed migration rewrote Secret ciphertext")
	}
	material, err := store.decryptSecretEnvelope(t.Context(), rotated, additionalData)
	if err != nil || !bytes.Equal(material, secret) {
		t.Fatalf("managed envelope did not decrypt after static migration: %v", err)
	}
	clearBytes(material)

	withoutStatic := newStoreWithKMS(nil, "", managedKMS, nil)
	if _, err := withoutStatic.rewrapSecretEnvelope(t.Context(), original, additionalData); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("migration proceeded after the source static key ring was removed: %v", err)
	}
}

func TestAWSKMSFailsClosedOnInvalidConfigurationResponseAndTimeout(t *testing.T) {
	validClient := &fakeAWSKMSClient{
		encrypt: func(_ context.Context, _ *awskms.EncryptInput) (*awskms.EncryptOutput, error) {
			return &awskms.EncryptOutput{
				CiphertextBlob:      bytes.Repeat([]byte{0x11}, 96),
				EncryptionAlgorithm: awskmstypes.EncryptionAlgorithmSpecSymmetricDefault,
				KeyId:               aws.String(oldAWSKMSKeyARN),
			}, nil
		},
		decrypt: func(_ context.Context, _ *awskms.DecryptInput) (*awskms.DecryptOutput, error) {
			return nil, errors.New("not used")
		},
	}
	for _, test := range []struct {
		name    string
		active  string
		keyARNs map[string]string
		client  awsKMSClient
		timeout time.Duration
	}{
		{name: "missing active", active: "missing", keyARNs: map[string]string{"key-old": oldAWSKMSKeyARN}, client: validClient, timeout: time.Second},
		{name: "alias is mutable", active: "key-old", keyARNs: map[string]string{"key-old": "alias/prodivix"}, client: validClient, timeout: time.Second},
		{name: "nil client", active: "key-old", keyARNs: map[string]string{"key-old": oldAWSKMSKeyARN}, timeout: time.Second},
		{name: "unbounded timeout", active: "key-old", keyARNs: map[string]string{"key-old": oldAWSKMSKeyARN}, client: validClient, timeout: 31 * time.Second},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := newAWSKMS(test.active, test.keyARNs, test.client, test.timeout); err == nil {
				t.Fatal("invalid managed KMS configuration was accepted")
			}
		})
	}
	if err := validateAWSKMSRegion("eu-west-1", map[string]string{"key-new": newAWSKMSKeyARN}); err == nil {
		t.Fatal("AWS KMS client region drift was accepted")
	}

	wrongIdentity, _ := newAWSKMS("key-new", map[string]string{"key-new": newAWSKMSKeyARN}, validClient, time.Second)
	if _, _, _, err := wrongIdentity.WrapDataKey(t.Context(), bytes.Repeat([]byte{1}, 32), []byte("aad")); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("AWS KMS response key drift was accepted: %v", err)
	}

	timeoutClient := &fakeAWSKMSClient{
		encrypt: func(ctx context.Context, _ *awskms.EncryptInput) (*awskms.EncryptOutput, error) {
			<-ctx.Done()
			return nil, ctx.Err()
		},
		decrypt: func(_ context.Context, _ *awskms.DecryptInput) (*awskms.DecryptOutput, error) {
			return nil, errors.New("not used")
		},
	}
	timeoutKMS, _ := newAWSKMS("key-new", map[string]string{"key-new": newAWSKMSKeyARN}, timeoutClient, time.Millisecond)
	if _, _, _, err := timeoutKMS.WrapDataKey(t.Context(), bytes.Repeat([]byte{1}, 32), []byte("aad")); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("AWS KMS timeout was not bounded: %v", err)
	}
}
