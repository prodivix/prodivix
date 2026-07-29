package verification

func validateVerificationPlanGrant(plan VerificationPlanGrant) error {
	if plan.Status != "ready" ||
		validateIdentifier(plan.WorkspaceID, "plan.workspaceId") != nil ||
		!validRevision(plan.TargetRevision) ||
		!validRevision(plan.PolicyRevision) ||
		plan.TargetPartitionRevisions.WorkspaceRev != plan.TargetRevision ||
		plan.TargetPartitionRevisions.DocumentRevisions == nil ||
		!validAuthoritativeRetentionRequest(plan.RetentionRequest) {
		return attemptGrantFailure("VerificationPlan root identity is invalid.")
	}
	for name, value := range map[string]string{
		"scenarioRegistryDigest": plan.ScenarioRegistryDigest,
		"policyDigest":           plan.PolicyDigest,
		"impactDigest":           plan.ImpactDigest,
		"semanticSchemaDigest":   plan.SemanticSchemaDigest,
		"providerSetDigest":      plan.ProviderSetDigest,
		"compilerDigest":         plan.CompilerDigest,
		"plannerDigest":          plan.PlannerDigest,
		"adapterRegistryDigest":  plan.AdapterRegistryDigest,
		"planDigest":             plan.PlanDigest,
	} {
		if !digestPattern.MatchString(value) {
			return attemptGrantFailure("VerificationPlan " + name + " is invalid.")
		}
	}
	if _, err := parseInstant(plan.PolicyEvaluationInstant); err != nil {
		return attemptGrantFailure("VerificationPlan policy evaluation instant is invalid.")
	}
	if plan.Cells == nil || len(plan.Cells) == 0 ||
		len(plan.Cells) > maximumClosureEvidenceRecords ||
		plan.Issues == nil || len(plan.Issues) != 0 || plan.Explanations == nil ||
		plan.Budget.OverBudgetDimensions == nil ||
		len(plan.Budget.OverBudgetDimensions) != 0 {
		return attemptGrantFailure("VerificationPlan collections are invalid or over budget.")
	}
	if err := validatePlanPartitionRevisions(plan.TargetPartitionRevisions); err != nil {
		return err
	}
	cellIDs := make(map[string]struct{}, len(plan.Cells))
	for index, cell := range plan.Cells {
		if err := validateVerificationPlanCell(cell); err != nil {
			return err
		}
		if _, duplicate := cellIDs[cell.ID]; duplicate {
			return attemptGrantFailure("VerificationPlan contains duplicate cell identity.")
		}
		cellIDs[cell.ID] = struct{}{}
		if index > 0 && compareVerificationPlanCells(plan.Cells[index-1], cell) >= 0 {
			return attemptGrantFailure("VerificationPlan cells are not canonical and unique.")
		}
	}
	for _, cell := range plan.Cells {
		for _, dependencyID := range cell.DependencyCellIDs {
			if _, exists := cellIDs[dependencyID]; !exists || dependencyID == cell.ID {
				return attemptGrantFailure("VerificationPlan dependency identity is invalid.")
			}
		}
	}
	if verificationPlanHasDependencyCycle(plan.Cells) {
		return attemptGrantFailure("VerificationPlan dependency graph contains a cycle.")
	}
	if err := validateVerificationPlanIssues(plan.Issues, cellIDs); err != nil {
		return err
	}
	if err := validateVerificationPlanExplanations(plan.Explanations, cellIDs); err != nil {
		return err
	}
	return validateVerificationPlanBudget(plan)
}

func validatePlanPartitionRevisions(revisions PartitionRevisions) error {
	if !validRevision(revisions.WorkspaceRev) ||
		!validRevision(revisions.RouteRev) ||
		!validRevision(revisions.OpSeq) {
		return attemptGrantFailure("VerificationPlan partition revisions are invalid.")
	}
	for documentID, revision := range revisions.DocumentRevisions {
		if validateIdentifier(documentID, "plan.documentRevision") != nil ||
			!validRevision(revision.ContentRev) ||
			!validRevision(revision.MetaRev) {
			return attemptGrantFailure("VerificationPlan document revision is invalid.")
		}
	}
	return nil
}

