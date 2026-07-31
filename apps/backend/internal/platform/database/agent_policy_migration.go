package database

func agentPolicyWorkspaceDocumentMigration() migration {
	return migration{
		version: 22,
		name:    "g4-agent-policy-workspace-document",
		statements: []string{
			`ALTER TABLE workspace_documents
			DROP CONSTRAINT IF EXISTS workspace_documents_type_check,
			ADD CONSTRAINT workspace_documents_type_check CHECK (doc_type IN ('pir-page', 'pir-layout', 'pir-component', 'pir-graph', 'pir-animation', 'design-tokens', 'design-token-resolver', 'code', 'data-source', 'behavior-scenario', 'behavior-control-profile', 'behavior-fixture-set', 'verification-policy', 'verification-baseline-set', 'agent-policy', 'asset', 'project-config'))`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_documents_single_agent_policy ON workspace_documents(workspace_id) WHERE doc_type = 'agent-policy'`,
		},
	}
}
