package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"math/big"
	"time"
)

type EvaluationBudgetReservationRecord struct {
	NamespaceID    string
	PlanDigest     string
	ReservationID  string
	LedgerRevision int64
	DemandDigest   string
	DemandBytes    []byte
	ReservedAt     time.Time
}

type EvaluationBudgetSettlementRecord struct {
	NamespaceID      string
	PlanDigest       string
	ReservationID    string
	LedgerRevision   int64
	SettlementDigest string
	SettlementBytes  []byte
	SettledAt        time.Time
}

func (repository *Repository) ReserveEvaluationBudget(
	ctx context.Context,
	authority EvaluationAuthority,
	planDigest string,
	reservationID string,
	expectedRevision int64,
	demandBytes []byte,
	reservedAt time.Time,
) (EvaluationBudgetReservationRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	if planDigest == "" || reservationID == "" || expectedRevision < 0 {
		return EvaluationBudgetReservationRecord{}, false, ErrInvalid
	}
	demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
	if err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	reservedAt = reservedAt.UTC().Truncate(time.Millisecond)
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var revision int64
	var planBytes []byte
	var planPlannedAt time.Time
	var planExpiresAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT ledger.revision, plan.plan_bytes, plan.planned_at, plan.expires_at
		FROM agent_evaluation_budget_ledgers ledger
		JOIN agent_evaluation_plans plan
		  ON plan.namespace_id = ledger.namespace_id AND plan.plan_digest = ledger.plan_digest
		WHERE ledger.namespace_id = $1 AND ledger.plan_digest = $2
		FOR UPDATE OF ledger`, authority.NamespaceID, planDigest).Scan(&revision, &planBytes, &planPlannedAt, &planExpiresAt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationBudgetReservationRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	if reservedAt.Before(planPlannedAt) || !reservedAt.Before(planExpiresAt) {
		return EvaluationBudgetReservationRecord{}, false, conflict("evaluation budget reservation is outside the frozen plan window")
	}
	var existing EvaluationBudgetReservationRecord
	existing.NamespaceID, existing.PlanDigest, existing.ReservationID = authority.NamespaceID, planDigest, reservationID
	err = tx.QueryRowContext(ctx, `SELECT ledger_revision, demand_digest, demand_bytes, reserved_at
		FROM agent_evaluation_budget_reservations
		WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3`,
		authority.NamespaceID, planDigest, reservationID).Scan(
		&existing.LedgerRevision, &existing.DemandDigest, &existing.DemandBytes, &existing.ReservedAt,
	)
	if err == nil {
		if !bytes.Equal(existing.DemandBytes, demand.Canonical) || !existing.ReservedAt.Equal(reservedAt) {
			return EvaluationBudgetReservationRecord{}, false, conflict("evaluation budget reservation identity was reused")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationBudgetReservationRecord{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	if revision != expectedRevision {
		return EvaluationBudgetReservationRecord{}, false, conflict("evaluation budget reservation revision is stale")
	}
	ceiling, err := decodeEvaluationBudget(planBytes)
	if err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	utilization, err := loadEvaluationBudgetUtilization(ctx, tx, authority.NamespaceID, planDigest)
	if err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	if candidate := addEvaluationBudgetDemand(utilization, demand); !evaluationDemandWithin(candidate, ceiling) {
		return EvaluationBudgetReservationRecord{}, false, conflict("evaluation budget reservation exceeds a hard ceiling")
	}
	nextRevision := revision + 1
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_reservations (
		namespace_id, plan_digest, reservation_id, ledger_revision, demand_digest,
		demand_json, demand_bytes, reserved_at
	) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, authority.NamespaceID,
		planDigest, reservationID, nextRevision, demand.Digest, string(demand.Canonical), demand.Canonical, reservedAt); err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	update, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_budget_ledgers
		SET revision = $3, updated_at = $4
		WHERE namespace_id = $1 AND plan_digest = $2 AND revision = $5`,
		authority.NamespaceID, planDigest, nextRevision, reservedAt, revision)
	if err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	if affected, err := update.RowsAffected(); err != nil || affected != 1 {
		return EvaluationBudgetReservationRecord{}, false, conflict("evaluation budget reservation CAS was lost")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationBudgetReservationRecord{}, false, err
	}
	return EvaluationBudgetReservationRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: planDigest, ReservationID: reservationID,
		LedgerRevision: nextRevision, DemandDigest: demand.Digest, DemandBytes: demand.Canonical, ReservedAt: reservedAt,
	}, false, nil
}