func validateVerificationPlanCell(cell VerificationPlanCell) error {
	for name, value := range map[string]string{
		"cell.id":              cell.ID,
		"cell.checkId":         cell.CheckID,
		"cell.targetId":        cell.TargetID,
		"cell.frameworkTarget": cell.FrameworkTarget,
		"cell.viewport.id":     cell.Viewport.ID,
		"cell.adapter.id":      cell.Adapter.AdapterID,
		"cell.retryPolicy.id":  cell.RetryPolicy.ID,
	} {
		if validateIdentifier(value, name) != nil {
			return attemptGrantFailure("VerificationPlan cell identity is invalid.")
		}
	}
	if cell.ScenarioID != "" &&
		validateIdentifier(cell.ScenarioID, "cell.scenarioId") != nil {
		return attemptGrantFailure("VerificationPlan scenario identity is invalid.")
	}
	if !validCheckKind(cell.CheckKind) ||
		(cell.Requirement != "required" && cell.Requirement != "advisory") ||
		(cell.Surface != "preview" && cell.Surface != "export" && cell.Surface != "ci") ||
		(cell.BrowserEngine != "" && cell.BrowserEngine != "chromium" &&
			cell.BrowserEngine != "firefox" && cell.BrowserEngine != "webkit") ||
		(cell.ColorScheme != "light" && cell.ColorScheme != "dark") ||
		(cell.Motion != "full" && cell.Motion != "reduced") ||
		!localePattern.MatchString(cell.Locale) ||
		cell.Viewport.Width < 1 || cell.Viewport.Width > 16_384 ||
		cell.Viewport.Height < 1 || cell.Viewport.Height > 16_384 {
		return attemptGrantFailure("VerificationPlan cell matrix coordinate is invalid.")
	}
	if cell.TargetPolicy.Authority != "verification-policy" ||
		cell.TargetPolicy.SemanticTargetID != cell.TargetID ||
		!digestPattern.MatchString(cell.TargetPolicy.PolicyDigest) ||
		(cell.TargetPolicy.Capture != "allowed" &&
			cell.TargetPolicy.Capture != "masked" &&
			cell.TargetPolicy.Capture != "forbidden-sensitive") {
		return attemptGrantFailure("VerificationPlan cell target policy is invalid.")
	}
	if !digestPattern.MatchString(cell.Adapter.DescriptorDigest) ||
		!digestPattern.MatchString(cell.Adapter.ToolchainDigest) ||
		!digestPattern.MatchString(cell.Adapter.CapabilityDigest) ||
		!digestPattern.MatchString(cell.InputDigest) {
		return attemptGrantFailure("VerificationPlan cell digest identity is invalid.")
	}
	if err := validatePlanControlProfileRef(cell.ControlProfileRef); err != nil {
		return err
	}
	if err := validatePlanDocumentDigestRef(cell.FixtureSetRef); err != nil {
		return err
	}
	if err := validatePlanDocumentDigestRef(cell.BaselineSetRef); err != nil {
		return err
	}
	if err := validateSortedPlanIdentifiers(cell.PolicyRuleIDs, "policyRuleIds", 512); err != nil {
		return err
	}
	if err := validateSortedPlanIdentifiers(cell.AppliedExemptionIDs, "appliedExemptionIds", 512); err != nil {
		return err
	}
	if cell.RetryPolicy.MaximumAttempts < 1 ||
		cell.RetryPolicy.MaximumAttempts > 100 ||
		cell.RetryPolicy.StabilitySamples < 1 ||
		cell.RetryPolicy.StabilitySamples > cell.RetryPolicy.MaximumAttempts ||
		!cell.RetryPolicy.FreshFixtureNamespace ||
		len(cell.RetryPolicy.RetryableOutcomes) > 1 ||
		(len(cell.RetryPolicy.RetryableOutcomes) == 1 &&
			cell.RetryPolicy.RetryableOutcomes[0] != "infrastructure-error") {
		return attemptGrantFailure("VerificationPlan retry policy is invalid.")
	}
	if err := validatePlanEvidenceRequirements(cell.EvidenceRequirements); err != nil {
		return err
	}
	if cell.Resources == nil || len(cell.Resources) > 512 {
		return attemptGrantFailure("VerificationPlan resource list is invalid.")
	}
	for index, resource := range cell.Resources {
		if validateCanonicalText(resource.Key, "cell.resource.key", 512) != nil ||
			(resource.Mode != "shared" && resource.Mode != "exclusive") ||
			(index > 0 &&
				cell.Resources[index-1].Key >= resource.Key) {
			return attemptGrantFailure("VerificationPlan resources are not canonical.")
		}
	}
	if err := validatePlanInputKinds(cell.InputKinds); err != nil {
		return err
	}
	if err := validatePlanArtifactKinds(cell.ArtifactKinds); err != nil {
		return err
	}
	if cell.EstimatedCost.DurationMS < 0 ||
		cell.EstimatedCost.ArtifactBytes < 0 ||
		cell.EstimatedCost.ComputeUnits < 0 {
		return attemptGrantFailure("VerificationPlan estimated cost is invalid.")
	}
	if err := validatePlanPreflight(cell.Preflight); err != nil {
		return err
	}
	return validateSortedPlanIdentifiers(cell.DependencyCellIDs, "dependencyCellIds", 100_000)
}

