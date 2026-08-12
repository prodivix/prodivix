package agent

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumEvaluationArchiveClosureBytes = 25_296_896
	maximumEvaluationArchiveIndexBytes   = 8 * 1_024 * 1_024
	maximumEvaluationArchiveRootBytes    = 1 * 1_024 * 1_024
	maximumEvaluationArchiveShards       = int64(4_096)
)

type EvaluationArchiveClosureRecord struct {
	NamespaceID                   string
	Partition                     EvaluationPlanPartition
	ExportLeaseID                 string
	ExportLeaseDigest             string
	RunConfigArtifactBinding      EvaluationProductionRunConfigArtifactBinding
	RunConfigArtifactBindingBytes []byte
	SourceConfigDigest            string
	FrozenRunDigest               string
	EvidenceSetDigest             string
	AuthorityPayloadDigest        string
	AuthorityAttestationDigest    string
	ReviewLeaseDigest             string
	EvaluationManifestDigest      string
	IndexDigest                   string
	ArchiveAttestationDigest      string
	RootDigest                    string
	ClosureDigest                 string
	ClosureBytes                  []byte
	RecordedAt                    time.Time
}

type evaluationArchiveFamilySummary struct {
	Family          string
	FamilyIndex     int64
	RecordCount     int64
	SemanticDigest  string
	RecordSetDigest string
	ShardCount      int64
	FirstOrderKey   *string
	LastOrderKey    *string
}

type evaluationArchiveShardDescriptor struct {
	Sequence         int64
	Family           string
	FamilyShardIndex int64
	FirstRecordIndex int64
	LastRecordIndex  int64
	FirstOrderKey    string
	LastOrderKey     string
	RecordCount      int64
	ByteSize         int64
	BytesDigest      string
	RecordSetDigest  string
	DescriptorDigest string
	Value            map[string]any
}

type evaluationArchiveIndex struct {
	ExportLeaseID                 string
	ExportLeaseDigest             string
	RunConfigArtifactBinding      EvaluationProductionRunConfigArtifactBinding
	RunConfigArtifactBindingBytes []byte
	SourceConfigDigest            string
	FrozenRunDigest               string
	PlanDigest                    string
	RepositoryCommit              string
	EvidenceSetDigest             string
	BundleDigest                  string
	AuthorityPayloadDigest        string
	AuthorityAttestationDigest    string
	AuthorityRoots                EvaluationEvidenceArchiveAuthorityRoots
	AuthorityRootsValue           map[string]any
	ReviewLeaseDigest             string
	EvaluationManifestDigest      string
	Families                      []evaluationArchiveFamilySummary
	Shards                        []evaluationArchiveShardDescriptor
	ShardSetDigest                string
	TotalShardBytes               int64
	TotalRecordCount              int64
	CreatedAt                     time.Time
	IndexDigest                   string
	Value                         map[string]any
	Canonical                     []byte
}

type evaluationArchiveAttestation struct {
	AuthorityID                   string
	KeyID                         string
	ExportLeaseID                 string
	ExportLeaseDigest             string
	RunConfigArtifactBinding      EvaluationProductionRunConfigArtifactBinding
	RunConfigArtifactBindingBytes []byte
	SourceConfigDigest            string
	FrozenRunDigest               string
	PlanDigest                    string
	RepositoryCommit              string
	EvidenceSetDigest             string
	BundleDigest                  string
	AuthorityPayloadDigest        string
	AuthorityAttestationDigest    string
	AuthorityRoots                EvaluationEvidenceArchiveAuthorityRoots
	AuthorityRootsValue           map[string]any
	ReviewLeaseDigest             string
	EvaluationManifestDigest      string
	IndexDigest                   string
	EvidenceIndexArtifactDigest   string
	EvidenceIndexArtifactSize     int64
	ShardSetDigest                string
	TotalShardBytes               int64
	TotalRecordCount              int64
	IssuedAt                      time.Time
	AttestedPayloadDigest         string
	AttestedPayloadBytes          []byte
	Signature                     string
	AttestationDigest             string
	Value                         map[string]any
	Canonical                     []byte
}

type evaluationArchiveRoot struct {
	RootID                        string
	ExportLeaseID                 string
	ExportLeaseDigest             string
	RunConfigArtifactBinding      EvaluationProductionRunConfigArtifactBinding
	RunConfigArtifactBindingBytes []byte
	SourceConfigDigest            string
	FrozenRunDigest               string
	PlanDigest                    string
	RepositoryCommit              string
	EvidenceSetDigest             string
	BundleDigest                  string
	AuthorityPayloadDigest        string
	AuthorityAttestationDigest    string
	AuthorityRoots                EvaluationEvidenceArchiveAuthorityRoots
	AuthorityRootsValue           map[string]any
	ReviewLeaseDigest             string
	EvaluationManifestDigest      string
	IndexDigest                   string
	EvidenceIndexArtifactDigest   string
	EvidenceIndexArtifactSize     int64
	ShardSetDigest                string
	TotalShardBytes               int64
	TotalRecordCount              int64
	ArchiveAttestationDigest      string
	RecordedAt                    time.Time
	RootDigest                    string
	Value                         map[string]any
	Canonical                     []byte
}

type evaluationArchiveClosure struct {
	EvaluationArchiveClosureRecord
	Index       evaluationArchiveIndex
	Attestation evaluationArchiveAttestation
	Root        evaluationArchiveRoot
	Value       map[string]any
}

func evaluationArchiveBoundedText(value any, maximum int) (string, bool) {
	text, ok := value.(string)
	if !ok || text == "" || text != strings.TrimSpace(text) || !utf8.ValidString(text) ||
		len(utf16.Encode([]rune(text))) > maximum {
		return "", false
	}
	for _, character := range text {
		if character <= 0x1f || character == 0x7f {
			return "", false
		}
	}
	return text, true
}

func evaluationArchiveInstant(value any) (time.Time, bool) {
	text, ok := value.(string)
	if !ok || len(text) < 20 || len(text) > 32 {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, text)
	return parsed, err == nil && evaluationExportInstant(parsed) == text
}

func evaluationArchiveInteger(value any, minimum, maximum int64) (int64, bool) {
	integer, ok := integerMember(map[string]any{"value": value}, "value")
	return integer, ok && integer >= minimum && integer <= maximum
}

