package verification

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"strings"
	"unicode/utf8"

	verificationcontract "github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

const (
	maximumImageDimension         = 8_192
	maximumImageStructuralEntries = 4_096
)

type ValidatedArtifact struct {
	Candidate        CandidateArtifact
	StagingLocator   string
	NormalizedDigest string
}

type ArtifactValidator struct {
	candidate *CandidateValidator
}

func NewArtifactValidator(candidate *CandidateValidator) *ArtifactValidator {
	if candidate == nil {
		candidate = NewCandidateValidator(nil)
	}
	return &ArtifactValidator{candidate: candidate}
}

func (validator *ArtifactValidator) ValidateForCandidate(
	ctx context.Context,
	store ArtifactObjectStore,
	candidate *EvidenceCandidate,
	artifact CandidateArtifact,
	stagingLocator string,
) (ValidatedArtifact, error) {
	if err := validator.PreflightForCandidate(candidate, artifact); err != nil {
		return ValidatedArtifact{}, err
	}
	return validator.validateArtifactBody(ctx, store, artifact, stagingLocator)
}

func (validator *ArtifactValidator) PreflightForCandidate(
	candidate *EvidenceCandidate,
	artifact CandidateArtifact,
) error {
	if candidate == nil ||
		validateArtifactTargetPolicy(
			candidate.Redaction.TargetPolicy,
			candidate.PolicyDigest,
			candidate.TargetID,
		) != nil {
		return coded(
			"VER-5005",
			"Artifact target policy is missing or inconsistent.",
			ErrArtifactRejected,
		)
	}
	if artifact.SourceTraceDigest != "" {
		sourceTraces, err := normalizeSourceTraceSet(candidate.SourceTraces)
		if err != nil ||
			sourceTraces.digest != candidate.SourceTraceDigest {
			return coded(
				"VER-5005",
				"Artifact source trace authority is missing or inconsistent.",
				ErrArtifactRejected,
			)
		}
		if _, exists := sourceTraces.traceDigests[artifact.SourceTraceDigest]; !exists {
			return coded(
				"VER-5005",
				"Artifact source trace does not identify a candidate source trace.",
				ErrArtifactRejected,
			)
		}
	}
	if candidate.Redaction.TargetPolicy.Capture == "forbidden-sensitive" &&
		(artifact.Kind == ArtifactScreenshot ||
			artifact.Kind == ArtifactVisualDiff ||
			artifact.ExpectedMediaType == "image/png" ||
			artifact.ExpectedMediaType == "image/jpeg") {
		return coded(
			"VER-5005",
			"Sensitive semantic targets cannot produce image Evidence artifacts.",
			ErrArtifactRejected,
		)
	}
	return nil
}

func (validator *ArtifactValidator) validateArtifactBody(
	ctx context.Context,
	store ArtifactObjectStore,
	artifact CandidateArtifact,
	stagingLocator string,
) (ValidatedArtifact, error) {
	source, err := store.OpenStaging(ctx, stagingLocator)
	if err != nil {
		return ValidatedArtifact{}, err
	}
	body, readErr := io.ReadAll(io.LimitReader(source, artifact.ExpectedSize+1))
	closeErr := source.Close()
	if readErr != nil {
		return ValidatedArtifact{}, readErr
	}
	if closeErr != nil {
		return ValidatedArtifact{}, closeErr
	}
	if int64(len(body)) != artifact.ExpectedSize || digestBytes(body) != artifact.ExpectedDigest {
		return ValidatedArtifact{}, coded("VER-5001", "Artifact bytes do not match their declared identity.", ErrArtifactRejected)
	}
	normalizedDigest := artifact.ExpectedDigest
	switch {
	case isArtifactJSONMediaType(artifact.ExpectedMediaType):
		if err := validator.validateTextualArtifactSafety(body); err != nil {
			return ValidatedArtifact{}, err
		}
		if err := validateArtifactJSONObject(body); err != nil {
			return ValidatedArtifact{}, coded("VER-5001", "JSON artifact is not strict bounded JSON.", ErrArtifactRejected)
		}
		if err := verificationcontract.ValidateEvidenceTransport(
			"verification-artifact-envelope",
			json.RawMessage(body),
		); err != nil {
			return ValidatedArtifact{}, coded(
				"VER-5005",
				"JSON artifact does not match the canonical generated schema.",
				ErrArtifactRejected,
			)
		}
		var value any
		if err := json.Unmarshal(body, &value); err != nil {
			return ValidatedArtifact{}, coded("VER-5001", "JSON artifact is malformed.", ErrArtifactRejected)
		}
		if err := validateArtifactJSONSchema(artifact, value); err != nil {
			return ValidatedArtifact{}, coded(
				"VER-5005",
				"JSON artifact does not match its bounded class schema.",
				ErrArtifactRejected,
			)
		}
		digest, _, err := canonicalDigest(value)
		if err != nil {
			return ValidatedArtifact{}, coded("VER-5001", "JSON artifact cannot be canonicalized.", ErrArtifactRejected)
		}
		normalizedDigest = digest
	case artifact.ExpectedMediaType == "text/plain":
		if err := validator.validateTextualArtifactSafety(body); err != nil {
			return ValidatedArtifact{}, err
		}
		if !utf8.Valid(body) || bytes.ContainsRune(body, '\x00') ||
			(sniffedMediaType(body) != "text/plain" && len(body) > 0) {
			return ValidatedArtifact{}, coded("VER-5005", "Text artifact is not safe UTF-8 text.", ErrArtifactRejected)
		}
	case artifact.ExpectedMediaType == "image/png":
		if !strictPNG(body) || validateImage(body, "png") != nil {
			return ValidatedArtifact{}, coded("VER-5005", "PNG artifact fails structural or metadata policy.", ErrArtifactRejected)
		}
	case artifact.ExpectedMediaType == "image/jpeg":
		if !strictJPEG(body) || validateImage(body, "jpeg") != nil {
			return ValidatedArtifact{}, coded("VER-5005", "JPEG artifact fails structural or metadata policy.", ErrArtifactRejected)
		}
	default:
		return ValidatedArtifact{}, coded("VER-5005", "Artifact media type is unsupported.", ErrArtifactRejected)
	}
	return ValidatedArtifact{
		Candidate: artifact, StagingLocator: stagingLocator, NormalizedDigest: normalizedDigest,
	}, nil
}

