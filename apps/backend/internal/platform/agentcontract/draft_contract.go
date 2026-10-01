package agentcontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf16"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type AiDraftPlanWireDTO struct {
	Goal        string                    `json:"goal"`
	Assumptions []string                  `json:"assumptions"`
	Milestones  []AiDraftMilestoneWireDTO `json:"milestones"`
}
type AiDraftMilestoneWireDTO struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
}

// DecodeAiDraftPlan mirrors @prodivix/ai's admission-only plan codec at the HTTP boundary.
func DecodeAiDraftPlan(raw []byte) (AiDraftPlanWireDTO, error) {
	fail := errors.New("AI draft output failed plan-only validation")
	if err := canonicaljson.ValidateRaw(raw, 262_144); err != nil {
		return AiDraftPlanWireDTO{}, fail
	}
	var value map[string]any
	if json.Unmarshal(raw, &value) != nil || requireExactObjectKeys(value, []string{"goal", "assumptions", "milestones"}, nil) != nil {
		return AiDraftPlanWireDTO{}, fail
	}
	if milestones, ok := value["milestones"].([]any); ok {
		for _, item := range milestones {
			milestone, ok := item.(map[string]any)
			if !ok || requireExactObjectKeys(milestone, []string{"id", "title"}, []string{"description"}) != nil {
				return AiDraftPlanWireDTO{}, fail
			}
			if description, exists := milestone["description"]; exists {
				if _, ok := description.(string); !ok {
					return AiDraftPlanWireDTO{}, fail
				}
			}
		}
	}
	var plan AiDraftPlanWireDTO
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&plan); err != nil || !draftBoundedText(plan.Goal, 16_384) || plan.Assumptions == nil || len(plan.Assumptions) > 64 || plan.Milestones == nil || len(plan.Milestones) > 64 {
		return AiDraftPlanWireDTO{}, fail
	}
	for _, value := range plan.Assumptions {
		if !draftBoundedText(value, 4096) {
			return AiDraftPlanWireDTO{}, fail
		}
	}
	ids := map[string]bool{}
	for _, milestone := range plan.Milestones {
		if !draftBoundedText(milestone.ID, 256) || ids[milestone.ID] || !draftBoundedText(milestone.Title, 4096) || (milestone.Description != nil && !draftBoundedText(*milestone.Description, 16_384)) {
			return AiDraftPlanWireDTO{}, fail
		}
		ids[milestone.ID] = true
	}
	return plan, nil
}

func draftBoundedText(value string, maximum int) bool {
	return value != "" && strings.TrimSpace(value) == value && len(utf16.Encode([]rune(value))) <= maximum
}