func evaluationArchiveCanonicalMap(value any, maximum int) (map[string]any, []byte, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, nil, invalid("evaluation archive value is not an object")
	}
	canonical, err := canonicaljson.Bytes(object)
	if err != nil || len(canonical) < 1 || len(canonical) > maximum {
		return nil, nil, invalid("evaluation archive object exceeds its canonical limit")
	}
	return object, canonical, nil
}

func decodeEvaluationArchiveAuthorityRoots(value any) (EvaluationEvidenceArchiveAuthorityRoots, map[string]any, error) {
	object, _, err := evaluationArchiveCanonicalMap(value, 65_536)
	if err != nil || !exactEvaluationKeys(object, []string{
		"capabilityProbeAdmissionSetDigest", "capabilityProbeReferenceReceiptSetDigest",
		"runtimeFactSourceOwnerRegistrationSetDigest", "capabilityProbeProviderResourceCleanupSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest",
		"hostedRetrievalRuntimeResourceCleanupSetDigest", "capabilityEffectProviderRuntimeJournalSetDigest",
		"optionalCapabilityFactSourceSetDigest",
		"optionalCapabilityFactAuthoritySetDigest",
		"endpointSmokeSetDigest", "endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest",
		"endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest",
		"endpointSmokeValidationFailureReceiptSetDigest", "preDispatchFailureReceiptSetDigest",
		"transportDispatchIntentSetDigest", "transportReceiptSetDigest", "providerResultSpoolReceiptSetDigest",
		"providerResultSpoolDispositionReceiptSetDigest", "invocationTurnReceiptSetDigest",
		"invocationTurnSetReceiptSetDigest", "resultSubmissionReceiptSetDigest", "attemptAuthorityOwnerReceiptSetDigest",
		"controlledRuntimeReceiptSetDigest", "capabilityExecutionReceiptSetDigest", "capabilitySpecificReceiptSetDigest",
		"providerCapabilityObservationReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "validatedHumanReviewArtifactSetDigest",
		"validatedHumanMetricObservationSetDigest", "reviewRasterScanReceiptSetDigest", "reviewCandidateRefSetDigest",
		"blindReviewMappingSetDigest", "sourceReceiptSetDigest", "executionReceiptSetDigest",
		"holdoutExecutionReceiptDigest", "secretCanarySetDigest", "protectedHoldoutCanarySetDigest",
	}, "reviewLeaseDigest") {
		return EvaluationEvidenceArchiveAuthorityRoots{}, nil, invalid("evaluation archive authority roots shape is invalid")
	}
	canonical, err := canonicaljson.Bytes(object)
	if err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, nil, err
	}
	var roots EvaluationEvidenceArchiveAuthorityRoots
	if err := json.Unmarshal(canonical, &roots); err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, nil, invalid("evaluation archive authority roots are invalid")
	}
	for _, digest := range evaluationArchiveAuthorityRootDigests(roots) {
		if !evaluationDigestPattern.MatchString(digest) {
			return EvaluationEvidenceArchiveAuthorityRoots{}, nil, invalid("evaluation archive authority root digest is invalid")
		}
	}
	if roots.ReviewLeaseDigest != "" && !evaluationDigestPattern.MatchString(roots.ReviewLeaseDigest) {
		return EvaluationEvidenceArchiveAuthorityRoots{}, nil, invalid("evaluation archive review lease root is invalid")
	}
	return roots, object, nil
}

func evaluationArchiveSingletonFamily(family string) bool {
	switch family {
	case "plan", "budgetLedger", "metricReport", "graderReport", "humanReviewReport",
		"holdoutExecutionReceipt", "authorityAttestation", "manifest":
		return true
	default:
		return false
	}
}

func decodeEvaluationArchiveFamilies(value any) ([]evaluationArchiveFamilySummary, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) != len(evaluationEvidenceExportFamilies) {
		return nil, invalid("evaluation archive family catalog is invalid")
	}
	result := make([]evaluationArchiveFamilySummary, len(raw))
	for index, entry := range raw {
		object, _, err := evaluationArchiveCanonicalMap(entry, 32_768)
		if err != nil || !exactEvaluationKeys(object, []string{
			"family", "familyIndex", "recordCount", "semanticDigest", "recordSetDigest", "shardCount",
			"firstOrderKey", "lastOrderKey",
		}) {
			return nil, invalid("evaluation archive family summary shape is invalid")
		}
		family, ok := object["family"].(string)
		familyIndex, indexOK := evaluationArchiveInteger(object["familyIndex"], 0, int64(len(raw)-1))
		recordCount, countOK := evaluationArchiveInteger(object["recordCount"], 0, maximumEvaluationExportRecords)
		shardCount, shardOK := evaluationArchiveInteger(object["shardCount"], 0, maximumEvaluationArchiveShards)
		semanticDigest, semanticOK := object["semanticDigest"].(string)
		recordSetDigest, recordSetOK := object["recordSetDigest"].(string)
		if !ok || !indexOK || familyIndex != int64(index) || family != evaluationEvidenceExportFamilies[index] ||
			!countOK || !shardOK || !semanticOK || !recordSetOK ||
			!evaluationDigestPattern.MatchString(semanticDigest) || !evaluationDigestPattern.MatchString(recordSetDigest) {
			return nil, invalid("evaluation archive family summary is invalid")
		}
		var first, last *string
		if recordCount == 0 {
			if shardCount != 0 || object["firstOrderKey"] != nil || object["lastOrderKey"] != nil {
				return nil, invalid("empty evaluation archive family summary drifted")
			}
		} else {
			firstValue, firstOK := evaluationArchiveBoundedText(object["firstOrderKey"], 8_192)
			lastValue, lastOK := evaluationArchiveBoundedText(object["lastOrderKey"], 8_192)
			if shardCount < 1 || !firstOK || !lastOK || compareEvaluationArchiveText(firstValue, lastValue) > 0 {
				return nil, invalid("evaluation archive family order range is invalid")
			}
			first, last = &firstValue, &lastValue
		}
		if evaluationArchiveSingletonFamily(family) && (recordCount != 1 || shardCount != 1) {
			return nil, invalid("evaluation archive singleton family cardinality is invalid")
		}
		if family == "providerCapabilityObservationReceipts" &&
			validateEvaluationProviderCapabilityObservationCapacity(recordCount, 0) != nil {
			return nil, invalid("evaluation archive provider capability observation count exceeds its capacity")
		}
		if family == "hostedRetrievalRuntimeResourceCleanups" &&
			validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(recordCount, 0) != nil {
			return nil, invalid("evaluation archive hosted retrieval runtime resource cleanup count is invalid")
		}
		if family == "hostedRetrievalRuntimeResourceLifecycleJournals" &&
			validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(recordCount, 0) != nil {
			return nil, invalid("evaluation archive hosted retrieval runtime resource lifecycle journal count is invalid")
		}
		if family == "capabilityEffectProviderRuntimeJournals" &&
			validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(recordCount, 0) != nil {
			return nil, invalid("evaluation archive capability effect Provider-runtime journal count exceeds its capacity")
		}
		result[index] = evaluationArchiveFamilySummary{
			Family: family, FamilyIndex: familyIndex, RecordCount: recordCount, SemanticDigest: semanticDigest,
			RecordSetDigest: recordSetDigest, ShardCount: shardCount, FirstOrderKey: first, LastOrderKey: last,
		}
	}
	return result, nil
}

