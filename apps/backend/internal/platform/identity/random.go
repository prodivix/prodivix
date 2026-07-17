package identity

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
)

var randomReader io.Reader = rand.Reader

func NewRandomHex(size int) (string, error) {
	if size <= 0 {
		return "", fmt.Errorf("random identity size must be positive")
	}
	buffer := make([]byte, size)
	if _, err := io.ReadFull(randomReader, buffer); err != nil {
		return "", fmt.Errorf("read cryptographic randomness: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}

func NewID(prefix string, size int) (string, error) {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return "", fmt.Errorf("identity prefix is required")
	}
	random, err := NewRandomHex(size)
	if err != nil {
		return "", err
	}
	return prefix + "_" + random, nil
}