func validatePlanControlProfileRef(reference VerificationPlanControlProfileRef) error {
	switch reference.Kind {
	case "workspace":
		if validateIdentifier(reference.DocumentID, "controlProfileRef.documentId") != nil ||
			reference.PresetID != "" ||
			(reference.Digest != "" && !digestPattern.MatchString(reference.Digest)) {
			return attemptGrantFailure("VerificationPlan control profile reference is invalid.")
		}
	case "preset":
		if validateIdentifier(reference.PresetID, "controlProfileRef.presetId") != nil ||
			reference.DocumentID != "" ||
			!digestPattern.MatchString(reference.Digest) {
			return attemptGrantFailure("VerificationPlan control profile reference is invalid.")
		}
	default:
		return attemptGrantFailure("VerificationPlan control profile reference is invalid.")
	}
	return nil
}

func validatePlanDocumentDigestRef(reference *VerificationPlanDocumentDigestRef) error {
	if reference == nil {
		return nil
	}
	if validateIdentifier(reference.DocumentID, "plan.documentDigestRef.documentId") != nil ||
		(reference.Digest != "" && !digestPattern.MatchString(reference.Digest)) {
		return attemptGrantFailure("VerificationPlan document digest reference is invalid.")
	}
	return nil
}

func validatePlanEvidenceRequirements(requirements VerificationPlanEvidenceRequirements) error {
	if requirements.AcceptedTrust == nil || len(requirements.AcceptedTrust) == 0 ||
		len(requirements.AcceptedTrust) > 4 ||
		requirements.MaximumAgeMS < 1 ||
		!requirements.RequireCompatibleIdentity ||
		requirements.RequiredArtifactKinds == nil ||
		len(requirements.RequiredArtifactKinds) > 11 {
		return attemptGrantFailure("VerificationPlan Evidence requirements are invalid.")
	}
	for index, trust := range requirements.AcceptedTrust {
		if !validPlanTrust(trust) ||
			(index > 0 && requirements.AcceptedTrust[index-1] >= trust) {
			return attemptGrantFailure("VerificationPlan accepted trust set is invalid.")
		}
	}
	for index, kind := range requirements.RequiredArtifactKinds {
		if !validPlanArtifactKind(kind) ||
			(index > 0 && requirements.RequiredArtifactKinds[index-1] >= kind) {
			return attemptGrantFailure("VerificationPlan required artifact set is invalid.")
		}
	}
	return nil
}

func validatePlanInputKinds(kinds []string) error {
	if kinds == nil || len(kinds) > 7 {
		return attemptGrantFailure("VerificationPlan input kinds are invalid.")
	}
	for index, kind := range kinds {
		switch kind {
		case "diagnostic-snapshot", "executable-snapshot", "scenario-program",
			"test-report", "baseline-set", "verification-profile",
			"security-observation-set":
		default:
			return attemptGrantFailure("VerificationPlan input kind is unsupported.")
		}
		if index > 0 && kinds[index-1] >= kind {
			return attemptGrantFailure("VerificationPlan input kinds are not canonical.")
		}
	}
	return nil
}

func validatePlanArtifactKinds(kinds []ArtifactKind) error {
	if kinds == nil || len(kinds) > 11 {
		return attemptGrantFailure("VerificationPlan artifact kinds are invalid.")
	}
	for index, kind := range kinds {
		if !validPlanArtifactKind(kind) ||
			(index > 0 && kinds[index-1] >= kind) {
			return attemptGrantFailure("VerificationPlan artifact kinds are not canonical.")
		}
	}
	return nil
}

func validPlanArtifactKind(kind ArtifactKind) bool {
	switch kind {
	case ArtifactScreenshot, ArtifactVisualDiff, ArtifactAccessibilityReport,
		ArtifactTrace, ArtifactNetworkSummary, ArtifactConsoleSummary,
		ArtifactCoverageSummary, ArtifactPerformanceProfile,
		ArtifactSecurityReport, ArtifactBuildLog, ArtifactReplayRecord:
		return true
	default:
		return false
	}
}