func compareEvaluationArchiveText(left, right string) int {
	leftRunes, rightRunes := []rune(left), []rune(right)
	limit := len(leftRunes)
	if len(rightRunes) < limit {
		limit = len(rightRunes)
	}
	for index := 0; index < limit; index++ {
		if leftRunes[index] < rightRunes[index] {
			return -1
		}
		if leftRunes[index] > rightRunes[index] {
			return 1
		}
	}
	if len(leftRunes) < len(rightRunes) {
		return -1
	}
	if len(leftRunes) > len(rightRunes) {
		return 1
	}
	return 0
}

func decodeEvaluationArchiveShards(value any, families []evaluationArchiveFamilySummary) ([]evaluationArchiveShardDescriptor, int64, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > int(maximumEvaluationArchiveShards) {
		return nil, 0, invalid("evaluation archive shard catalog is invalid")
	}
	result := make([]evaluationArchiveShardDescriptor, len(raw))
	var totalBytes int64
	for index, entry := range raw {
		object, _, err := evaluationArchiveCanonicalMap(entry, 32_768)
		if err != nil || !exactEvaluationKeys(object, []string{
			"sequence", "family", "familyShardIndex", "fileName", "firstRecordIndex", "lastRecordIndex",
			"firstOrderKey", "lastOrderKey", "recordCount", "byteSize", "bytesDigest", "recordSetDigest", "descriptorDigest",
		}) {
			return nil, 0, invalid("evaluation archive shard descriptor shape is invalid")
		}
		sequence, sequenceOK := evaluationArchiveInteger(object["sequence"], 0, maximumEvaluationArchiveShards-1)
		family, familyOK := object["family"].(string)
		familyIndex, knownFamily := evaluationExportFamilyIndex(family)
		familyShardIndex, familyShardOK := evaluationArchiveInteger(object["familyShardIndex"], 0, maximumEvaluationArchiveShards-1)
		firstRecordIndex, firstIndexOK := evaluationArchiveInteger(object["firstRecordIndex"], 0, maximumEvaluationExportRecords-1)
		lastRecordIndex, lastIndexOK := evaluationArchiveInteger(object["lastRecordIndex"], 0, maximumEvaluationExportRecords-1)
		recordCount, countOK := evaluationArchiveInteger(object["recordCount"], 1, maximumEvaluationExportRecords)
		byteSize, bytesOK := evaluationArchiveInteger(object["byteSize"], 1, maximumEvaluationExportPageBytes)
		firstOrderKey, firstOK := evaluationArchiveBoundedText(object["firstOrderKey"], 8_192)
		lastOrderKey, lastOK := evaluationArchiveBoundedText(object["lastOrderKey"], 8_192)
		fileName, fileOK := evaluationArchiveBoundedText(object["fileName"], 128)
		bytesDigest, bytesDigestOK := object["bytesDigest"].(string)
		recordSetDigest, setOK := object["recordSetDigest"].(string)
		descriptorDigest, descriptorOK := object["descriptorDigest"].(string)
		if !sequenceOK || sequence != int64(index) || !familyOK || !knownFamily || familyIndex < 0 ||
			!familyShardOK || !firstIndexOK || !lastIndexOK || !countOK || !bytesOK || !firstOK || !lastOK || !fileOK ||
			!bytesDigestOK || !setOK || !descriptorOK || !evaluationDigestPattern.MatchString(bytesDigest) ||
			!evaluationDigestPattern.MatchString(recordSetDigest) || !evaluationDigestPattern.MatchString(descriptorDigest) ||
			lastRecordIndex != firstRecordIndex+recordCount-1 || compareEvaluationArchiveText(firstOrderKey, lastOrderKey) > 0 ||
			fileName != fmt.Sprintf("%06d-%s.ndjson", sequence, bytesDigest) {
			return nil, 0, invalid("evaluation archive shard descriptor is invalid")
		}
		base := make(map[string]any, len(object)-1)
		for key, entryValue := range object {
			if key != "descriptorDigest" {
				base[key] = entryValue
			}
		}
		calculated, err := canonicaljson.Digest(base)
		if err != nil || calculated != descriptorDigest {
			return nil, 0, invalid("evaluation archive shard descriptor digest drifted")
		}
		if totalBytes > maximumEvaluationExportArchiveBytes-byteSize {
			return nil, 0, invalid("evaluation archive shard bytes exceed the archive limit")
		}
		totalBytes += byteSize
		result[index] = evaluationArchiveShardDescriptor{
			Sequence: sequence, Family: family, FamilyShardIndex: familyShardIndex,
			FirstRecordIndex: firstRecordIndex, LastRecordIndex: lastRecordIndex,
			FirstOrderKey: firstOrderKey, LastOrderKey: lastOrderKey, RecordCount: recordCount,
			ByteSize: byteSize, BytesDigest: bytesDigest, RecordSetDigest: recordSetDigest,
			DescriptorDigest: descriptorDigest, Value: object,
		}
	}
	expectedSequence := int64(0)
	for _, family := range families {
		familyShards := make([]evaluationArchiveShardDescriptor, 0, family.ShardCount)
		var familyBytes int64
		for _, shard := range result {
			if shard.Family == family.Family {
				familyShards = append(familyShards, shard)
				familyBytes += shard.ByteSize
			}
		}
		if int64(len(familyShards)) != family.ShardCount {
			return nil, 0, invalid("evaluation archive family shard count drifted")
		}
		if family.RecordCount == 0 {
			continue
		}
		if family.Family == "providerCapabilityObservationReceipts" &&
			validateEvaluationProviderCapabilityObservationCapacity(family.RecordCount, familyBytes) != nil {
			return nil, 0, invalid("evaluation archive provider capability observation bytes exceed their capacity")
		}
		if family.Family == "hostedRetrievalRuntimeResourceCleanups" &&
			validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(family.RecordCount, familyBytes) != nil {
			return nil, 0, invalid("evaluation archive hosted retrieval runtime resource cleanup bytes exceed their capacity")
		}
		if family.Family == "hostedRetrievalRuntimeResourceLifecycleJournals" &&
			validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalArchiveCapacity(family.RecordCount, familyBytes) != nil {
			return nil, 0, invalid("evaluation archive hosted retrieval runtime resource lifecycle journal bytes exceed their capacity")
		}
		if family.Family == "capabilityEffectProviderRuntimeJournals" &&
			validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(family.RecordCount, familyBytes) != nil {
			return nil, 0, invalid("evaluation archive capability effect Provider-runtime journal bytes exceed their capacity")
		}
		var recordCount int64
		for index, shard := range familyShards {
			if shard.Sequence != expectedSequence || shard.FamilyShardIndex != int64(index) ||
				shard.FirstRecordIndex != recordCount ||
				(index > 0 && compareEvaluationArchiveText(familyShards[index-1].LastOrderKey, shard.FirstOrderKey) >= 0) {
				return nil, 0, invalid("evaluation archive shard sequence drifted")
			}
			expectedSequence++
			recordCount = shard.LastRecordIndex + 1
		}
		if recordCount != family.RecordCount || family.FirstOrderKey == nil || family.LastOrderKey == nil ||
			familyShards[0].FirstOrderKey != *family.FirstOrderKey || familyShards[len(familyShards)-1].LastOrderKey != *family.LastOrderKey {
			return nil, 0, invalid("evaluation archive shard family range drifted")
		}
	}
	if expectedSequence != int64(len(result)) {
		return nil, 0, invalid("evaluation archive contains orphaned shards")
	}
	return result, totalBytes, nil
}

