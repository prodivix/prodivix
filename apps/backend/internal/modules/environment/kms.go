package environment

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"sort"
)

const (
	secretEnvelopeAlgorithm          = "AES-256-GCM+KMS-DATA-KEY/v1"
	staticKeyRingProviderID          = "prodivix.static-keyring/v1"
	maximumEnvironmentSecretKeyCount = 16
)

type storedSecretEnvelope struct {
	Algorithm       string
	KeyProvider     string
	KeyID           string
	WrappedKeyNonce []byte
	WrappedKey      []byte
	Nonce           []byte
	Ciphertext      []byte
}

type secretKeyManagementService interface {
	ProviderID() string
	ActiveKeyID() string
	WrapDataKey(ctx context.Context, dataKey []byte, additionalData []byte) (keyID string, nonce []byte, ciphertext []byte, err error)
	UnwrapDataKey(ctx context.Context, keyID string, nonce []byte, ciphertext []byte, additionalData []byte) ([]byte, error)
}

type staticKeyRingKMS struct {
	activeKeyID string
	keys        map[string]cipher.AEAD
}

func newStaticKeyRingKMS(activeKeyID string, encodedKeys map[string]string) (*staticKeyRingKMS, error) {
	if activeKeyID == "" || len(encodedKeys) == 0 || len(encodedKeys) > maximumEnvironmentSecretKeyCount {
		return nil, ErrUnavailable
	}
	keyIDs := make([]string, 0, len(encodedKeys))
	for keyID := range encodedKeys {
		keyIDs = append(keyIDs, keyID)
	}
	sort.Strings(keyIDs)
	keys := make(map[string]cipher.AEAD, len(encodedKeys))
	for _, keyID := range keyIDs {
		if normalized, ok := canonical(keyID); !ok || normalized != keyID {
			return nil, errors.New("environment Secret KMS key id is invalid")
		}
		key, err := decodeSecretKey(encodedKeys[keyID])
		if err != nil {
			return nil, fmt.Errorf("decode environment Secret KMS key %q: %w", keyID, err)
		}
		block, err := aes.NewCipher(key)
		clearBytes(key)
		if err != nil {
			return nil, fmt.Errorf("initialize environment Secret KMS key %q: %w", keyID, err)
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, fmt.Errorf("initialize environment Secret KMS AEAD %q: %w", keyID, err)
		}
		keys[keyID] = aead
	}
	if _, ok := keys[activeKeyID]; !ok {
		return nil, errors.New("environment Secret active KMS key is not present in the key ring")
	}
	return &staticKeyRingKMS{activeKeyID: activeKeyID, keys: keys}, nil
}

func (kms *staticKeyRingKMS) ProviderID() string {
	return staticKeyRingProviderID
}

func (kms *staticKeyRingKMS) ActiveKeyID() string {
	if kms == nil {
		return ""
	}
	return kms.activeKeyID
}

func randomNonce(aead cipher.AEAD) ([]byte, error) {
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return nonce, nil
}

func (kms *staticKeyRingKMS) WrapDataKey(_ context.Context, dataKey []byte, additionalData []byte) (string, []byte, []byte, error) {
	if kms == nil || len(dataKey) != 32 {
		return "", nil, nil, ErrUnavailable
	}
	aead := kms.keys[kms.activeKeyID]
	if aead == nil {
		return "", nil, nil, ErrUnavailable
	}
	nonce, err := randomNonce(aead)
	if err != nil {
		return "", nil, nil, fmt.Errorf("create environment Secret wrapped-key nonce: %w", err)
	}
	return kms.activeKeyID, nonce, aead.Seal(nil, nonce, dataKey, additionalData), nil
}

func (kms *staticKeyRingKMS) UnwrapDataKey(_ context.Context, keyID string, nonce []byte, ciphertext []byte, additionalData []byte) ([]byte, error) {
	if kms == nil {
		return nil, ErrUnavailable
	}
	aead := kms.keys[keyID]
	if aead == nil || len(nonce) != aead.NonceSize() || len(ciphertext) != 32+aead.Overhead() {
		return nil, ErrPermissionDenied
	}
	dataKey, err := aead.Open(nil, nonce, ciphertext, additionalData)
	if err != nil || len(dataKey) != 32 {
		clearBytes(dataKey)
		return nil, ErrPermissionDenied
	}
	return dataKey, nil
}

type secretEnvelopeCipher struct {
	kms secretKeyManagementService
}

