package verification

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	maximumCandidateBytes = 1024 * 1024
	maximumJSONDepth      = 64
	maximumJSONString     = 64 * 1024
	maximumJSONMembers    = 20_000
)

func digestBytes(value []byte) string {
	digest := sha256.Sum256(value)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func secretHash(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

func canonicalBytes(value any) ([]byte, error) {
	if err := validateCanonicalValue(reflect.ValueOf(value), 0); err != nil {
		return nil, err
	}
	intermediate, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode canonical JSON: %w", err)
	}
	var normalized any
	decoder := json.NewDecoder(bytes.NewReader(intermediate))
	if err := decoder.Decode(&normalized); err != nil {
		return nil, fmt.Errorf("normalize canonical JSON: %w", err)
	}
	if err := validateDecodedJSON(normalized, 0); err != nil {
		return nil, err
	}
	output := make([]byte, 0, len(intermediate))
	output, err = appendCanonicalJSON(output, normalized)
	if err != nil {
		return nil, err
	}
	return output, nil
}

func canonicalDigest(value any) (string, []byte, error) {
	encoded, err := canonicalBytes(value)
	if err != nil {
		return "", nil, err
	}
	return digestBytes(encoded), encoded, nil
}

func digestWithoutField(value any, field string) (string, []byte, error) {
	encoded, err := canonicalBytes(value)
	if err != nil {
		return "", nil, err
	}
	var object map[string]any
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	if err := decoder.Decode(&object); err != nil {
		return "", nil, err
	}
	delete(object, field)
	return canonicalDigest(object)
}

func validateCanonicalValue(value reflect.Value, depth int) error {
	if depth > maximumJSONDepth {
		return errors.New("canonical JSON exceeds maximum depth")
	}
	if !value.IsValid() {
		return nil
	}
	for value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface {
		if value.IsNil() {
			return nil
		}
		value = value.Elem()
	}
	switch value.Kind() {
	case reflect.Float32, reflect.Float64:
		number := value.Float()
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return errors.New("canonical JSON numbers must be finite")
		}
	case reflect.String:
		if len(value.String()) > maximumJSONString {
			return errors.New("canonical JSON string exceeds byte budget")
		}
	case reflect.Slice, reflect.Array:
		for index := 0; index < value.Len(); index++ {
			if err := validateCanonicalValue(value.Index(index), depth+1); err != nil {
				return err
			}
		}
	case reflect.Map:
		if value.Len() > maximumJSONMembers {
			return errors.New("canonical JSON object exceeds member budget")
		}
		iterator := value.MapRange()
		for iterator.Next() {
			if iterator.Key().Kind() != reflect.String {
				return errors.New("canonical JSON object keys must be strings")
			}
			if err := validateCanonicalValue(iterator.Value(), depth+1); err != nil {
				return err
			}
		}
	case reflect.Struct:
		for index := 0; index < value.NumField(); index++ {
			if value.Type().Field(index).PkgPath == "" {
				if err := validateCanonicalValue(value.Field(index), depth+1); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func validateDecodedJSON(value any, depth int) error {
	if depth > maximumJSONDepth {
		return errors.New("canonical JSON exceeds maximum depth")
	}
	switch typed := value.(type) {
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) ||
			(math.Trunc(typed) == typed && math.Abs(typed) > 9007199254740991) {
			return errors.New("canonical JSON number is not finite or exceeds the safe integer range")
		}
	case string:
		if len(typed) > maximumJSONString || !utf8.ValidString(typed) ||
			!norm.NFC.IsNormalString(typed) {
			return errors.New("canonical JSON string is invalid")
		}
	case []any:
		for _, entry := range typed {
			if err := validateDecodedJSON(entry, depth+1); err != nil {
				return err
			}
		}
	case map[string]any:
		if len(typed) > maximumJSONMembers {
			return errors.New("canonical JSON object exceeds member budget")
		}
		for key, entry := range typed {
			if len(key) > maximumJSONString || !utf8.ValidString(key) ||
				!norm.NFC.IsNormalString(key) || isUnsafeJSONKey(key) {
				return errors.New("canonical JSON object key is unsafe or non-canonical")
			}
			if err := validateDecodedJSON(entry, depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}

func appendCanonicalJSON(destination []byte, value any) ([]byte, error) {
	switch typed := value.(type) {
	case nil:
		return append(destination, "null"...), nil
	case bool:
		if typed {
			return append(destination, "true"...), nil
		}
		return append(destination, "false"...), nil
	case float64:
		return append(destination, javascriptNumber(typed)...), nil
	case string:
		return appendJSONString(destination, typed), nil
	case []any:
		destination = append(destination, '[')
		for index, entry := range typed {
			if index > 0 {
				destination = append(destination, ',')
			}
			var err error
			destination, err = appendCanonicalJSON(destination, entry)
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
		// UTF-8 byte order is the same as Unicode scalar-value order for valid
		// strings; it deliberately differs from UTF-16 code-unit ordering for
		// astral-plane keys in the same way as compareUnicodeCodePoints.
		sort.Strings(keys)
		destination = append(destination, '{')
		for index, key := range keys {
			if index > 0 {
				destination = append(destination, ',')
			}
			destination = appendJSONString(destination, key)
			destination = append(destination, ':')
			var err error
			destination, err = appendCanonicalJSON(destination, typed[key])
			if err != nil {
				return nil, err
			}
		}
		return append(destination, '}'), nil
	default:
		return nil, fmt.Errorf("unsupported canonical JSON value %T", value)
	}
}

func appendJSONString(destination []byte, value string) []byte {
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
				destination = append(destination, '\\', 'u', '0', '0')
				destination = strconv.AppendInt(destination, int64(character), 16)
				if character < 0x10 {
					// strconv emits one nibble; JSON requires exactly four.
					last := destination[len(destination)-1]
					destination[len(destination)-1] = '0'
					destination = append(destination, last)
				}
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

func isUnsafeJSONKey(value string) bool {
	return value == "__proto__" || value == "constructor" || value == "prototype"
}

// validateJSONObject rejects duplicate members before encoding/json can fold
// them into one value. It also applies a structural budget independent from the
// HTTP content-length header.
func validateJSONObject(body []byte) error {
	if len(body) == 0 || len(body) > maximumCandidateBytes || !utf8.Valid(body) {
		return errors.New("JSON body is empty or exceeds byte budget")
	}
	if err := validateJSONUnicodeEscapes(body); err != nil {
		return invalidJSONUnicodeEscapeError(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := validateJSONValue(decoder, 0, new(int)); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("JSON body must contain exactly one value")
	}
	return nil
}

func validateJSONValue(decoder *json.Decoder, depth int, members *int) error {
	return validateJSONValueWithin(
		decoder,
		depth,
		members,
		maximumJSONDepth,
		maximumJSONMembers,
		maximumJSONString,
	)
}

func validateJSONValueWithin(
	decoder *json.Decoder,
	depth int,
	members *int,
	maximumDepth int,
	maximumMembers int,
	maximumStringBytes int,
) error {
	if depth > maximumDepth {
		return errors.New("JSON body exceeds maximum depth")
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delim, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		if value, ok := token.(string); ok &&
			(len(value) > maximumStringBytes || !norm.NFC.IsNormalString(value)) {
			return errors.New("JSON string is non-canonical or exceeds byte budget")
		}
		return nil
	}
	switch delim {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok || len(key) > maximumStringBytes || !norm.NFC.IsNormalString(key) ||
				isUnsafeJSONKey(key) {
				return errors.New("JSON object member name is invalid")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("JSON object contains duplicate member %q", key)
			}
			seen[key] = struct{}{}
			*members++
			if *members > maximumMembers {
				return errors.New("JSON body exceeds member budget")
			}
			if err := validateJSONValueWithin(
				decoder,
				depth+1,
				members,
				maximumDepth,
				maximumMembers,
				maximumStringBytes,
			); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return errors.New("JSON object is not closed")
		}
	case '[':
		for decoder.More() {
			if err := validateJSONValueWithin(
				decoder,
				depth+1,
				members,
				maximumDepth,
				maximumMembers,
				maximumStringBytes,
			); err != nil {
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

func sortedUnique(values []string) ([]string, error) {
	result := append([]string(nil), values...)
	sort.Strings(result)
	for index := range result {
		if strings.TrimSpace(result[index]) == "" || (index > 0 && result[index] == result[index-1]) {
			return nil, errors.New("values must be non-empty and unique")
		}
	}
	return result, nil
}