func decodeEvaluationArchiveIndex(value any) (evaluationArchiveIndex, error) {
	object, canonical, err := evaluationArchiveCanonicalMap(value, maximumEvaluationArchiveIndexBytes)
	if err != nil || !exactEvaluationKeys(object, []string{
		"format", "version", "indexId", "evidenceFormat", "evidenceVersion", "exportLeaseId", "exportLeaseDigest",
		"runConfigArtifactBinding", "sourceConfigDigest", "frozenRunDigest", "planDigest", "repositoryCommit",
		"evidenceSetDigest", "bundleDigest", "authorityPayloadDigest", "authorityAttestationDigest", "authorityRoots",
		"evaluationManifestDigest", "families", "shards", "shardSetDigest", "totalShardBytes", "totalRecordCount",
		"createdAt", "indexDigest",
	}, "reviewLeaseDigest") || object["format"] != "prodivix.agent-model-evaluation-evidence-index" ||
		object["version"] != json.Number("1") || object["evidenceFormat"] != "prodivix.agent-model-evaluation-evidence" ||
		object["evidenceVersion"] != json.Number("3") {
		return evaluationArchiveIndex{}, invalid("evaluation archive index shape or format is invalid")
	}
	exportLeaseID, leaseOK := evaluationArchiveBoundedText(object["exportLeaseId"], 2_048)
	runConfigArtifactBinding, runConfigArtifactBindingBytes, bindingErr :=
		decodeEvaluationProductionRunConfigArtifactBinding(object["runConfigArtifactBinding"])
	repositoryCommit, commitOK := object["repositoryCommit"].(string)
	createdAt, timeOK := evaluationArchiveInstant(object["createdAt"])
	if !leaseOK || bindingErr != nil || !commitOK ||
		!evaluationRepositoryCommitPattern.MatchString(repositoryCommit) || !timeOK {
		return evaluationArchiveIndex{}, invalid("evaluation archive index identity is invalid")
	}
	digestFields := []string{"exportLeaseDigest", "sourceConfigDigest", "frozenRunDigest", "planDigest", "evidenceSetDigest",
		"bundleDigest", "authorityPayloadDigest", "authorityAttestationDigest", "evaluationManifestDigest", "shardSetDigest", "indexDigest"}
	digests := make(map[string]string, len(digestFields))
	for _, field := range digestFields {
		digest, ok := object[field].(string)
		if !ok || !evaluationDigestPattern.MatchString(digest) {
			return evaluationArchiveIndex{}, invalid("evaluation archive index digest is invalid")
		}
		digests[field] = digest
	}
	if runConfigArtifactBinding.SourceConfigDigest != digests["sourceConfigDigest"] ||
		runConfigArtifactBinding.FrozenRunDigest != digests["frozenRunDigest"] ||
		runConfigArtifactBinding.PlanDigest != digests["planDigest"] ||
		runConfigArtifactBinding.RepositoryCommit != repositoryCommit {
		return evaluationArchiveIndex{}, invalid("evaluation archive index run-config artifact binding drifted")
	}
	reviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(object, "reviewLeaseDigest")
	if err != nil {
		return evaluationArchiveIndex{}, err
	}
	roots, rootsValue, err := decodeEvaluationArchiveAuthorityRoots(object["authorityRoots"])
	if err != nil || roots.ReviewLeaseDigest != reviewLeaseDigest {
		return evaluationArchiveIndex{}, invalid("evaluation archive index review root drifted")
	}
	families, err := decodeEvaluationArchiveFamilies(object["families"])
	if err != nil {
		return evaluationArchiveIndex{}, err
	}
	shards, calculatedShardBytes, err := decodeEvaluationArchiveShards(object["shards"], families)
	if err != nil {
		return evaluationArchiveIndex{}, err
	}
	totalShardBytes, shardBytesOK := evaluationArchiveInteger(object["totalShardBytes"], 0, maximumEvaluationExportArchiveBytes)
	totalRecordCount, recordCountOK := evaluationArchiveInteger(object["totalRecordCount"], 0, maximumEvaluationExportRecords)
	if !shardBytesOK || totalShardBytes != calculatedShardBytes || !recordCountOK {
		return evaluationArchiveIndex{}, invalid("evaluation archive index totals drifted")
	}
	var calculatedRecordCount int64
	for _, family := range families {
		calculatedRecordCount += family.RecordCount
	}
	if totalRecordCount != calculatedRecordCount {
		return evaluationArchiveIndex{}, invalid("evaluation archive index record count drifted")
	}
	descriptorDigests := make([]string, len(shards))
	for index, shard := range shards {
		descriptorDigests[index] = shard.DescriptorDigest
	}
	calculatedShardSetDigest, err := canonicaljson.Digest(descriptorDigests)
	if err != nil || calculatedShardSetDigest != digests["shardSetDigest"] {
		return evaluationArchiveIndex{}, invalid("evaluation archive shard set digest drifted")
	}
	familySemanticRoots := make([]any, len(families))
	for index, family := range families {
		familySemanticRoots[index] = map[string]any{
			"family": family.Family, "recordCount": family.RecordCount, "semanticDigest": family.SemanticDigest,
		}
	}
	calculatedBundleDigest, err := canonicaljson.Digest(map[string]any{
		"evidenceFormat": "prodivix.agent-model-evaluation-evidence", "evidenceVersion": int64(3),
		"planDigest": digests["planDigest"], "repositoryCommit": repositoryCommit,
		"evidenceSetDigest": digests["evidenceSetDigest"], "authorityRoots": rootsValue,
		"familySemanticRoots": familySemanticRoots,
	})
	if err != nil || calculatedBundleDigest != digests["bundleDigest"] {
		return evaluationArchiveIndex{}, invalid("evaluation archive semantic bundle digest drifted")
	}
	indexID, ok := object["indexId"].(string)
	if !ok || indexID != "evaluation-evidence-index:"+strings.TrimPrefix(digests["planDigest"], "sha256-") {
		return evaluationArchiveIndex{}, invalid("evaluation archive index id drifted")
	}
	base := make(map[string]any, len(object)-1)
	for key, entry := range object {
		if key != "indexDigest" {
			base[key] = entry
		}
	}
	calculatedIndexDigest, err := canonicaljson.Digest(base)
	if err != nil || calculatedIndexDigest != digests["indexDigest"] {
		return evaluationArchiveIndex{}, invalid("evaluation archive index digest drifted")
	}
	return evaluationArchiveIndex{
		ExportLeaseID: exportLeaseID, ExportLeaseDigest: digests["exportLeaseDigest"],
		RunConfigArtifactBinding: runConfigArtifactBinding, RunConfigArtifactBindingBytes: runConfigArtifactBindingBytes,
		SourceConfigDigest: digests["sourceConfigDigest"],
		FrozenRunDigest:    digests["frozenRunDigest"], PlanDigest: digests["planDigest"], RepositoryCommit: repositoryCommit,
		EvidenceSetDigest: digests["evidenceSetDigest"], BundleDigest: digests["bundleDigest"],
		AuthorityPayloadDigest: digests["authorityPayloadDigest"], AuthorityAttestationDigest: digests["authorityAttestationDigest"],
		AuthorityRoots: roots, AuthorityRootsValue: rootsValue, ReviewLeaseDigest: reviewLeaseDigest,
		EvaluationManifestDigest: digests["evaluationManifestDigest"], Families: families, Shards: shards,
		ShardSetDigest: digests["shardSetDigest"], TotalShardBytes: totalShardBytes, TotalRecordCount: totalRecordCount,
		CreatedAt: createdAt, IndexDigest: digests["indexDigest"], Value: object, Canonical: canonical,
	}, nil
}

