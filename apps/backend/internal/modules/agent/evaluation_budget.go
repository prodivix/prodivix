package agent

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"regexp"
	"strconv"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const maximumEvaluationBudgetFactBytes = 1_048_576

var evaluationDecimalPattern = regexp.MustCompile(`^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$`)
var evaluationCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)
var evaluationDigestPattern = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)

type evaluationBudgetCeiling struct {
	Usage            map[string]*big.Rat
	Cost             map[string]*big.Rat
	ModelInvocations int64
	ToolCalls        int64
	RepairRounds     int64
	Transactions     int64
	ArtifactBytes    int64
	ElapsedMS        int64
}

type evaluationBudgetDemand struct {
	Usage            map[string]*big.Rat
	Cost             map[string]*big.Rat
	ModelInvocations int64
	ToolCalls        int64
	RepairRounds     int64
	Transactions     int64
	ArtifactBytes    int64
	ElapsedMS        int64
	Unknown          bool
	Digest           string
	Canonical        []byte
}

type evaluationBudgetSettlement struct {
	Actual                 evaluationBudgetDemand
	Charged                evaluationBudgetDemand
	RequiresReconciliation bool
	ReconciliationReason   string
	SettledAt              time.Time
	Digest                 string
	Canonical              []byte
}

type evaluationHostedRuntimeBudgetFloor struct {
	HostedSearchQueries       int64
	HostedToolCalls           int64
	HostedAttemptToolCalls    int64
	HostedLifecycleToolCalls  int64
	ProviderUploadBytes       int64
	ProviderStorageByteSecond int64
}