func (repository *Repository) SettleEvaluationBudget(
	ctx context.Context,
	authority EvaluationAuthority,
	planDigest string,
	reservationID string,
	expectedRevision int64,
	settlementBytes []byte,
) (EvaluationBudgetSettlementRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	if planDigest == "" || reservationID == "" || expectedRevision < 0 {
		return EvaluationBudgetSettlementRecord{}, false, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var revision int64
	if err := tx.QueryRowContext(ctx, `SELECT revision FROM agent_evaluation_budget_ledgers
		WHERE namespace_id = $1 AND plan_digest = $2 FOR UPDATE`, authority.NamespaceID, planDigest).Scan(&revision); errors.Is(err, sql.ErrNoRows) {
		return EvaluationBudgetSettlementRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	var existing EvaluationBudgetSettlementRecord
	existing.NamespaceID, existing.PlanDigest, existing.ReservationID = authority.NamespaceID, planDigest, reservationID
	err = tx.QueryRowContext(ctx, `SELECT ledger_revision, settlement_digest, settlement_bytes, settled_at
		FROM agent_evaluation_budget_settlements
		WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3`,
		authority.NamespaceID, planDigest, reservationID).Scan(
		&existing.LedgerRevision, &existing.SettlementDigest, &existing.SettlementBytes, &existing.SettledAt,
	)
	if err == nil {
		if !bytes.Equal(existing.SettlementBytes, settlementBytes) {
			return EvaluationBudgetSettlementRecord{}, false, conflict("evaluation budget settlement identity was reused")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationBudgetSettlementRecord{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	if revision != expectedRevision {
		return EvaluationBudgetSettlementRecord{}, false, conflict("evaluation budget settlement revision is stale")
	}
	var demandSource []byte
	var reservedAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT demand_bytes, reserved_at
		FROM agent_evaluation_budget_reservations
		WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3`,
		authority.NamespaceID, planDigest, reservationID).Scan(&demandSource, &reservedAt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationBudgetSettlementRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	demand, err := decodeEvaluationBudgetDemand(demandSource, true)
	if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	settlement, err := decodeEvaluationBudgetSettlement(settlementBytes, demand, reservedAt)
	if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	nextRevision := revision + 1
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_budget_settlements (
		namespace_id, plan_digest, reservation_id, ledger_revision, settlement_digest,
		settlement_json, settlement_bytes, settled_at
	) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, authority.NamespaceID,
		planDigest, reservationID, nextRevision, settlement.Digest, string(settlement.Canonical), settlement.Canonical, settlement.SettledAt); err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	update, err := tx.ExecContext(ctx, `UPDATE agent_evaluation_budget_ledgers
		SET revision = $3, updated_at = $4
		WHERE namespace_id = $1 AND plan_digest = $2 AND revision = $5`, authority.NamespaceID,
		planDigest, nextRevision, settlement.SettledAt, revision)
	if err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	if affected, err := update.RowsAffected(); err != nil || affected != 1 {
		return EvaluationBudgetSettlementRecord{}, false, conflict("evaluation budget settlement CAS was lost")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationBudgetSettlementRecord{}, false, err
	}
	return EvaluationBudgetSettlementRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: planDigest, ReservationID: reservationID,
		LedgerRevision: nextRevision, SettlementDigest: settlement.Digest,
		SettlementBytes: settlement.Canonical, SettledAt: settlement.SettledAt,
	}, false, nil
}

func loadEvaluationBudgetUtilization(ctx context.Context, tx *sql.Tx, namespaceID, planDigest string) (evaluationBudgetDemand, error) {
	rows, err := tx.QueryContext(ctx, `SELECT reservation.demand_bytes, settlement.settlement_bytes
		FROM agent_evaluation_budget_reservations reservation
		LEFT JOIN agent_evaluation_budget_settlements settlement
		  ON settlement.namespace_id = reservation.namespace_id
		 AND settlement.plan_digest = reservation.plan_digest
		 AND settlement.reservation_id = reservation.reservation_id
		WHERE reservation.namespace_id = $1 AND reservation.plan_digest = $2
		ORDER BY reservation.reservation_id`, namespaceID, planDigest)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	defer rows.Close()
	utilization := evaluationBudgetDemand{Usage: map[string]*big.Rat{}, Cost: map[string]*big.Rat{}}
	for rows.Next() {
		var demandBytes []byte
		var settlementBytes []byte
		if err := rows.Scan(&demandBytes, &settlementBytes); err != nil {
			return evaluationBudgetDemand{}, err
		}
		demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
		if err != nil {
			return evaluationBudgetDemand{}, err
		}
		charged := demand
		if len(settlementBytes) > 0 {
			settlement, err := decodeEvaluationBudgetSettlement(settlementBytes, demand, time.Time{})
			if err != nil {
				return evaluationBudgetDemand{}, err
			}
			charged = settlement.Charged
		}
		utilization = addEvaluationBudgetDemand(utilization, charged)
	}
	return utilization, rows.Err()
}