func decodeEvaluationArchiveAttestation(value any) (evaluationArchiveAttestation, error) {
	object, canonical, err := evaluationArchiveCanonicalMap(value, maximumEvaluationArchiveRootBytes)
	if err != nil || !exactEvaluationKeys(object, []string{
		"format", "version", "authorityId", "keyId", "exportLeaseId", "exportLeaseDigest", "runConfigArtifactBinding",
		"sourceConfigDigest", "frozenRunDigest", "planDigest", "repositoryCommit", "evidenceSetDigest", "bundleDigest",
		"authorityPayloadDigest", "authorityAttestationDigest", "authorityRoots", "evaluationManifestDigest", "indexDigest",
		"evidenceIndexArtifactDigest", "evidenceIndexArtifactSize", "shardSetDigest", "totalShardBytes", "totalRecordCount",
		"issuedAt", "algorithm", "attestedPayloadDigest", "signature", "attestationDigest",
	}, "reviewLeaseDigest") || object["format"] != "prodivix.agent-model-evaluation-evidence-archive-attestation" ||
		object["version"] != json.Number("1") || object["algorithm"] != "ed25519" {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attestation shape or format is invalid")
	}
	authorityID, authorityOK := evaluationArchiveBoundedText(object["authorityId"], 2_048)
	keyID, keyOK := evaluationArchiveBoundedText(object["keyId"], 2_048)
	exportLeaseID, leaseOK := evaluationArchiveBoundedText(object["exportLeaseId"], 2_048)
	runConfigArtifactBinding, runConfigArtifactBindingBytes, bindingErr :=
		decodeEvaluationProductionRunConfigArtifactBinding(object["runConfigArtifactBinding"])
	repositoryCommit, commitOK := object["repositoryCommit"].(string)
	issuedAt, timeOK := evaluationArchiveInstant(object["issuedAt"])
	signature, signatureOK := object["signature"].(string)
	if !authorityOK || !keyOK || !leaseOK || bindingErr != nil ||
		!commitOK || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) || !timeOK || !signatureOK ||
		!evaluationCanonicalBase64URL(signature, 64) {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attestation identity is invalid")
	}
	digestFields := []string{"exportLeaseDigest", "sourceConfigDigest", "frozenRunDigest", "planDigest", "evidenceSetDigest",
		"bundleDigest", "authorityPayloadDigest", "authorityAttestationDigest", "evaluationManifestDigest", "indexDigest",
		"evidenceIndexArtifactDigest", "shardSetDigest", "attestedPayloadDigest", "attestationDigest"}
	digests := make(map[string]string, len(digestFields))
	for _, field := range digestFields {
		digest, ok := object[field].(string)
		if !ok || !evaluationDigestPattern.MatchString(digest) {
			return evaluationArchiveAttestation{}, invalid("evaluation archive attestation digest is invalid")
		}
		digests[field] = digest
	}
	if runConfigArtifactBinding.SourceConfigDigest != digests["sourceConfigDigest"] ||
		runConfigArtifactBinding.FrozenRunDigest != digests["frozenRunDigest"] ||
		runConfigArtifactBinding.PlanDigest != digests["planDigest"] ||
		runConfigArtifactBinding.RepositoryCommit != repositoryCommit {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attestation run-config artifact binding drifted")
	}
	reviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(object, "reviewLeaseDigest")
	if err != nil {
		return evaluationArchiveAttestation{}, err
	}
	roots, rootsValue, err := decodeEvaluationArchiveAuthorityRoots(object["authorityRoots"])
	if err != nil || roots.ReviewLeaseDigest != reviewLeaseDigest {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attestation review root drifted")
	}
	indexArtifactSize, indexSizeOK := evaluationArchiveInteger(object["evidenceIndexArtifactSize"], 1, maximumEvaluationArchiveIndexBytes)
	totalShardBytes, shardBytesOK := evaluationArchiveInteger(object["totalShardBytes"], 0, maximumEvaluationExportArchiveBytes)
	totalRecordCount, recordCountOK := evaluationArchiveInteger(object["totalRecordCount"], 0, maximumEvaluationExportRecords)
	if !indexSizeOK || !shardBytesOK || !recordCountOK {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attestation totals are invalid")
	}
	payload := make(map[string]any, len(object)-4)
	for key, entry := range object {
		if key != "algorithm" && key != "attestedPayloadDigest" && key != "signature" && key != "attestationDigest" {
			payload[key] = entry
		}
	}
	payloadDigest, err := canonicaljson.Digest(payload)
	payloadBytes, payloadBytesErr := canonicaljson.Bytes(payload)
	if err != nil || payloadBytesErr != nil || payloadDigest != digests["attestedPayloadDigest"] {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attested payload digest drifted")
	}
	base := make(map[string]any, len(object)-1)
	for key, entry := range object {
		if key != "attestationDigest" {
			base[key] = entry
		}
	}
	attestationDigest, err := canonicaljson.Digest(base)
	if err != nil || attestationDigest != digests["attestationDigest"] {
		return evaluationArchiveAttestation{}, invalid("evaluation archive attestation digest drifted")
	}
	return evaluationArchiveAttestation{
		AuthorityID: authorityID, KeyID: keyID, ExportLeaseID: exportLeaseID,
		ExportLeaseDigest: digests["exportLeaseDigest"], RunConfigArtifactBinding: runConfigArtifactBinding,
		RunConfigArtifactBindingBytes: runConfigArtifactBindingBytes,
		SourceConfigDigest:            digests["sourceConfigDigest"], FrozenRunDigest: digests["frozenRunDigest"],
		PlanDigest: digests["planDigest"], RepositoryCommit: repositoryCommit, EvidenceSetDigest: digests["evidenceSetDigest"],
		BundleDigest: digests["bundleDigest"], AuthorityPayloadDigest: digests["authorityPayloadDigest"],
		AuthorityAttestationDigest: digests["authorityAttestationDigest"], AuthorityRoots: roots,
		AuthorityRootsValue: rootsValue, ReviewLeaseDigest: reviewLeaseDigest,
		EvaluationManifestDigest: digests["evaluationManifestDigest"], IndexDigest: digests["indexDigest"],
		EvidenceIndexArtifactDigest: digests["evidenceIndexArtifactDigest"], EvidenceIndexArtifactSize: indexArtifactSize,
		ShardSetDigest: digests["shardSetDigest"], TotalShardBytes: totalShardBytes, TotalRecordCount: totalRecordCount,
		IssuedAt: issuedAt, AttestedPayloadDigest: digests["attestedPayloadDigest"], AttestedPayloadBytes: payloadBytes,
		Signature: signature, AttestationDigest: digests["attestationDigest"], Value: object, Canonical: canonical,
	}, nil
}