func validPlanTrust(trust TrustClass) bool {
	return trust == TrustLocalUnattested ||
		trust == TrustRemoteAttested ||
		trust == TrustCIAttested ||
		trust == TrustImported
}

func validatePlanPreflight(preflight VerificationPlanPreflight) error {
	switch preflight.Status {
	case "supported":
		if preflight.ReasonCode != "" || preflight.Message != "" {
			return attemptGrantFailure("Supported Plan preflight has rejection details.")
		}
	case "unsupported", "blocked", "not-applicable":
		if validateIdentifier(preflight.ReasonCode, "preflight.reasonCode") != nil ||
			validateCanonicalText(preflight.Message, "preflight.message", 4096) != nil {
			return attemptGrantFailure("VerificationPlan preflight rejection is invalid.")
		}
	default:
		return attemptGrantFailure("VerificationPlan preflight status is invalid.")
	}
	return nil
}

func validateSortedPlanIdentifiers(values []string, field string, maximum int) error {
	if values == nil || len(values) > maximum {
		return attemptGrantFailure("VerificationPlan " + field + " is invalid.")
	}
	for index, value := range values {
		if validateIdentifier(value, "plan."+field) != nil ||
			(index > 0 && values[index-1] >= value) {
			return attemptGrantFailure("VerificationPlan " + field + " is not canonical.")
		}
	}
	return nil
}

func verificationPlanHasDependencyCycle(cells []VerificationPlanCell) bool {
	byID := make(map[string]VerificationPlanCell, len(cells))
	for _, cell := range cells {
		byID[cell.ID] = cell
	}
	visiting := make(map[string]bool, len(cells))
	visited := make(map[string]bool, len(cells))
	var visit func(string) bool
	visit = func(cellID string) bool {
		if visiting[cellID] {
			return true
		}
		if visited[cellID] {
			return false
		}
		visiting[cellID] = true
		for _, dependencyID := range byID[cellID].DependencyCellIDs {
			if visit(dependencyID) {
				return true
			}
		}
		delete(visiting, cellID)
		visited[cellID] = true
		return false
	}
	for _, cell := range cells {
		if visit(cell.ID) {
			return true
		}
	}
	return false
}

func validateVerificationPlanIssues(
	issues []VerificationPlanIssue,
	cellIDs map[string]struct{},
) error {
	for index, issue := range issues {
		switch issue.Code {
		case "VER-2001", "VER-2002", "VER-3001", "VER-3002", "VER-3003", "VER-3004":
		default:
			return attemptGrantFailure("VerificationPlan issue code is invalid.")
		}
		if validateCanonicalText(issue.Message, "plan.issue.message", 4096) != nil ||
			(issue.CellID != "" && validateIdentifier(issue.CellID, "plan.issue.cellId") != nil) ||
			(issue.CheckID != "" && validateIdentifier(issue.CheckID, "plan.issue.checkId") != nil) ||
			issue.RelatedIDs == nil {
			return attemptGrantFailure("VerificationPlan issue identity is invalid.")
		}
		if issue.CellID != "" {
			if _, exists := cellIDs[issue.CellID]; !exists {
				return attemptGrantFailure("VerificationPlan issue references an unknown cell.")
			}
		}
		if err := validateSortedPlanIdentifiers(issue.RelatedIDs, "issue.relatedIds", 100_000); err != nil {
			return err
		}
		if index > 0 {
			previous := issues[index-1]
			if previous.Code > issue.Code ||
				(previous.Code == issue.Code && previous.CellID > issue.CellID) ||
				(previous.Code == issue.Code && previous.CellID == issue.CellID &&
					previous.CheckID > issue.CheckID) ||
				(previous.Code == issue.Code && previous.CellID == issue.CellID &&
					previous.CheckID == issue.CheckID && previous.Message >= issue.Message) {
				return attemptGrantFailure("VerificationPlan issues are not canonical.")
			}
		}
	}
	return nil
}

