package database

// agentEvaluationHostedV6Migration is the upgrade boundary for the current
// hosted lifecycle journal, v46 eligibility, and v46 publication roots. v45
// remains a historical migration input, while fresh and already-v45 schemas
// both cross this independently recorded boundary.
func agentEvaluationHostedV6Migration() migration {
	result := migration{
		version: 46,
		name:    "g4-agent-evaluation-hosted-lifecycle-v6",
	}
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6Statements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupPhysicalStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ConstraintStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ReconciliationStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6PartialCleanupConstraintStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6ArchiveStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6TransportStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6RecoveryReadStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6UnfinishedDiscoveryStatements()...)
	result.statements = append(result.statements, agentEvaluationV46EligibilityStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6BudgetStatements()...)
	result.statements = append(result.statements, agentEvaluationArchiveV46RootStatements()...)
	result.statements = append(result.statements,
		agentEvaluationHostedRetrievalRuntimeResourceLifecycleV6HealthStatements()...)
	return result
}