func evaluationArchiveIndexMatchesAttestation(index evaluationArchiveIndex, attestation evaluationArchiveAttestation) bool {
	indexRoots, indexErr := canonicaljson.Bytes(index.AuthorityRootsValue)
	attestationRoots, attestationErr := canonicaljson.Bytes(attestation.AuthorityRootsValue)
	return indexErr == nil && attestationErr == nil && bytes.Equal(indexRoots, attestationRoots) &&
		index.ExportLeaseID == attestation.ExportLeaseID && index.ExportLeaseDigest == attestation.ExportLeaseDigest &&
		sameEvaluationProductionRunConfigArtifactBinding(index.RunConfigArtifactBinding, attestation.RunConfigArtifactBinding) &&
		bytes.Equal(index.RunConfigArtifactBindingBytes, attestation.RunConfigArtifactBindingBytes) &&
		index.SourceConfigDigest == attestation.SourceConfigDigest &&
		index.FrozenRunDigest == attestation.FrozenRunDigest && index.PlanDigest == attestation.PlanDigest &&
		index.RepositoryCommit == attestation.RepositoryCommit && index.EvidenceSetDigest == attestation.EvidenceSetDigest &&
		index.BundleDigest == attestation.BundleDigest && index.AuthorityPayloadDigest == attestation.AuthorityPayloadDigest &&
		index.AuthorityAttestationDigest == attestation.AuthorityAttestationDigest &&
		index.ReviewLeaseDigest == attestation.ReviewLeaseDigest &&
		index.EvaluationManifestDigest == attestation.EvaluationManifestDigest && index.IndexDigest == attestation.IndexDigest &&
		attestation.EvidenceIndexArtifactDigest == evaluationArchiveCanonicalBytesDigest(index.Canonical) &&
		attestation.EvidenceIndexArtifactSize == int64(len(index.Canonical)) && index.ShardSetDigest == attestation.ShardSetDigest &&
		index.TotalShardBytes == attestation.TotalShardBytes && index.TotalRecordCount == attestation.TotalRecordCount
}

