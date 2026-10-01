package database

func environmentRevisionModeMigration() migration {
	return migration{
		version: 48,
		name:    "execution-environment-revision-mode",
		statements: []string{
			`ALTER TABLE execution_environment_revisions ADD COLUMN mode TEXT CHECK (mode IN ('mock', 'live'))`,
			// Only the current revision has an authoritative mode in the legacy schema.
			// Historical nulls remain inaccessible instead of borrowing the latest mode.
			`UPDATE execution_environment_revisions r SET mode = e.mode FROM execution_environments e WHERE r.environment_id = e.id AND r.revision = e.current_revision`,
			`ALTER TABLE execution_environment_revisions ADD CONSTRAINT execution_environment_revision_mode_required CHECK (mode IS NOT NULL) NOT VALID`,
		},
	}
}