func (validator *ArtifactValidator) validateTextualArtifactSafety(body []byte) error {
	if containsArchiveOrActiveMagic(body) {
		return coded(
			"VER-5005",
			"Active content and archives are not accepted as Evidence artifacts.",
			ErrArtifactRejected,
		)
	}
	if validator.candidate.containsSensitiveText(body) {
		return coded(
			"VER-5002",
			"Artifact contains Secret, credential, or PII material.",
			ErrArtifactRejected,
		)
	}
	return nil
}

func validateArtifactTargetPolicy(
	policy TargetPolicy,
	expectedPolicyDigest string,
	expectedTargetID string,
) error {
	if policy.Authority != "verification-policy" ||
		policy.PolicyDigest != expectedPolicyDigest ||
		policy.SemanticTargetID != expectedTargetID ||
		!digestPattern.MatchString(policy.PolicyDigest) ||
		validateIdentifier(policy.SemanticTargetID, "targetPolicy.semanticTargetId") != nil {
		return errors.New("artifact target policy identity is invalid")
	}
	switch policy.Capture {
	case "allowed", "masked", "forbidden-sensitive":
		return nil
	default:
		return errors.New("artifact target capture policy is invalid")
	}
}

func artifactTargetPolicyDigest(policy TargetPolicy) (string, error) {
	if err := validateArtifactTargetPolicy(
		policy,
		policy.PolicyDigest,
		policy.SemanticTargetID,
	); err != nil {
		return "", err
	}
	digest, _, err := canonicalDigest(policy)
	return digest, err
}

func containsArchiveOrActiveMagic(body []byte) bool {
	magics := [][]byte{
		{0x50, 0x4b, 0x03, 0x04}, {0x50, 0x4b, 0x05, 0x06},
		{0x50, 0x4b, 0x07, 0x08}, {0x1f, 0x8b}, []byte("BZh"),
		{0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00}, []byte("Rar!\x1a\x07"),
		[]byte("7z\xbc\xaf\x27\x1c"), {0x28, 0xb5, 0x2f, 0xfd},
		[]byte("%PDF-"), {0x00, 0x61, 0x73, 0x6d},
	}
	for _, magic := range magics {
		if bytes.HasPrefix(body, magic) {
			return true
		}
	}
	if len(body) >= 262 && bytes.Equal(body[257:262], []byte("ustar")) {
		return true
	}
	lower := strings.ToLower(string(body[:min(len(body), 4096)]))
	trimmed := strings.TrimSpace(lower)
	activePrefix := strings.HasPrefix(trimmed, `"use strict"`) ||
		strings.HasPrefix(trimmed, "import ") ||
		strings.HasPrefix(trimmed, "export ") ||
		strings.HasPrefix(trimmed, "function ") ||
		strings.HasPrefix(trimmed, "const ") ||
		strings.HasPrefix(trimmed, "let ") ||
		strings.HasPrefix(trimmed, "var ")
	return activePrefix || strings.Contains(lower, "<!doctype html") ||
		strings.Contains(lower, "<html") || strings.Contains(lower, "<script") ||
		strings.Contains(lower, "<svg") || strings.Contains(lower, "<?xml") ||
		strings.Contains(lower, "javascript:")
}

func validateImage(body []byte, expectedFormat string) error {
	var (
		config image.Config
		raster image.Image
		err    error
	)
	switch expectedFormat {
	case "png":
		config, err = png.DecodeConfig(bytes.NewReader(body))
	case "jpeg":
		config, err = jpeg.DecodeConfig(bytes.NewReader(body))
	default:
		return errors.New("unsupported image format")
	}
	if err != nil {
		return errors.New("invalid image configuration")
	}
	if err := validateRasterBounds(config.Width, config.Height); err != nil {
		return err
	}
	switch expectedFormat {
	case "png":
		raster, err = png.Decode(bytes.NewReader(body))
	case "jpeg":
		raster, err = jpeg.Decode(bytes.NewReader(body))
	}
	if err != nil {
		return errors.New("image cannot be decoded")
	}
	width, height := raster.Bounds().Dx(), raster.Bounds().Dy()
	if width != config.Width || height != config.Height {
		return errors.New("decoded image dimensions changed")
	}
	if err := validateRasterBounds(width, height); err != nil {
		return err
	}
	return nil
}