func exactEvaluationKeys(value map[string]any, required []string, optional ...string) bool {
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, key := range required {
		allowed[key] = struct{}{}
		if _, ok := value[key]; !ok {
			return false
		}
	}
	for _, key := range optional {
		allowed[key] = struct{}{}
	}
	for key := range value {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
}

func decodeEvaluationJSONObject(source []byte, maximum int) (map[string]any, []byte, error) {
	if len(source) == 0 || len(source) > maximum {
		return nil, nil, invalid("evaluation budget JSON is empty or over its byte limit")
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return nil, nil, invalid("evaluation budget JSON is malformed")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, nil, invalid("evaluation budget JSON has trailing data")
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return nil, nil, invalid("evaluation budget JSON is not canonical")
	}
	return value, canonical, nil
}

func evaluationDecimal(value any, name string) (*big.Rat, error) {
	text, ok := value.(string)
	if !ok || !evaluationDecimalPattern.MatchString(text) {
		return nil, invalid(name + " is not a canonical non-negative decimal")
	}
	result, ok := new(big.Rat).SetString(text)
	if !ok || result.Sign() < 0 {
		return nil, invalid(name + " is not a canonical non-negative decimal")
	}
	return result, nil
}

func evaluationCount(value any, name string) (int64, error) {
	number, ok := value.(json.Number)
	if !ok {
		return 0, invalid(name + " is not an integer")
	}
	parsed, err := strconv.ParseInt(number.String(), 10, 64)
	if err != nil || parsed < 0 || parsed > 9_007_199_254_740_991 {
		return 0, invalid(name + " is not a non-negative safe integer")
	}
	return parsed, nil
}

func evaluationInstant(value any, name string) (time.Time, error) {
	text, ok := value.(string)
	if !ok {
		return time.Time{}, invalid(name + " is not an instant")
	}
	parsed, err := time.Parse(time.RFC3339Nano, text)
	if err != nil || parsed.UTC().Format("2006-01-02T15:04:05.000Z") != text {
		return time.Time{}, invalid(name + " is not a canonical millisecond instant")
	}
	return parsed, nil
}

func maximumRat(values ...*big.Rat) *big.Rat {
	var maximum *big.Rat
	for _, value := range values {
		if value != nil && (maximum == nil || value.Cmp(maximum) > 0) {
			maximum = new(big.Rat).Set(value)
		}
	}
	return maximum
}

var evaluationUsageUnits = map[string]struct{}{
	"text-token-input": {}, "text-token-output": {}, "reasoning-token": {},
	"cache-read-token": {}, "cache-write-token": {}, "image": {}, "image-pixel": {},
	"media-source-byte": {}, "media-processed-byte": {}, "document-page": {},
	"document-rendered-pixel": {}, "ocr-character": {}, "audio-second": {}, "audio-sample": {},
	"video-second": {}, "video-input-frame": {}, "video-frame": {},
	"transform-compute-millisecond": {}, "transform-memory-byte-second": {},
	"provider-upload-byte": {}, "hosted-search-query": {}, "hosted-tool-call": {},
	"sandbox-compute-second": {}, "provider-storage-byte-second": {},
	"generated-artifact": {}, "generated-artifact-byte": {},
}

func decodeEvaluationUsage(value any, requireKnown bool) (map[string]*big.Rat, bool, error) {
	usage, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(usage, []string{"amounts", "vectorDigest"}) {
		return nil, false, invalid("evaluation demand usage vector shape is invalid")
	}
	amounts, ok := usage["amounts"].([]any)
	if !ok {
		return nil, false, invalid("evaluation demand usage amounts are invalid")
	}
	expectedDigest, err := canonicaljson.Digest(amounts)
	if err != nil || usage["vectorDigest"] != expectedDigest {
		return nil, false, invalid("evaluation demand usage vector digest drifted")
	}
	result := make(map[string]*big.Rat, len(amounts))
	unknown := false
	previous := ""
	for index, raw := range amounts {
		amount, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(amount, []string{"unit", "confidence"}, "logicalAmount", "billableAmount", "cachedAmount", "sourceDigest") {
			return nil, false, invalid("evaluation demand usage amount shape is invalid")
		}
		unit, ok := amount["unit"].(string)
		confidence, confidenceOK := amount["confidence"].(string)
		_, validUnit := evaluationUsageUnits[unit]
		if !ok || !validUnit || (index > 0 && unit <= previous) || !confidenceOK ||
			(confidence != "reported" && confidence != "measured" && confidence != "estimated" && confidence != "unknown") {
			return nil, false, invalid("evaluation demand usage identity or confidence is invalid")
		}
		if source, exists := amount["sourceDigest"]; exists {
			text, ok := source.(string)
			if !ok || !evaluationDigestPattern.MatchString(text) {
				return nil, false, invalid("evaluation demand usage source digest is invalid")
			}
		}
		var values []*big.Rat
		for _, field := range []string{"logicalAmount", "billableAmount", "cachedAmount"} {
			if rawValue, exists := amount[field]; exists {
				parsed, err := evaluationDecimal(rawValue, "evaluation demand "+field)
				if err != nil {
					return nil, false, err
				}
				values = append(values, parsed)
			}
		}
		ceiling := maximumRat(values...)
		if confidence != "unknown" && ceiling == nil {
			return nil, false, invalid("known evaluation demand usage requires at least one amount")
		}
		isUnknown := confidence == "unknown"
		if isUnknown && requireKnown {
			return nil, false, conflict("evaluation hard-budget reservation contains unknown usage")
		}
		if isUnknown {
			unknown = true
		} else {
			result[unit] = ceiling
		}
		previous = unit
	}
	return result, unknown, nil
}

func decodeEvaluationCosts(value any, requireKnown bool) (map[string]*big.Rat, bool, error) {
	costs, ok := value.([]any)
	if !ok {
		return nil, false, invalid("evaluation demand costs are invalid")
	}
	result := make(map[string]*big.Rat, len(costs))
	unknown := false
	previous := ""
	for index, raw := range costs {
		cost, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(cost, []string{"currency", "confidence"}, "amount", "sourceDigest") {
			return nil, false, invalid("evaluation demand cost shape is invalid")
		}
		currency, currencyOK := cost["currency"].(string)
		confidence, confidenceOK := cost["confidence"].(string)
		if !currencyOK || !evaluationCurrencyPattern.MatchString(currency) ||
			(index > 0 && currency <= previous) || !confidenceOK ||
			(confidence != "reported" && confidence != "measured" && confidence != "estimated" && confidence != "unknown") {
			return nil, false, invalid("evaluation demand cost identity or confidence is invalid")
		}
		if source, exists := cost["sourceDigest"]; exists {
			text, ok := source.(string)
			if !ok || !evaluationDigestPattern.MatchString(text) {
				return nil, false, invalid("evaluation demand cost source digest is invalid")
			}
		}
		var amount *big.Rat
		var err error
		if rawAmount, exists := cost["amount"]; exists {
			amount, err = evaluationDecimal(rawAmount, "evaluation demand cost")
			if err != nil {
				return nil, false, err
			}
		}
		isUnknown := confidence == "unknown" || amount == nil
		if isUnknown && requireKnown {
			return nil, false, conflict("evaluation hard-budget reservation contains unknown cost")
		}
		if isUnknown {
			unknown = true
		} else {
			result[currency] = amount
		}
		previous = currency
	}
	return result, unknown, nil
}

func parseEvaluationBudgetDemand(value map[string]any, requireKnown bool) (evaluationBudgetDemand, error) {
	if !exactEvaluationKeys(value, []string{
		"usage", "cost", "modelInvocations", "toolCalls", "repairRounds",
		"transactions", "artifactBytes", "elapsedMs",
	}) {
		return evaluationBudgetDemand{}, invalid("evaluation budget demand shape is invalid")
	}
	usage, usageUnknown, err := decodeEvaluationUsage(value["usage"], requireKnown)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	cost, costUnknown, err := decodeEvaluationCosts(value["cost"], requireKnown)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	counts := make([]int64, 6)
	for index, field := range []string{"modelInvocations", "toolCalls", "repairRounds", "transactions", "artifactBytes", "elapsedMs"} {
		counts[index], err = evaluationCount(value[field], "evaluation demand "+field)
		if err != nil {
			return evaluationBudgetDemand{}, err
		}
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		return evaluationBudgetDemand{}, invalid("evaluation budget demand cannot be canonicalized")
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	return evaluationBudgetDemand{
		Usage: usage, Cost: cost, ModelInvocations: counts[0], ToolCalls: counts[1],
		RepairRounds: counts[2], Transactions: counts[3], ArtifactBytes: counts[4], ElapsedMS: counts[5],
		Unknown: usageUnknown || costUnknown, Digest: digest, Canonical: canonical,
	}, nil
}

func decodeEvaluationBudgetDemand(source []byte, requireKnown bool) (evaluationBudgetDemand, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationBudgetFactBytes)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	demand, err := parseEvaluationBudgetDemand(value, requireKnown)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	demand.Canonical = canonical
	return demand, nil
}

func decodeEvaluationBudget(planBytes []byte) (evaluationBudgetCeiling, error) {
	value, _, err := decodeEvaluationJSONObject(planBytes, 8_388_608)
	if err != nil {
		return evaluationBudgetCeiling{}, err
	}
	planValue, ok := value["value"].(map[string]any)
	if !ok {
		return evaluationBudgetCeiling{}, invalid("evaluation plan value is invalid")
	}
	evaluationBudget, ok := planValue["budget"].(map[string]any)
	if !ok || !exactEvaluationKeys(evaluationBudget, []string{
		"budget", "maxProviderJobs", "maxShards", "maxHumanRatings", "reservePolicyDigest", "budgetDigest",
	}) {
		return evaluationBudgetCeiling{}, invalid("evaluation plan budget is invalid")
	}
	for _, field := range []string{"reservePolicyDigest", "budgetDigest"} {
		value, ok := evaluationBudget[field].(string)
		if !ok || !evaluationDigestPattern.MatchString(value) {
			return evaluationBudgetCeiling{}, invalid("evaluation plan budget digest is invalid")
		}
	}
	budgetBase := make(map[string]any, len(evaluationBudget)-1)
	for key, entry := range evaluationBudget {
		if key != "budgetDigest" {
			budgetBase[key] = entry
		}
	}
	budgetDigest, err := canonicaljson.Digest(budgetBase)
	if err != nil || evaluationBudget["budgetDigest"] != budgetDigest {
		return evaluationBudgetCeiling{}, invalid("evaluation plan budget digest drifted")
	}
	for _, field := range []string{"maxProviderJobs", "maxShards", "maxHumanRatings"} {
		if _, err := evaluationCount(evaluationBudget[field], "evaluation plan "+field); err != nil {
			return evaluationBudgetCeiling{}, err
		}
	}
	budget, ok := evaluationBudget["budget"].(map[string]any)
	if !ok || !exactEvaluationKeys(budget, []string{
		"usageLimits", "costLimits", "maxModelInvocations", "maxToolCalls",
		"maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs",
	}) {
		return evaluationBudgetCeiling{}, invalid("evaluation plan hard budget shape is invalid")
	}
	ceiling := evaluationBudgetCeiling{Usage: map[string]*big.Rat{}, Cost: map[string]*big.Rat{}}
	usageLimits, ok := budget["usageLimits"].([]any)
	if !ok {
		return evaluationBudgetCeiling{}, invalid("evaluation usage limits are invalid")
	}
	previousUsageUnit := ""
	for _, raw := range usageLimits {
		limit, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(limit, []string{"unit", "maximum"}) {
			return evaluationBudgetCeiling{}, invalid("evaluation usage limit shape is invalid")
		}
		unit, ok := limit["unit"].(string)
		if !ok || unit == "" || (previousUsageUnit != "" && unit <= previousUsageUnit) {
			return evaluationBudgetCeiling{}, invalid("evaluation usage limit unit is invalid")
		}
		ceiling.Usage[unit], err = evaluationDecimal(limit["maximum"], "evaluation usage limit")
		if err != nil {
			return evaluationBudgetCeiling{}, err
		}
		previousUsageUnit = unit
	}
	costLimits, ok := budget["costLimits"].([]any)
	if !ok {
		return evaluationBudgetCeiling{}, invalid("evaluation cost limits are invalid")
	}
	previousCurrency := ""
	for _, raw := range costLimits {
		limit, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(limit, []string{"currency", "maximum"}) {
			return evaluationBudgetCeiling{}, invalid("evaluation cost limit shape is invalid")
		}
		currency, ok := limit["currency"].(string)
		if !ok || !evaluationCurrencyPattern.MatchString(currency) ||
			(previousCurrency != "" && currency <= previousCurrency) {
			return evaluationBudgetCeiling{}, invalid("evaluation cost limit currency is invalid")
		}
		ceiling.Cost[currency], err = evaluationDecimal(limit["maximum"], "evaluation cost limit")
		if err != nil {
			return evaluationBudgetCeiling{}, err
		}
		previousCurrency = currency
	}
	counts := []*int64{&ceiling.ModelInvocations, &ceiling.ToolCalls, &ceiling.RepairRounds, &ceiling.Transactions, &ceiling.ArtifactBytes, &ceiling.ElapsedMS}
	for index, field := range []string{"maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs"} {
		*counts[index], err = evaluationCount(budget[field], "evaluation budget "+field)
		if err != nil {
			return evaluationBudgetCeiling{}, err
		}
	}
	if err := validateEvaluationHostedRuntimeBudgetFloor(planValue, ceiling); err != nil {
		return evaluationBudgetCeiling{}, err
	}
	return ceiling, nil
}

func addEvaluationBudgetFloorAmount(current, addition int64) (int64, error) {
	if addition < 0 || current > 9_007_199_254_740_991-addition {
		return 0, conflict("evaluation hosted runtime budget floor exceeds safe bounds")
	}
	return current + addition, nil
}

func resolveEvaluationHostedRuntimeBudgetFloor(planValue map[string]any) (evaluationHostedRuntimeBudgetFloor, error) {
	plannedJourneyCount, plannedJourneyCountOK := integerMember(planValue, "plannedJourneyCount")
	if !plannedJourneyCountOK {
		return evaluationHostedRuntimeBudgetFloor{}, invalid("evaluation hosted runtime budget plan denominator is invalid")
	}
	plan := evaluationPlanFact{
		PlanDigest:          stringMember(planValue, "planDigest"),
		PlannedJourneyCount: plannedJourneyCount,
		Value:               planValue,
	}
	plannedAttempts, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return evaluationHostedRuntimeBudgetFloor{}, err
	}
	rawTargets, targetsOK := arrayMember(planValue, "capabilityQualificationTargets")
	if !targetsOK {
		return evaluationHostedRuntimeBudgetFloor{}, conflict("evaluation hosted runtime budget targets are invalid")
	}
	targetsByID := make(map[string]map[string]any, len(rawTargets))
	lifecycleIntentCount := int64(0)
	floor := evaluationHostedRuntimeBudgetFloor{}
	for _, rawTarget := range rawTargets {
		target, targetOK := rawTarget.(map[string]any)
		if !targetOK {
			return evaluationHostedRuntimeBudgetFloor{}, conflict("evaluation hosted runtime budget target is invalid")
		}
		targetID := stringMember(target, "targetId")
		if targetID == "" || targetsByID[targetID] != nil {
			return evaluationHostedRuntimeBudgetFloor{}, conflict("evaluation hosted runtime budget target identity is invalid")
		}
		targetsByID[targetID] = target
		optionalAuthority, hasOptionalAuthority := objectMember(target, "optionalCapabilitySupportAuthority")
		if !hasOptionalAuthority {
			continue
		}
		runtimeAuthority, hasRuntimeAuthority := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
		if !hasRuntimeAuthority || stringMember(runtimeAuthority, "hostedRetrievalRuntimeResourceRegistrationIntentDigest") == "" {
			continue
		}
		profileID := stringMember(runtimeAuthority, "capabilityProfileId")
		protocolFamily := stringMember(runtimeAuthority, "protocolFamily")
		if stringMember(runtimeAuthority, "capabilityId") != "provider.hosted-retrieval" ||
			stringMember(runtimeAuthority, "sourceKind") != "sealed-hosted-owner-result" ||
			(protocolFamily != "gemini-interactions" && protocolFamily != "openai-responses") ||
			(profileID != "g4-provider-hosted-retrieval-core" && profileID != "g4-provider-hosted-retrieval-document") ||
			profileID != stringMember(target, "capabilityProfileId") ||
			protocolFamily != stringMember(target, "protocolFamily") {
			return evaluationHostedRuntimeBudgetFloor{}, conflict("evaluation hosted runtime lifecycle budget authority is invalid")
		}
		program, programErr := expectedEvaluationCapabilityProbeProgram(profileID, stringMember(runtimeAuthority, "capabilityProfileDigest"))
		resourceKind := stringMember(program.PublicProbeResource, "resourceKind")
		content, contentErr := evaluationCapabilityProbePublicResourceContent(resourceKind)
		if programErr != nil || contentErr != nil || content == "" {
			return evaluationHostedRuntimeBudgetFloor{}, conflict("evaluation hosted runtime lifecycle budget material is invalid")
		}
		uploadBytes := int64(len([]byte(content)))
		storageByteSeconds := uploadBytes * 691_200
		floor.HostedLifecycleToolCalls, err = addEvaluationBudgetFloorAmount(floor.HostedLifecycleToolCalls, 3)
		if err != nil {
			return evaluationHostedRuntimeBudgetFloor{}, err
		}
		floor.ProviderUploadBytes, err = addEvaluationBudgetFloorAmount(floor.ProviderUploadBytes, uploadBytes)
		if err != nil {
			return evaluationHostedRuntimeBudgetFloor{}, err
		}
		floor.ProviderStorageByteSecond, err = addEvaluationBudgetFloorAmount(floor.ProviderStorageByteSecond, storageByteSeconds)
		if err != nil {
			return evaluationHostedRuntimeBudgetFloor{}, err
		}
		lifecycleIntentCount++
	}
	for _, attempt := range plannedAttempts {
		target := targetsByID[stringMember(attempt.Descriptor, "targetId")]
		optionalAuthority, hasOptionalAuthority := objectMember(target, "optionalCapabilitySupportAuthority")
		if hasOptionalAuthority && stringMember(optionalAuthority, "capabilityId") == "provider.hosted-retrieval" &&
			stringMember(optionalAuthority, "supportExpectation") == "required" {
			floor.HostedAttemptToolCalls, err = addEvaluationBudgetFloorAmount(floor.HostedAttemptToolCalls, 1)
			if err != nil {
				return evaluationHostedRuntimeBudgetFloor{}, err
			}
		}
	}
	if (floor.HostedAttemptToolCalls > 0 || lifecycleIntentCount > 0) && lifecycleIntentCount != 4 {
		return evaluationHostedRuntimeBudgetFloor{}, conflict("evaluation hosted runtime budget requires four lifecycle intents")
	}
	floor.HostedSearchQueries = floor.HostedAttemptToolCalls
	floor.HostedToolCalls, err = addEvaluationBudgetFloorAmount(floor.HostedAttemptToolCalls, floor.HostedLifecycleToolCalls)
	if err != nil {
		return evaluationHostedRuntimeBudgetFloor{}, err
	}
	return floor, nil
}