func evaluationArchiveCanonicalBytesDigest(value []byte) string {
	digest := sha256.Sum256(value)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func validateEvaluationArchivePhysicalCapacity(
	totalShardBytes int64,
	declaredIndexArtifactSize int64,
	indexCanonicalBytes int64,
	rootCanonicalBytes int64,
) error {
	if totalShardBytes < 0 || declaredIndexArtifactSize != indexCanonicalBytes ||
		indexCanonicalBytes < 1 || indexCanonicalBytes > maximumEvaluationArchiveIndexBytes ||
		rootCanonicalBytes < 1 || rootCanonicalBytes > maximumEvaluationArchiveRootBytes {
		return conflict("evaluation archive physical byte accounting is invalid")
	}
	remaining := maximumEvaluationExportArchiveBytes
	if totalShardBytes > remaining {
		return conflict("evaluation archive physical bytes exceed the archive limit")
	}
	remaining -= totalShardBytes
	if indexCanonicalBytes > remaining {
		return conflict("evaluation archive physical bytes exceed the archive limit")
	}
	remaining -= indexCanonicalBytes
	if rootCanonicalBytes > remaining {
		return conflict("evaluation archive physical bytes exceed the archive limit")
	}
	return nil
}

func decodeEvaluationArchiveRoot(value any, attestation evaluationArchiveAttestation) (evaluationArchiveRoot, error) {
	object, canonical, err := evaluationArchiveCanonicalMap(value, maximumEvaluationArchiveRootBytes)
	if err != nil || !exactEvaluationKeys(object, []string{
		"format", "version", "rootId", "exportLeaseId", "exportLeaseDigest", "runConfigArtifactBinding", "sourceConfigDigest",
		"frozenRunDigest", "planDigest", "repositoryCommit", "evidenceSetDigest", "bundleDigest", "authorityPayloadDigest",
		"authorityAttestationDigest", "authorityRoots", "evaluationManifestDigest", "indexDigest",
		"evidenceIndexArtifactDigest", "evidenceIndexArtifactSize", "shardSetDigest", "totalShardBytes", "totalRecordCount",
		"archiveAttestation", "archiveAttestationDigest", "recordedAt", "rootDigest",
	}, "reviewLeaseDigest") || object["format"] != "prodivix.agent-model-evaluation-evidence-root" || object["version"] != json.Number("2") {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root shape or format is invalid")
	}
	rootID, rootIDOK := evaluationArchiveBoundedText(object["rootId"], 2_048)
	exportLeaseID, leaseOK := evaluationArchiveBoundedText(object["exportLeaseId"], 2_048)
	runConfigArtifactBinding, runConfigArtifactBindingBytes, bindingErr :=
		decodeEvaluationProductionRunConfigArtifactBinding(object["runConfigArtifactBinding"])
	repositoryCommit, commitOK := object["repositoryCommit"].(string)
	recordedAt, timeOK := evaluationArchiveInstant(object["recordedAt"])
	if !rootIDOK || !leaseOK || bindingErr != nil ||
		!commitOK || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) || !timeOK {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root identity is invalid")
	}
	digestFields := []string{"exportLeaseDigest", "sourceConfigDigest", "frozenRunDigest", "planDigest", "evidenceSetDigest",
		"bundleDigest", "authorityPayloadDigest", "authorityAttestationDigest", "evaluationManifestDigest", "indexDigest",
		"evidenceIndexArtifactDigest", "shardSetDigest", "archiveAttestationDigest", "rootDigest"}
	digests := make(map[string]string, len(digestFields))
	for _, field := range digestFields {
		digest, ok := object[field].(string)
		if !ok || !evaluationDigestPattern.MatchString(digest) {
			return evaluationArchiveRoot{}, invalid("evaluation archive evidence root digest is invalid")
		}
		digests[field] = digest
	}
	if runConfigArtifactBinding.SourceConfigDigest != digests["sourceConfigDigest"] ||
		runConfigArtifactBinding.FrozenRunDigest != digests["frozenRunDigest"] ||
		runConfigArtifactBinding.PlanDigest != digests["planDigest"] ||
		runConfigArtifactBinding.RepositoryCommit != repositoryCommit {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root run-config artifact binding drifted")
	}
	reviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(object, "reviewLeaseDigest")
	if err != nil {
		return evaluationArchiveRoot{}, err
	}
	roots, rootsValue, err := decodeEvaluationArchiveAuthorityRoots(object["authorityRoots"])
	if err != nil || roots.ReviewLeaseDigest != reviewLeaseDigest {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root review binding drifted")
	}
	indexArtifactSize, indexSizeOK := evaluationArchiveInteger(object["evidenceIndexArtifactSize"], 1, maximumEvaluationArchiveIndexBytes)
	totalShardBytes, shardBytesOK := evaluationArchiveInteger(object["totalShardBytes"], 0, maximumEvaluationExportArchiveBytes)
	totalRecordCount, countOK := evaluationArchiveInteger(object["totalRecordCount"], 0, maximumEvaluationExportRecords)
	if !indexSizeOK || !shardBytesOK || !countOK {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root totals are invalid")
	}
	nestedAttestation, nestedCanonical, err := evaluationArchiveCanonicalMap(object["archiveAttestation"], maximumEvaluationArchiveRootBytes)
	if err != nil {
		return evaluationArchiveRoot{}, err
	}
	outerAttestationCanonical, err := canonicaljson.Bytes(attestation.Value)
	if err != nil || !bytes.Equal(nestedCanonical, outerAttestationCanonical) || nestedAttestation == nil {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root attestation drifted")
	}
	rootRoots, rootRootsErr := canonicaljson.Bytes(rootsValue)
	attestationRoots, attestationRootsErr := canonicaljson.Bytes(attestation.AuthorityRootsValue)
	if rootRootsErr != nil || attestationRootsErr != nil || !bytes.Equal(rootRoots, attestationRoots) ||
		digests["archiveAttestationDigest"] != attestation.AttestationDigest || !recordedAt.Equal(attestation.IssuedAt) ||
		exportLeaseID != attestation.ExportLeaseID || digests["exportLeaseDigest"] != attestation.ExportLeaseDigest ||
		!sameEvaluationProductionRunConfigArtifactBinding(runConfigArtifactBinding, attestation.RunConfigArtifactBinding) ||
		!bytes.Equal(runConfigArtifactBindingBytes, attestation.RunConfigArtifactBindingBytes) ||
		digests["sourceConfigDigest"] != attestation.SourceConfigDigest ||
		digests["frozenRunDigest"] != attestation.FrozenRunDigest || digests["planDigest"] != attestation.PlanDigest ||
		repositoryCommit != attestation.RepositoryCommit || digests["evidenceSetDigest"] != attestation.EvidenceSetDigest ||
		digests["bundleDigest"] != attestation.BundleDigest || digests["authorityPayloadDigest"] != attestation.AuthorityPayloadDigest ||
		digests["authorityAttestationDigest"] != attestation.AuthorityAttestationDigest || reviewLeaseDigest != attestation.ReviewLeaseDigest ||
		digests["evaluationManifestDigest"] != attestation.EvaluationManifestDigest || digests["indexDigest"] != attestation.IndexDigest ||
		digests["evidenceIndexArtifactDigest"] != attestation.EvidenceIndexArtifactDigest || indexArtifactSize != attestation.EvidenceIndexArtifactSize ||
		digests["shardSetDigest"] != attestation.ShardSetDigest || totalShardBytes != attestation.TotalShardBytes ||
		totalRecordCount != attestation.TotalRecordCount {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root authority binding drifted")
	}
	if rootID != "evaluation-evidence-root:"+strings.TrimPrefix(digests["planDigest"], "sha256-") {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root id drifted")
	}
	base := make(map[string]any, len(object)-1)
	for key, entry := range object {
		if key != "rootDigest" {
			base[key] = entry
		}
	}
	calculatedRootDigest, err := canonicaljson.Digest(base)
	if err != nil || calculatedRootDigest != digests["rootDigest"] {
		return evaluationArchiveRoot{}, invalid("evaluation archive evidence root digest drifted")
	}
	return evaluationArchiveRoot{
		RootID: rootID, ExportLeaseID: exportLeaseID, ExportLeaseDigest: digests["exportLeaseDigest"],
		RunConfigArtifactBinding: runConfigArtifactBinding, RunConfigArtifactBindingBytes: runConfigArtifactBindingBytes,
		SourceConfigDigest: digests["sourceConfigDigest"], FrozenRunDigest: digests["frozenRunDigest"],
		PlanDigest: digests["planDigest"], RepositoryCommit: repositoryCommit, EvidenceSetDigest: digests["evidenceSetDigest"],
		BundleDigest: digests["bundleDigest"], AuthorityPayloadDigest: digests["authorityPayloadDigest"],
		AuthorityAttestationDigest: digests["authorityAttestationDigest"], AuthorityRoots: roots, AuthorityRootsValue: rootsValue,
		ReviewLeaseDigest: reviewLeaseDigest, EvaluationManifestDigest: digests["evaluationManifestDigest"],
		IndexDigest: digests["indexDigest"], EvidenceIndexArtifactDigest: digests["evidenceIndexArtifactDigest"],
		EvidenceIndexArtifactSize: indexArtifactSize, ShardSetDigest: digests["shardSetDigest"],
		TotalShardBytes: totalShardBytes, TotalRecordCount: totalRecordCount,
		ArchiveAttestationDigest: digests["archiveAttestationDigest"], RecordedAt: recordedAt,
		RootDigest: digests["rootDigest"], Value: object, Canonical: canonical,
	}, nil
}