func validateRasterBounds(width int, height int) error {
	if width <= 0 || height <= 0 ||
		width > maximumImageDimension || height > maximumImageDimension {
		return errors.New("image dimensions exceed budget")
	}
	if int64(width) > maximumImagePixels/int64(height) {
		return errors.New("image pixel budget exceeded")
	}
	return nil
}

func strictPNG(body []byte) bool {
	signature := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	if !bytes.HasPrefix(body, signature) {
		return false
	}
	offset := len(signature)
	entries := 0
	seenIHDR, seenPLTE, seenTRNS, seenIDAT := false, false, false, false
	idatEnded := false
	for offset < len(body) {
		if offset+12 > len(body) {
			return false
		}
		length := uint64(binary.BigEndian.Uint32(body[offset : offset+4]))
		end := uint64(offset) + 12 + length
		if end > uint64(len(body)) {
			return false
		}
		entries++
		if entries > maximumImageStructuralEntries {
			return false
		}
		chunkType := string(body[offset+4 : offset+8])
		switch chunkType {
		case "IHDR":
			if seenIHDR || offset != len(signature) || length != 13 {
				return false
			}
			seenIHDR = true
		case "PLTE":
			if !seenIHDR || seenPLTE || seenIDAT ||
				length == 0 || length > 768 || length%3 != 0 {
				return false
			}
			seenPLTE = true
		case "tRNS":
			if !seenIHDR || seenTRNS || seenIDAT {
				return false
			}
			seenTRNS = true
		case "IDAT":
			if !seenIHDR || idatEnded {
				return false
			}
			seenIDAT = true
		case "IEND":
			if !seenIDAT || length != 0 || end != uint64(len(body)) {
				return false
			}
			return true
		default:
			// Reject all ancillary chunks (including text, profiles and EXIF)
			// and unknown critical chunks. Evidence screenshots are normalized
			// at the adapter boundary before reaching this store.
			return false
		}
		if seenIDAT && chunkType != "IDAT" {
			idatEnded = true
		}
		offset = int(end)
	}
	return false
}

func strictJPEG(body []byte) bool {
	if len(body) < 4 || body[0] != 0xff || body[1] != 0xd8 ||
		body[len(body)-2] != 0xff || body[len(body)-1] != 0xd9 {
		return false
	}
	offset, entries := 2, 0
	inScan, seenFrame, seenScan := false, false, false
	for offset < len(body) {
		marker, next, ok := nextJPEGMarker(body, offset, inScan)
		if !ok {
			return false
		}
		offset = next
		entries++
		if entries > maximumImageStructuralEntries {
			return false
		}
		if marker >= 0xd0 && marker <= 0xd7 {
			if !inScan {
				return false
			}
			continue
		}
		if marker == 0xd9 {
			return seenFrame && seenScan && offset == len(body)
		}
		if marker == 0xd8 || marker == 0x01 ||
			(marker >= 0xe0 && marker <= 0xef) || marker == 0xfe {
			return false
		}
		if offset+2 > len(body) {
			return false
		}
		length := int(binary.BigEndian.Uint16(body[offset : offset+2]))
		if length < 2 || offset+length > len(body) {
			return false
		}
		switch marker {
		case 0xc0, 0xc2:
			if seenFrame {
				return false
			}
			seenFrame = true
		case 0xc4, 0xdb, 0xdd:
		case 0xda:
			if !seenFrame {
				return false
			}
			seenScan = true
		default:
			return false
		}
		offset += length
		inScan = marker == 0xda
	}
	return false
}

func nextJPEGMarker(body []byte, offset int, inScan bool) (byte, int, bool) {
	for offset < len(body) {
		if !inScan && body[offset] != 0xff {
			return 0, 0, false
		}
		if inScan && body[offset] != 0xff {
			offset++
			continue
		}
		offset++
		for offset < len(body) && body[offset] == 0xff {
			offset++
		}
		if offset >= len(body) {
			return 0, 0, false
		}
		marker := body[offset]
		offset++
		if inScan && marker == 0x00 {
			continue
		}
		if !inScan && marker == 0x00 {
			return 0, 0, false
		}
		return marker, offset, true
	}
	return 0, 0, false
}

func validateUploadedMedia(body []byte, expected string) error {
	if isArtifactJSONMediaType(expected) {
		if err := validateArtifactJSONObject(body); err != nil {
			return fmt.Errorf("invalid JSON")
		}
		return nil
	}
	if expected == "text/plain" {
		if !utf8.Valid(body) {
			return fmt.Errorf("invalid UTF-8")
		}
		return nil
	}
	if sniffedMediaType(body) != expected {
		return fmt.Errorf("media type mismatch")
	}
	return nil
}