func validateEvaluationHostedRuntimeBudgetFloor(planValue map[string]any, ceiling evaluationBudgetCeiling) error {
	floor, err := resolveEvaluationHostedRuntimeBudgetFloor(planValue)
	if err != nil {
		return err
	}
	required := []struct {
		unit   string
		amount int64
	}{
		{"hosted-search-query", floor.HostedSearchQueries},
		{"hosted-tool-call", floor.HostedToolCalls},
		{"provider-upload-byte", floor.ProviderUploadBytes},
		{"provider-storage-byte-second", floor.ProviderStorageByteSecond},
	}
	for _, entry := range required {
		if entry.amount == 0 {
			continue
		}
		limit := ceiling.Usage[entry.unit]
		if limit == nil || limit.Cmp(new(big.Rat).SetInt64(entry.amount)) < 0 {
			return conflict("evaluation budget cannot cover the hosted attempt and lifecycle demand floor")
		}
	}
	if ceiling.ToolCalls < floor.HostedAttemptToolCalls {
		return conflict("evaluation tool-call budget cannot cover the hosted attempt floor")
	}
	return nil
}

func addEvaluationBudgetDemand(left, right evaluationBudgetDemand) evaluationBudgetDemand {
	result := evaluationBudgetDemand{
		Usage: map[string]*big.Rat{}, Cost: map[string]*big.Rat{},
		ModelInvocations: left.ModelInvocations + right.ModelInvocations,
		ToolCalls:        left.ToolCalls + right.ToolCalls, RepairRounds: left.RepairRounds + right.RepairRounds,
		Transactions: left.Transactions + right.Transactions, ArtifactBytes: left.ArtifactBytes + right.ArtifactBytes,
		ElapsedMS: left.ElapsedMS + right.ElapsedMS, Unknown: left.Unknown || right.Unknown,
	}
	for key, value := range left.Usage {
		result.Usage[key] = new(big.Rat).Set(value)
	}
	for key, value := range right.Usage {
		if current := result.Usage[key]; current != nil {
			current.Add(current, value)
		} else {
			result.Usage[key] = new(big.Rat).Set(value)
		}
	}
	for key, value := range left.Cost {
		result.Cost[key] = new(big.Rat).Set(value)
	}
	for key, value := range right.Cost {
		if current := result.Cost[key]; current != nil {
			current.Add(current, value)
		} else {
			result.Cost[key] = new(big.Rat).Set(value)
		}
	}
	return result
}

