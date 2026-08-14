package database

import "fmt"

// agentEvaluationV46EligibilityStatements upgrades every production table
// consumed by the v46 repositories. Existing v45 rows are retained with a
// false v46 marker; all future inserts and mutable transitions require v46.
func agentEvaluationV46EligibilityStatements() []string {
	statements := []string{
		`SET LOCAL session_replication_role = 'replica'`,
		`CREATE OR REPLACE FUNCTION enforce_agent_evaluation_v46_current_row()
			RETURNS trigger AS $$
		BEGIN
			IF NEW.v46_eligible IS DISTINCT FROM TRUE
				OR (TG_OP='UPDATE' AND OLD.v46_eligible IS DISTINCT FROM TRUE) THEN
				RAISE EXCEPTION 'legacy evaluation row cannot enter the v46 production path'
					USING ERRCODE='23514';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql`,
	}
	tables := []string{
		"agent_evaluation_controlled_authority_requests",
		"agent_evaluation_attempt_authority_owner_receipts",
		"agent_evaluation_capability_effect_provider_journal_abandonments",
		"agent_evaluation_capability_effect_provider_journal_executions",
		"agent_evaluation_capability_effect_provider_journal_results",
		"agent_evaluation_capability_effect_provider_journal_stages",
		"agent_evaluation_capability_effect_source_consumption_claims",
		"agent_evaluation_capability_probe_provider_resource_cleanups",
		"agent_evaluation_capability_probe_provider_resource_registrations",
		"ae_hrrr_cleanup_archives",
		"ae_hrrr_registration_requests",
		"ae_hrrr_registration_results",
		"ae_hrrr_run_terminal_fences",
		"ae_hrrr_sets",
		"agent_evaluation_hosted_retrieval_runtime_resources",
		"agent_evaluation_native_optional_capability_bootstrap_sources",
		"agent_evaluation_native_provider_state_vault_records",
		"agent_evaluation_native_provider_state_vault_recoveries",
		"agent_evaluation_optional_capability_fact_sources",
		"agent_evaluation_optional_fact_authorities",
		"agent_evaluation_owner_state_cas_artifacts",
		"agent_evaluation_owner_state_operations",
		"agent_evaluation_owner_states",
		"agent_evaluation_provider_capability_observation_commit_links",
		"agent_evaluation_runtime_fact_source_owner_registrations",
	}
	for index, table := range tables {
		statements = append(statements,
			fmt.Sprintf(`ALTER TABLE %s ADD COLUMN IF NOT EXISTS v46_eligible BOOLEAN`, table),
			fmt.Sprintf(`UPDATE %s SET v46_eligible=FALSE WHERE v46_eligible IS NULL`, table),
			fmt.Sprintf(`ALTER TABLE %s
				ALTER COLUMN v46_eligible SET DEFAULT TRUE,
				ALTER COLUMN v46_eligible SET NOT NULL`, table),
			fmt.Sprintf(`CREATE TRIGGER agent_eval_v46_current_%02d
				BEFORE INSERT OR UPDATE ON %s
				FOR EACH ROW EXECUTE FUNCTION enforce_agent_evaluation_v46_current_row()`, index+1, table),
		)
	}
	statements = append(statements, `SET LOCAL session_replication_role = 'origin'`)
	return statements
}