func validateVerificationPlanExplanations(
	explanations []VerificationPlanExplanation,
	cellIDs map[string]struct{},
) error {
	for index, explanation := range explanations {
		if validateIdentifier(explanation.CheckID, "plan.explanation.checkId") != nil ||
			validateIdentifier(explanation.TargetID, "plan.explanation.targetId") != nil ||
			(explanation.CellID != "" &&
				validateIdentifier(explanation.CellID, "plan.explanation.cellId") != nil) ||
			(explanation.ScenarioID != "" &&
				validateIdentifier(explanation.ScenarioID, "plan.explanation.scenarioId") != nil) ||
			explanation.ImpactPathIDs == nil || explanation.PolicyRuleIDs == nil ||
			explanation.Messages == nil {
			return attemptGrantFailure("VerificationPlan explanation identity is invalid.")
		}
		switch explanation.Status {
		case "selected", "forbidden", "not-applicable", "trimmed-advisory":
		default:
			return attemptGrantFailure("VerificationPlan explanation status is invalid.")
		}
		if explanation.CellID != "" {
			if _, exists := cellIDs[explanation.CellID]; !exists &&
				explanation.Status == "selected" {
				return attemptGrantFailure("Selected VerificationPlan explanation references an unknown cell.")
			}
		}
		if err := validateSortedPlanIdentifiers(explanation.ImpactPathIDs, "explanation.impactPathIds", 100_000); err != nil {
			return err
		}
		if err := validateSortedPlanIdentifiers(explanation.PolicyRuleIDs, "explanation.policyRuleIds", 512); err != nil {
			return err
		}
		for _, message := range explanation.Messages {
			if validateCanonicalText(message, "plan.explanation.message", 4096) != nil {
				return attemptGrantFailure("VerificationPlan explanation message is invalid.")
			}
		}
		if index > 0 {
			previous := explanations[index-1]
			if previous.CellID > explanation.CellID ||
				(previous.CellID == explanation.CellID && previous.CheckID > explanation.CheckID) ||
				(previous.CellID == explanation.CellID && previous.CheckID == explanation.CheckID &&
					previous.ScenarioID > explanation.ScenarioID) ||
				(previous.CellID == explanation.CellID && previous.CheckID == explanation.CheckID &&
					previous.ScenarioID == explanation.ScenarioID &&
					previous.TargetID > explanation.TargetID) ||
				(previous.CellID == explanation.CellID && previous.CheckID == explanation.CheckID &&
					previous.ScenarioID == explanation.ScenarioID &&
					previous.TargetID == explanation.TargetID &&
					previous.Status >= explanation.Status) {
				return attemptGrantFailure("VerificationPlan explanations are not canonical.")
			}
		}
	}
	return nil
}

func validateVerificationPlanBudget(plan VerificationPlanGrant) error {
	counts := VerificationPlanCheckKindCounts{}
	targets := make(map[string]struct{})
	browsers := make(map[string]struct{})
	var totalMS, artifactBytes, computeUnits, closureRecords int64
	for _, cell := range plan.Cells {
		switch cell.CheckKind {
		case "diagnostics":
			counts.Diagnostics++
		case "build":
			counts.Build++
		case "unit":
			counts.Unit++
		case "integration":
			counts.Integration++
		case "e2e":
			counts.E2E++
		case "visual":
			counts.Visual++
		case "accessibility":
			counts.Accessibility++
		case "performance":
			counts.Performance++
		case "security":
			counts.Security++
		}
		targets[cell.TargetID+"\x00"+cell.FrameworkTarget] = struct{}{}
		if cell.BrowserEngine != "" {
			browsers[cell.BrowserEngine] = struct{}{}
		}
		totalMS += cell.EstimatedCost.DurationMS
		artifactBytes += cell.EstimatedCost.ArtifactBytes
		computeUnits += cell.EstimatedCost.ComputeUnits
		closureRecords += cell.RetryPolicy.MaximumAttempts
	}
	budget := plan.Budget
	if budget.Cells != int64(len(plan.Cells)) ||
		budget.CellsByCheckKind != counts ||
		budget.TargetExpansions != int64(len(targets)) ||
		budget.BrowserExpansions != int64(len(browsers)) ||
		budget.ClosureEvidenceRecords != closureRecords ||
		budget.TotalMS != totalMS ||
		budget.ArtifactBytes != artifactBytes ||
		budget.EstimatedComputeUnits != computeUnits ||
		budget.MaximumParallelism < 1 ||
		budget.MaximumParallelism > 1024 {
		return attemptGrantFailure("VerificationPlan budget summary is not derived from its cells.")
	}
	for index, dimension := range budget.OverBudgetDimensions {
		switch dimension {
		case "maximumCells", "maximumCellsPerCheckKind", "maximumTargetExpansions",
			"maximumBrowserExpansions", "maximumClosureEvidenceRecords", "totalMs",
			"artifactBytes", "estimatedComputeUnits":
		default:
			return attemptGrantFailure("VerificationPlan budget dimension is invalid.")
		}
		if index > 0 && budget.OverBudgetDimensions[index-1] >= dimension {
			return attemptGrantFailure("VerificationPlan budget dimensions are not canonical.")
		}
	}
	return nil
}