func evaluationDemandWithin(candidate evaluationBudgetDemand, ceiling evaluationBudgetCeiling) bool {
	if candidate.Unknown || candidate.ModelInvocations > ceiling.ModelInvocations || candidate.ToolCalls > ceiling.ToolCalls ||
		candidate.RepairRounds > ceiling.RepairRounds || candidate.Transactions > ceiling.Transactions ||
		candidate.ArtifactBytes > ceiling.ArtifactBytes || candidate.ElapsedMS > ceiling.ElapsedMS {
		return false
	}
	for unit, amount := range candidate.Usage {
		limit := ceiling.Usage[unit]
		if limit == nil || amount.Cmp(limit) > 0 {
			return false
		}
	}
	for currency, amount := range candidate.Cost {
		limit := ceiling.Cost[currency]
		if limit == nil || amount.Cmp(limit) > 0 {
			return false
		}
	}
	return true
}

func evaluationDemandFitsWithin(candidate, ceiling evaluationBudgetDemand) bool {
	if candidate.Unknown || candidate.ModelInvocations > ceiling.ModelInvocations || candidate.ToolCalls > ceiling.ToolCalls ||
		candidate.RepairRounds > ceiling.RepairRounds || candidate.Transactions > ceiling.Transactions ||
		candidate.ArtifactBytes > ceiling.ArtifactBytes || candidate.ElapsedMS > ceiling.ElapsedMS {
		return false
	}
	for unit, amount := range candidate.Usage {
		limit := ceiling.Usage[unit]
		if limit == nil || amount.Cmp(limit) > 0 {
			return false
		}
	}
	for currency, amount := range candidate.Cost {
		limit := ceiling.Cost[currency]
		if limit == nil || amount.Cmp(limit) > 0 {
			return false
		}
	}
	return true
}