func newSecretEnvelopeCipher(kms secretKeyManagementService) (*secretEnvelopeCipher, error) {
	if kms == nil || kms.ProviderID() == "" || kms.ActiveKeyID() == "" {
		return nil, ErrUnavailable
	}
	return &secretEnvelopeCipher{kms: kms}, nil
}

func domainSeparatedAdditionalData(domain string, additionalData []byte) []byte {
	result := make([]byte, 0, len(domain)+1+len(additionalData))
	result = append(result, domain...)
	result = append(result, 0)
	return append(result, additionalData...)
}

func (value *secretEnvelopeCipher) encrypt(ctx context.Context, material []byte, additionalData []byte) (storedSecretEnvelope, error) {
	if value == nil || value.kms == nil {
		return storedSecretEnvelope{}, ErrUnavailable
	}
	dataKey := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dataKey); err != nil {
		return storedSecretEnvelope{}, fmt.Errorf("create environment Secret data key: %w", err)
	}
	defer clearBytes(dataKey)
	block, err := aes.NewCipher(dataKey)
	if err != nil {
		return storedSecretEnvelope{}, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return storedSecretEnvelope{}, err
	}
	nonce, err := randomNonce(aead)
	if err != nil {
		return storedSecretEnvelope{}, fmt.Errorf("create environment Secret nonce: %w", err)
	}
	ciphertext := aead.Seal(nil, nonce, material, domainSeparatedAdditionalData("prodivix.environment-secret.material.v1", additionalData))
	keyID, wrappedNonce, wrappedKey, err := value.kms.WrapDataKey(ctx, dataKey, domainSeparatedAdditionalData("prodivix.environment-secret.data-key.v1", additionalData))
	if err != nil {
		return storedSecretEnvelope{}, err
	}
	return storedSecretEnvelope{
		Algorithm:       secretEnvelopeAlgorithm,
		KeyProvider:     value.kms.ProviderID(),
		KeyID:           keyID,
		WrappedKeyNonce: wrappedNonce,
		WrappedKey:      wrappedKey,
		Nonce:           nonce,
		Ciphertext:      ciphertext,
	}, nil
}

func (value *secretEnvelopeCipher) decrypt(ctx context.Context, envelope storedSecretEnvelope, additionalData []byte) ([]byte, error) {
	if value == nil || value.kms == nil || envelope.Algorithm != secretEnvelopeAlgorithm || envelope.KeyProvider != value.kms.ProviderID() {
		return nil, ErrPermissionDenied
	}
	dataKey, err := value.kms.UnwrapDataKey(ctx, envelope.KeyID, envelope.WrappedKeyNonce, envelope.WrappedKey, domainSeparatedAdditionalData("prodivix.environment-secret.data-key.v1", additionalData))
	if err != nil {
		return nil, err
	}
	defer clearBytes(dataKey)
	block, err := aes.NewCipher(dataKey)
	if err != nil {
		return nil, ErrPermissionDenied
	}
	aead, err := cipher.NewGCM(block)
	if err != nil || len(envelope.Nonce) != aead.NonceSize() {
		return nil, ErrPermissionDenied
	}
	material, err := aead.Open(nil, envelope.Nonce, envelope.Ciphertext, domainSeparatedAdditionalData("prodivix.environment-secret.material.v1", additionalData))
	if err != nil {
		return nil, ErrPermissionDenied
	}
	return material, nil
}

func (value *secretEnvelopeCipher) rewrap(ctx context.Context, envelope storedSecretEnvelope, additionalData []byte) (storedSecretEnvelope, error) {
	if value == nil || value.kms == nil || envelope.Algorithm != secretEnvelopeAlgorithm || envelope.KeyProvider != value.kms.ProviderID() {
		return storedSecretEnvelope{}, ErrPermissionDenied
	}
	dataKey, err := value.kms.UnwrapDataKey(ctx, envelope.KeyID, envelope.WrappedKeyNonce, envelope.WrappedKey, domainSeparatedAdditionalData("prodivix.environment-secret.data-key.v1", additionalData))
	if err != nil {
		return storedSecretEnvelope{}, err
	}
	defer clearBytes(dataKey)
	keyID, nonce, wrappedKey, err := value.kms.WrapDataKey(ctx, dataKey, domainSeparatedAdditionalData("prodivix.environment-secret.data-key.v1", additionalData))
	if err != nil {
		return storedSecretEnvelope{}, err
	}
	envelope.KeyID = keyID
	envelope.WrappedKeyNonce = nonce
	envelope.WrappedKey = wrappedKey
	return envelope, nil
}
