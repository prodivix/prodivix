// Package canonicaljson owns the backend implementation of the same
// Unicode-code-point key ordering and JSON scalar spelling used by
// @prodivix/shared/canonical. It is for cross-runtime identity and digests,
// not presentation JSON.
package canonicaljson

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	maximumDepth         = 64
	maximumStringBytes   = 64 * 1024
	maximumMembers       = 50_000
	maximumEnvelopeDepth = 512
	maximumSafeInteger   = 9_007_199_254_740_991
)

type rawValidationLimits struct {
	maximumBytes       int
	maximumDepth       int
	maximumStringBytes int
	maximumMembers     int
}

// ValidateRaw rejects ambiguous JSON before encoding/json or the schema
// library can fold duplicate members into one value.
func ValidateRaw(source []byte, maximumBytes int) error {
	return validateRaw(source, rawValidationLimits{
		maximumBytes:       maximumBytes,
		maximumDepth:       maximumDepth,
		maximumStringBytes: maximumStringBytes,
		maximumMembers:     maximumMembers,
	})
}

// ValidateRawEnvelope rejects ambiguous or unsafe JSON members without
// imposing AgentPolicy's much smaller per-string/member budgets on a larger
// transport envelope. The caller's body limit remains the total allocation
// authority.
func ValidateRawEnvelope(source []byte, maximumBytes int) error {
	return validateRaw(source, rawValidationLimits{
		maximumBytes:       maximumBytes,
		maximumDepth:       maximumEnvelopeDepth,
		maximumStringBytes: maximumBytes,
		maximumMembers:     maximumBytes,
	})
}

func validateRaw(source []byte, limits rawValidationLimits) error {
	if len(source) == 0 || len(source) > limits.maximumBytes || !utf8.Valid(source) {
		return errors.New("JSON is empty, invalid UTF-8, or exceeds its byte budget")
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	members := 0
	if err := validateValue(decoder, 0, &members, limits); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("JSON must contain exactly one value")
	}
	return nil
}

func validateValue(decoder *json.Decoder, depth int, members *int, limits rawValidationLimits) error {
	if depth > limits.maximumDepth {
		return errors.New("JSON exceeds maximum depth")
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		switch value := token.(type) {
		case string:
			if len(value) > limits.maximumStringBytes {
				return errors.New("JSON string exceeds byte budget")
			}
		case json.Number:
			parsed, err := strconv.ParseFloat(value.String(), 64)
			if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) ||
				(math.Trunc(parsed) == parsed && math.Abs(parsed) > maximumSafeInteger) {
				return errors.New("JSON number is invalid or exceeds the safe integer range")
			}
		}
		return nil
	}
	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok || len(key) > limits.maximumStringBytes || key == "__proto__" {
				return errors.New("JSON object member name is invalid or unsafe")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("JSON object contains duplicate member %q", key)
			}
			seen[key] = struct{}{}
			*members++
			if *members > limits.maximumMembers {
				return errors.New("JSON exceeds member budget")
			}
			if err := validateValue(decoder, depth+1, members, limits); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return errors.New("JSON object is not closed")
		}
	case '[':
		for decoder.More() {
			if err := validateValue(decoder, depth+1, members, limits); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return errors.New("JSON array is not closed")
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	return nil
}

// Bytes serializes JSON values with Unicode code-point object-key order and
// JavaScript JSON.stringify scalar spelling.
func Bytes(value any) ([]byte, error) {
	intermediate, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode canonical JSON input: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(intermediate))
	decoder.UseNumber()
	var normalized any
	if err := decoder.Decode(&normalized); err != nil {
		return nil, fmt.Errorf("normalize canonical JSON input: %w", err)
	}
	return appendValue(make([]byte, 0, len(intermediate)), normalized)
}

// Digest returns the sha256-hex identity of Bytes(value).
func Digest(value any) (string, error) {
	encoded, err := Bytes(value)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(encoded)
	return "sha256-" + hex.EncodeToString(digest[:]), nil
}

func appendValue(destination []byte, value any) ([]byte, error) {
	switch typed := value.(type) {
	case nil:
		return append(destination, "null"...), nil
	case bool:
		if typed {
			return append(destination, "true"...), nil
		}
		return append(destination, "false"...), nil
	case json.Number:
		parsed, err := strconv.ParseFloat(typed.String(), 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) ||
			(math.Trunc(parsed) == parsed && math.Abs(parsed) > maximumSafeInteger) {
			return nil, errors.New("canonical JSON number is invalid")
		}
		return append(destination, javascriptNumber(parsed)...), nil
	case string:
		return appendString(destination, typed), nil
	case []any:
		destination = append(destination, '[')
		for index, entry := range typed {
			if index > 0 {
				destination = append(destination, ',')
			}
			var err error
			destination, err = appendValue(destination, entry)
			if err != nil {
				return nil, err
			}
		}
		return append(destination, ']'), nil
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		destination = append(destination, '{')
		for index, key := range keys {
			if index > 0 {
				destination = append(destination, ',')
			}
			destination = appendString(destination, key)
			destination = append(destination, ':')
			var err error
			destination, err = appendValue(destination, typed[key])
			if err != nil {
				return nil, err
			}
		}
		return append(destination, '}'), nil
	default:
		return nil, fmt.Errorf("unsupported canonical JSON value %T", value)
	}
}

func appendString(destination []byte, value string) []byte {
	destination = append(destination, '"')
	for _, character := range value {
		switch character {
		case '"':
			destination = append(destination, '\\', '"')
		case '\\':
			destination = append(destination, '\\', '\\')
		case '\b':
			destination = append(destination, '\\', 'b')
		case '\f':
			destination = append(destination, '\\', 'f')
		case '\n':
			destination = append(destination, '\\', 'n')
		case '\r':
			destination = append(destination, '\\', 'r')
		case '\t':
			destination = append(destination, '\\', 't')
		default:
			if character < 0x20 {
				destination = append(destination, fmt.Sprintf("\\u%04x", character)...)
			} else {
				destination = utf8.AppendRune(destination, character)
			}
		}
	}
	return append(destination, '"')
}

func javascriptNumber(value float64) string {
	if value == 0 {
		return "0"
	}
	absolute := math.Abs(value)
	if absolute >= 1e21 || absolute < 1e-6 {
		encoded := strconv.FormatFloat(value, 'e', -1, 64)
		parts := strings.SplitN(encoded, "e", 2)
		exponent := parts[1]
		sign := ""
		if strings.HasPrefix(exponent, "-") || strings.HasPrefix(exponent, "+") {
			sign, exponent = exponent[:1], exponent[1:]
		}
		exponent = strings.TrimLeft(exponent, "0")
		if exponent == "" {
			exponent = "0"
		}
		if sign == "+" {
			return parts[0] + "e+" + exponent
		}
		return parts[0] + "e" + sign + exponent
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}