func decodeEvaluationBudgetSettlement(source []byte, reservation evaluationBudgetDemand, reservedAt time.Time) (evaluationBudgetSettlement, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationBudgetFactBytes)
	if err != nil {
		return evaluationBudgetSettlement{}, err
	}
	if !exactEvaluationKeys(value, []string{"actual", "charged", "requiresReconciliation", "settledAt", "settlementDigest"}, "reconciliationReason") {
		return evaluationBudgetSettlement{}, invalid("evaluation budget settlement shape is invalid")
	}
	actualValue, actualOK := value["actual"].(map[string]any)
	chargedValue, chargedOK := value["charged"].(map[string]any)
	requires, requiresOK := value["requiresReconciliation"].(bool)
	if !actualOK || !chargedOK || !requiresOK {
		return evaluationBudgetSettlement{}, invalid("evaluation budget settlement value is invalid")
	}
	actual, err := parseEvaluationBudgetDemand(actualValue, !requires)
	if err != nil {
		return evaluationBudgetSettlement{}, err
	}
	charged, err := parseEvaluationBudgetDemand(chargedValue, true)
	if err != nil {
		return evaluationBudgetSettlement{}, err
	}
	settledAt, err := evaluationInstant(value["settledAt"], "evaluation budget settlement time")
	if err != nil || settledAt.Before(reservedAt) {
		return evaluationBudgetSettlement{}, invalid("evaluation budget settlement predates reservation")
	}
	reason, hasReason := value["reconciliationReason"].(string)
	if requires {
		if !hasReason || (reason != "usage-unknown" && reason != "worker-loss" && reason != "timeout" && reason != "provider-disconnect" && reason != "ack-loss") ||
			!bytes.Equal(charged.Canonical, reservation.Canonical) ||
			(actual.Unknown && reason != "usage-unknown") ||
			(!actual.Unknown && (reason == "usage-unknown" || !bytes.Equal(actual.Canonical, reservation.Canonical))) {
			return evaluationBudgetSettlement{}, conflict("evaluation reconciliation does not charge the reserved ceiling")
		}
	} else if hasReason || !bytes.Equal(charged.Canonical, actual.Canonical) || !evaluationDemandFitsWithin(actual, reservation) {
		return evaluationBudgetSettlement{}, conflict("evaluation actual usage exceeds or drifts from its reservation")
	}
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != "settlementDigest" {
			base[key] = entry
		}
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil || value["settlementDigest"] != digest {
		return evaluationBudgetSettlement{}, invalid("evaluation settlement digest drifted")
	}
	return evaluationBudgetSettlement{
		Actual: actual, Charged: charged, RequiresReconciliation: requires,
		ReconciliationReason: reason, SettledAt: settledAt, Digest: digest, Canonical: canonical,
	}, nil
}
