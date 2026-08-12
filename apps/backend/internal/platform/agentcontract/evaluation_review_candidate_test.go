package agentcontract

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationReviewCandidatePNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

func evaluationReviewCandidateEnvelope(t *testing.T, raster []byte) map[string]any {
	t.Helper()
	digest := func(label string) string {
		t.Helper()
		value, err := canonicaljson.Digest(map[string]any{"label": label})
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	value := map[string]any{
		"format": "prodivix.agent-evaluation-review-candidate", "version": int64(2),
		"candidateId": "review-candidate.1", "attemptId": "evaluation-attempt.1",
		"planDigest": digest("plan"), "repositoryCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"descriptorDigest": digest("descriptor"), "responseDigest": digest("response"),
		"executionReceiptDigest": digest("execution"), "graderArtifactDigest": digest("grader"),
		"projectionAuthorityDigest": digest("projection-authority"), "mediaType": "image/png",
		"width": int64(1), "height": int64(1), "bytesBase64": base64.StdEncoding.EncodeToString(raster),
		"bytesDigest": fmt.Sprintf("sha256-%x", sha256.Sum256(raster)), "byteLength": int64(len(raster)),
		"publicArtifactScanDigest": digest("public-raster-scan"), "generatedAt": "2026-08-08T00:00:00.000Z",
	}
	var err error
	value["candidateDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	return map[string]any{"wireVersion": int64(1), "factType": "evaluation-review-candidate", "value": value}
}

func evaluationReviewRasterScanValue(t *testing.T) map[string]any {
	t.Helper()
	digest := func(label string) string {
		value, err := canonicaljson.Digest(map[string]any{"label": label})
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	inspection, err := InspectEvaluationReviewRaster(evaluationReviewCandidatePNGBase64, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"format": "prodivix.agent-evaluation-review-raster-scan-receipt", "version": float64(1),
		"scanReceiptId": "review-raster-scan.1", "planDigest": digest("plan"),
		"repositoryCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "attemptId": "evaluation-attempt.1",
		"descriptorDigest": digest("descriptor"), "projectionAuthorityDigest": digest("projection-authority"),
		"mediaType": "image/png", "width": float64(inspection.Width), "height": float64(inspection.Height),
		"byteLength": float64(inspection.ByteLength), "policyDigest": digest("raster-scan-policy"),
		"bytesDigest": inspection.BytesDigest, "decodedPixelDigest": inspection.DecodedPixelDigest,
		"metadataProfileDigest": digest("raster-metadata-profile"), "canarySetDigest": digest("canary-set"),
		"fingerprintSetDigest": digest("fingerprint-set"), "findingDigests": []any{}, "verdict": "safe",
		"scannedAt": "2026-08-08T00:00:00.000Z",
	}
	recomputeEvaluationReviewRasterScanDigest(t, value)
	return value
}

func recomputeEvaluationReviewRasterScanDigest(t *testing.T, value map[string]any) {
	t.Helper()
	delete(value, "receiptDigest")
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["receiptDigest"] = digest
}

func encodeEvaluationReviewCandidate(t *testing.T, envelope map[string]any) []byte {
	t.Helper()
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func recomputeEvaluationReviewCandidateDigest(t *testing.T, envelope map[string]any) {
	t.Helper()
	value := envelope["value"].(map[string]any)
	delete(value, "candidateDigest")
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["candidateDigest"] = digest
}

func evaluationPNGWithTextCanary(t *testing.T, raster []byte) []byte {
	t.Helper()
	if len(raster) < 12 || string(raster[len(raster)-8:len(raster)-4]) != "IEND" {
		t.Fatal("fixture PNG does not end in IEND")
	}
	data := []byte("Comment\x00protected-holdout-canary")
	chunk := make([]byte, 12+len(data))
	binary.BigEndian.PutUint32(chunk[:4], uint32(len(data)))
	copy(chunk[4:8], "tEXt")
	copy(chunk[8:8+len(data)], data)
	binary.BigEndian.PutUint32(chunk[8+len(data):], crc32.ChecksumIEEE(chunk[4:8+len(data)]))
	result := make([]byte, 0, len(raster)+len(chunk))
	result = append(result, raster[:len(raster)-12]...)
	result = append(result, chunk...)
	return append(result, raster[len(raster)-12:]...)
}

func TestAgentEvaluationReviewCandidateAcceptsExactBoundedRaster(t *testing.T) {
	raster, err := base64.StdEncoding.DecodeString(evaluationReviewCandidatePNGBase64)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateEvaluationFact(encodeEvaluationReviewCandidate(t, evaluationReviewCandidateEnvelope(t, raster))); err != nil {
		t.Fatalf("valid raster-only review candidate was rejected: %v", err)
	}
}

func TestAgentEvaluationReviewCandidateRejectsTextAndSubmissionMembers(t *testing.T) {
	raster, _ := base64.StdEncoding.DecodeString(evaluationReviewCandidatePNGBase64)
	for _, field := range []string{
		"text", "submission", "rawResponse", "targetRefs", "sourceRefs", "actionIds", "context",
	} {
		t.Run(field, func(t *testing.T) {
			envelope := evaluationReviewCandidateEnvelope(t, raster)
			envelope["value"].(map[string]any)[field] = "protected response material"
			recomputeEvaluationReviewCandidateDigest(t, envelope)
			if err := ValidateEvaluationFact(encodeEvaluationReviewCandidate(t, envelope)); err == nil {
				t.Fatalf("candidate member %q must fail closed", field)
			}
		})
	}
}

func TestAgentEvaluationReviewCandidateRejectsPNGTextCanary(t *testing.T) {
	raster, _ := base64.StdEncoding.DecodeString(evaluationReviewCandidatePNGBase64)
	canaryRaster := evaluationPNGWithTextCanary(t, raster)
	envelope := evaluationReviewCandidateEnvelope(t, canaryRaster)
	if err := ValidateEvaluationFact(encodeEvaluationReviewCandidate(t, envelope)); err == nil {
		t.Fatal("PNG tEXt canary chunk must fail closed")
	}
}

func TestAgentEvaluationReviewCandidateRejectsByteAndDimensionDrift(t *testing.T) {
	raster, _ := base64.StdEncoding.DecodeString(evaluationReviewCandidatePNGBase64)
	for name, mutate := range map[string]func(map[string]any){
		"bytes-digest": func(value map[string]any) {
			value["bytesDigest"], _ = canonicaljson.Digest(map[string]any{"forged": true})
		},
		"byte-length": func(value map[string]any) { value["byteLength"] = int64(len(raster) + 1) },
		"width":       func(value map[string]any) { value["width"] = int64(2) },
	} {
		t.Run(name, func(t *testing.T) {
			envelope := evaluationReviewCandidateEnvelope(t, raster)
			mutate(envelope["value"].(map[string]any))
			recomputeEvaluationReviewCandidateDigest(t, envelope)
			if err := ValidateEvaluationFact(encodeEvaluationReviewCandidate(t, envelope)); err == nil {
				t.Fatalf("review candidate %s drift must fail closed", name)
			}
		})
	}
}

func TestAgentEvaluationReviewRasterScanReceiptEnforcesExactSafeVerdict(t *testing.T) {
	if err := validateAgentEvaluationReviewRasterScanReceipt(evaluationReviewRasterScanValue(t)); err != nil {
		t.Fatalf("exact safe raster scan receipt was rejected: %v", err)
	}
	blocked := evaluationReviewRasterScanValue(t)
	blocked["findingDigests"] = []any{blocked["bytesDigest"]}
	blocked["verdict"] = "blocked"
	recomputeEvaluationReviewRasterScanDigest(t, blocked)
	if err := validateAgentEvaluationReviewRasterScanReceipt(blocked); err != nil {
		t.Fatalf("canonical blocked raster scan receipt was rejected: %v", err)
	}
	for name, mutate := range map[string]func(map[string]any){
		"extra-submission": func(value map[string]any) {
			value["submission"] = "protected material"
		},
		"safe-with-finding": func(value map[string]any) {
			value["findingDigests"] = []any{value["bytesDigest"]}
			recomputeEvaluationReviewRasterScanDigest(t, value)
		},
		"unsorted-findings": func(value map[string]any) {
			value["findingDigests"] = []any{
				"sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
				"sha256-0000000000000000000000000000000000000000000000000000000000000000",
			}
			value["verdict"] = "blocked"
			recomputeEvaluationReviewRasterScanDigest(t, value)
		},
		"receipt-digest": func(value map[string]any) {
			value["receiptDigest"] = value["policyDigest"]
		},
	} {
		t.Run(name, func(t *testing.T) {
			value := evaluationReviewRasterScanValue(t)
			mutate(value)
			if err := validateAgentEvaluationReviewRasterScanReceipt(value); err == nil {
				t.Fatalf("raster scan %s drift must fail closed", name)
			}
		})
	}
}
