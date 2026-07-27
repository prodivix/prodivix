package behaviorcontract

import (
	"encoding/json"
	"errors"
	"fmt"
)

type behaviorScenarioSemanticDocument struct {
	Steps         []behaviorSemanticStep `json:"steps"`
	TimeoutPolicy struct {
		TotalMS  int64 `json:"totalMs"`
		StepMS   int64 `json:"stepMs"`
		SettleMS int64 `json:"settleMs"`
	} `json:"timeoutPolicy"`
}

type behaviorSemanticStep struct {
	ID                 string                      `json:"id"`
	Kind               string                      `json:"kind"`
	Steps              []behaviorSemanticStep      `json:"steps"`
	Assertions         []behaviorSemanticAssertion `json:"assertions"`
	ParticipantStepIDs []string                    `json:"participantStepIds"`
}

type behaviorSemanticAssertion struct {
	ID              string `json:"id"`
	Operator        string `json:"operator"`
	CodeReferenceID string `json:"codeReferenceId"`
}

type behaviorFixtureSetSemanticDocument struct {
	Fixtures []struct {
		ID string `json:"id"`
	} `json:"fixtures"`
}

type behaviorBarrierReference struct {
	stepID       string
	participants []string
}

func validateDocumentSemantics(documentType string, payload json.RawMessage) error {
	switch documentType {
	case "behavior-scenario":
		return validateScenarioSemantics(payload)
	case "behavior-fixture-set":
		return validateFixtureSetSemantics(payload)
	default:
		return nil
	}
}

func validateScenarioSemantics(payload json.RawMessage) error {
	var scenario behaviorScenarioSemanticDocument
	if err := json.Unmarshal(payload, &scenario); err != nil {
		return err
	}
	stepIDs := make(map[string]struct{})
	assertionIDs := make(map[string]struct{})
	barriers := make([]behaviorBarrierReference, 0)
	var visit func([]behaviorSemanticStep) error
	visit = func(steps []behaviorSemanticStep) error {
		for _, step := range steps {
			if _, exists := stepIDs[step.ID]; exists {
				return fmt.Errorf("duplicate BehaviorStep id: %s", step.ID)
			}
			stepIDs[step.ID] = struct{}{}
			for _, assertion := range step.Assertions {
				if _, exists := assertionIDs[assertion.ID]; exists {
					return fmt.Errorf("duplicate Behavior assertion id: %s", assertion.ID)
				}
				assertionIDs[assertion.ID] = struct{}{}
				if assertion.Operator == "custom" && assertion.CodeReferenceID == "" {
					return errors.New("custom Behavior assertions require a CodeReference id")
				}
			}
			if step.Kind == "parallel" {
				if err := visit(step.Steps); err != nil {
					return err
				}
			}
			if step.Kind == "barrier" {
				barriers = append(barriers, behaviorBarrierReference{
					stepID:       step.ID,
					participants: step.ParticipantStepIDs,
				})
			}
		}
		return nil
	}
	if err := visit(scenario.Steps); err != nil {
		return err
	}
	for _, barrier := range barriers {
		for _, participantID := range barrier.participants {
			if participantID == barrier.stepID {
				return fmt.Errorf("barrier %s cannot reference itself", barrier.stepID)
			}
			if _, exists := stepIDs[participantID]; !exists {
				return fmt.Errorf("barrier %s references unknown BehaviorStep %s", barrier.stepID, participantID)
			}
		}
	}
	if scenario.TimeoutPolicy.StepMS > scenario.TimeoutPolicy.TotalMS {
		return errors.New("Behavior step timeout cannot exceed the Scenario total timeout")
	}
	if scenario.TimeoutPolicy.SettleMS > scenario.TimeoutPolicy.TotalMS {
		return errors.New("Behavior settle timeout cannot exceed the Scenario total timeout")
	}
	return nil
}

func validateFixtureSetSemantics(payload json.RawMessage) error {
	var fixtureSet behaviorFixtureSetSemanticDocument
	if err := json.Unmarshal(payload, &fixtureSet); err != nil {
		return err
	}
	ids := make(map[string]struct{}, len(fixtureSet.Fixtures))
	for _, fixture := range fixtureSet.Fixtures {
		if _, exists := ids[fixture.ID]; exists {
			return fmt.Errorf("duplicate Behavior fixture id: %s", fixture.ID)
		}
		ids[fixture.ID] = struct{}{}
	}
	return nil
}
