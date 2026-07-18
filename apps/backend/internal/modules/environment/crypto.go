package environment

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

type secretCipher struct {
	aead cipher.AEAD
}

func decodeSecretKey(encodedKey string) ([]byte, error) {
	if encodedKey == "" {
		return nil, ErrUnavailable
	}
	var key []byte
	var decodeErr error
	for _, encoding := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		decoded, err := encoding.DecodeString(encodedKey)
		clearBytes(key)
		key, decodeErr = decoded, err
		if decodeErr == nil {
			break
		}
	}
	if decodeErr != nil || len(key) != 32 {
		clearBytes(key)
		return nil, errors.New("environment Secret key must be base64-encoded 256-bit material")
	}
	return key, nil
}

func newSecretCipher(encodedKey string) (*secretCipher, error) {
	key, err := decodeSecretKey(encodedKey)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	clearBytes(key)
	if err != nil {
		return nil, fmt.Errorf("initialize environment Secret cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("initialize environment Secret AEAD: %w", err)
	}
	return &secretCipher{aead: aead}, nil
}

func (value *secretCipher) encrypt(material []byte, additionalData []byte) ([]byte, []byte, error) {
	if value == nil || value.aead == nil {
		return nil, nil, ErrUnavailable
	}
	nonce := make([]byte, value.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, fmt.Errorf("create environment Secret nonce: %w", err)
	}
	ciphertext := value.aead.Seal(nil, nonce, material, additionalData)
	return nonce, ciphertext, nil
}

func (value *secretCipher) decrypt(nonce []byte, ciphertext []byte, additionalData []byte) ([]byte, error) {
	if value == nil || value.aead == nil {
		return nil, ErrUnavailable
	}
	material, err := value.aead.Open(nil, nonce, ciphertext, additionalData)
	if err != nil {
		return nil, ErrPermissionDenied
	}
	return material, nil
}

func clearBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