func decodeEvaluationArchiveClosure(source []byte) (evaluationArchiveClosure, error) {
	if len(source) < 1 || len(source) > maximumEvaluationArchiveClosureBytes {
		return evaluationArchiveClosure{}, invalid("evaluation archive closure exceeds its byte limit")
	}
	decoded, err := decodeCanonicalEvaluationJSON(source)
	value, ok := decoded.(map[string]any)
	if err != nil || !ok || !exactEvaluationKeys(value, []string{
		"exportLeaseId", "exportLeaseDigest", "evidenceIndex", "archiveAttestation", "evidenceRoot",
	}) {
		return evaluationArchiveClosure{}, invalid("evaluation archive closure shape is invalid")
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return evaluationArchiveClosure{}, invalid("evaluation archive closure is not canonical")
	}
	index, err := decodeEvaluationArchiveIndex(value["evidenceIndex"])
	if err != nil {
		return evaluationArchiveClosure{}, err
	}
	attestation, err := decodeEvaluationArchiveAttestation(value["archiveAttestation"])
	if err != nil || !evaluationArchiveIndexMatchesAttestation(index, attestation) {
		return evaluationArchiveClosure{}, invalid("evaluation archive attestation does not bind the exact index")
	}
	root, err := decodeEvaluationArchiveRoot(value["evidenceRoot"], attestation)
	if err != nil {
		return evaluationArchiveClosure{}, err
	}
	if err := validateEvaluationArchivePhysicalCapacity(
		index.TotalShardBytes,
		root.EvidenceIndexArtifactSize,
		int64(len(index.Canonical)),
		int64(len(root.Canonical)),
	); err != nil {
		return evaluationArchiveClosure{}, err
	}
	exportLeaseID, ok := value["exportLeaseId"].(string)
	exportLeaseDigest, digestOK := value["exportLeaseDigest"].(string)
	if !ok || !digestOK || exportLeaseID != index.ExportLeaseID || exportLeaseDigest != index.ExportLeaseDigest ||
		root.IndexDigest != index.IndexDigest || root.RootDigest == "" {
		return evaluationArchiveClosure{}, invalid("evaluation archive closure partition drifted")
	}
	closureDigest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationArchiveClosure{}, err
	}
	return evaluationArchiveClosure{
		EvaluationArchiveClosureRecord: EvaluationArchiveClosureRecord{
			ExportLeaseID: exportLeaseID, ExportLeaseDigest: exportLeaseDigest,
			RunConfigArtifactBinding:      index.RunConfigArtifactBinding,
			RunConfigArtifactBindingBytes: append([]byte(nil), index.RunConfigArtifactBindingBytes...),
			SourceConfigDigest:            index.SourceConfigDigest,
			FrozenRunDigest:               index.FrozenRunDigest, EvidenceSetDigest: index.EvidenceSetDigest,
			AuthorityPayloadDigest:     index.AuthorityPayloadDigest,
			AuthorityAttestationDigest: index.AuthorityAttestationDigest,
			ReviewLeaseDigest:          index.ReviewLeaseDigest, EvaluationManifestDigest: index.EvaluationManifestDigest,
			IndexDigest: index.IndexDigest, ArchiveAttestationDigest: attestation.AttestationDigest,
			RootDigest: root.RootDigest, ClosureDigest: closureDigest, ClosureBytes: canonical, RecordedAt: root.RecordedAt,
		},
		Index: index, Attestation: attestation, Root: root, Value: value,
	}, nil
}
