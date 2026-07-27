package workspace

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/animationcontract"
)

var ErrAnimationValidationFailed = errors.New("Animation validation failed")

type animationMarker struct {
	ID                      string `json:"id"`
	RequiredInReducedMotion bool   `json:"requiredInReducedMotion"`
}

type animationReducedMotion struct {
	Kind       string `json:"kind"`
	TimelineID string `json:"timelineId"`
}

type animationTimeline struct {
	ID            string                 `json:"id"`
	MotionIntent  string                 `json:"motionIntent"`
	ReducedMotion animationReducedMotion `json:"reducedMotion"`
	Markers       []animationMarker      `json:"markers"`
}

type animationCompositionNode struct {
	ID            string                     `json:"id"`
	Kind          string                     `json:"kind"`
	TimelineID    string                     `json:"timelineId"`
	CompositionID string                     `json:"compositionId"`
	MarkerID      string                     `json:"markerId"`
	Children      []animationCompositionNode `json:"children"`
	Full          *animationCompositionNode  `json:"full"`
	Reduced       *animationCompositionNode  `json:"reduced"`
}

type animationComposition struct {
	ID          string                    `json:"id"`
	Root        animationCompositionNode  `json:"root"`
	ReducedRoot *animationCompositionNode `json:"reducedRoot"`
}

type animationDocument struct {
	Timelines          []animationTimeline    `json:"timelines"`
	Compositions       []animationComposition `json:"compositions"`
	EntryCompositionID string                 `json:"entryCompositionId"`
}

func validateAnimationDocument(payload json.RawMessage) error {
	if err := animationcontract.ValidateDocument(payload); err != nil {
		return animationValidationError(
			"/ must satisfy the generated Animation current schema: %v",
			err,
		)
	}
	var document animationDocument
	if err := json.Unmarshal(payload, &document); err != nil {
		return animationValidationError("/ could not be decoded: %v", err)
	}

	timelines := make(map[string]animationTimeline, len(document.Timelines))
	markerIDs := make(map[string]struct{})
	for index, timeline := range document.Timelines {
		if _, duplicate := timelines[timeline.ID]; duplicate {
			return animationValidationError(
				"/timelines/%d/id duplicates timeline %q",
				index,
				timeline.ID,
			)
		}
		timelines[timeline.ID] = timeline
		for _, marker := range timeline.Markers {
			markerIDs[marker.ID] = struct{}{}
		}
	}
	for index, timeline := range document.Timelines {
		path := fmt.Sprintf("/timelines/%d/reducedMotion", index)
		if timeline.MotionIntent == "essential" &&
			timeline.ReducedMotion.Kind != "retain" &&
			timeline.ReducedMotion.Kind != "timeline-ref" {
			return animationValidationError(
				"%s essential motion requires an explicit reduced variant",
				path,
			)
		}
		if timeline.MotionIntent == "continuous" &&
			timeline.ReducedMotion.Kind == "retain" {
			return animationValidationError(
				"%s continuous motion cannot be retained in reduced mode",
				path,
			)
		}
		if timeline.ReducedMotion.Kind != "timeline-ref" {
			continue
		}
		reduced, exists := timelines[timeline.ReducedMotion.TimelineID]
		if !exists || reduced.ID == timeline.ID {
			return animationValidationError(
				"%s/timelineId must reference a different existing timeline",
				path,
			)
		}
		required := requiredAnimationMarkerIDs(timeline.Markers)
		reducedRequired := requiredAnimationMarkerIDs(reduced.Markers)
		if len(required) != len(reducedRequired) {
			return animationValidationError(
				"%s must preserve required marker identity and order",
				path,
			)
		}
		for markerIndex := range required {
			if required[markerIndex] != reducedRequired[markerIndex] {
				return animationValidationError(
					"%s must preserve required marker identity and order",
					path,
				)
			}
		}
	}

	compositions := make(
		map[string]animationComposition,
		len(document.Compositions),
	)
	for index, composition := range document.Compositions {
		if _, duplicate := compositions[composition.ID]; duplicate {
			return animationValidationError(
				"/compositions/%d/id duplicates composition %q",
				index,
				composition.ID,
			)
		}
		compositions[composition.ID] = composition
	}
	if document.EntryCompositionID != "" {
		if _, exists := compositions[document.EntryCompositionID]; !exists {
			return animationValidationError(
				"/entryCompositionId references a missing composition",
			)
		}
	}

	nodeIDs := make(map[string]struct{})
	references := make(map[string][]string, len(compositions))
	for _, composition := range document.Compositions {
		roots := []*animationCompositionNode{&composition.Root}
		if composition.ReducedRoot != nil {
			roots = append(roots, composition.ReducedRoot)
		}
		for _, root := range roots {
			collectAnimationCompositionMarkers(root, markerIDs)
		}
		for _, root := range roots {
			if err := validateAnimationCompositionNode(
				root,
				composition.ID,
				timelines,
				compositions,
				markerIDs,
				nodeIDs,
				references,
			); err != nil {
				return err
			}
		}
	}
	if err := validateAnimationCompositionCycles(compositions, references); err != nil {
		return err
	}
	return nil
}

func requiredAnimationMarkerIDs(markers []animationMarker) []string {
	ids := make([]string, 0, len(markers))
	for _, marker := range markers {
		if marker.RequiredInReducedMotion {
			ids = append(ids, marker.ID)
		}
	}
	return ids
}

func collectAnimationCompositionMarkers(
	node *animationCompositionNode,
	markerIDs map[string]struct{},
) {
	if node.Kind == "marker" {
		markerIDs[node.MarkerID] = struct{}{}
	}
	for index := range node.Children {
		collectAnimationCompositionMarkers(&node.Children[index], markerIDs)
	}
	if node.Full != nil {
		collectAnimationCompositionMarkers(node.Full, markerIDs)
	}
	if node.Reduced != nil {
		collectAnimationCompositionMarkers(node.Reduced, markerIDs)
	}
}

func validateAnimationCompositionNode(
	node *animationCompositionNode,
	ownerID string,
	timelines map[string]animationTimeline,
	compositions map[string]animationComposition,
	markerIDs map[string]struct{},
	nodeIDs map[string]struct{},
	references map[string][]string,
) error {
	if _, duplicate := nodeIDs[node.ID]; duplicate {
		return animationValidationError(
			"/compositions contains duplicate node id %q",
			node.ID,
		)
	}
	nodeIDs[node.ID] = struct{}{}
	switch node.Kind {
	case "timeline-ref":
		if _, exists := timelines[node.TimelineID]; !exists {
			return animationValidationError(
				"/compositions node %q references missing timeline %q",
				node.ID,
				node.TimelineID,
			)
		}
	case "composition-ref":
		if _, exists := compositions[node.CompositionID]; !exists {
			return animationValidationError(
				"/compositions node %q references missing composition %q",
				node.ID,
				node.CompositionID,
			)
		}
		references[ownerID] = append(references[ownerID], node.CompositionID)
	case "marker":
		markerIDs[node.MarkerID] = struct{}{}
	case "settle":
		if node.MarkerID != "" {
			if _, exists := markerIDs[node.MarkerID]; !exists {
				return animationValidationError(
					"/compositions settle node %q references missing marker %q",
					node.ID,
					node.MarkerID,
				)
			}
		}
	}
	for index := range node.Children {
		if err := validateAnimationCompositionNode(
			&node.Children[index],
			ownerID,
			timelines,
			compositions,
			markerIDs,
			nodeIDs,
			references,
		); err != nil {
			return err
		}
	}
	if node.Full != nil {
		if err := validateAnimationCompositionNode(
			node.Full,
			ownerID,
			timelines,
			compositions,
			markerIDs,
			nodeIDs,
			references,
		); err != nil {
			return err
		}
	}
	if node.Reduced != nil {
		if err := validateAnimationCompositionNode(
			node.Reduced,
			ownerID,
			timelines,
			compositions,
			markerIDs,
			nodeIDs,
			references,
		); err != nil {
			return err
		}
	}
	return nil
}

func validateAnimationCompositionCycles(
	compositions map[string]animationComposition,
	references map[string][]string,
) error {
	visiting := make(map[string]bool, len(compositions))
	visited := make(map[string]bool, len(compositions))
	var visit func(string) error
	visit = func(id string) error {
		if visiting[id] {
			return animationValidationError(
				"/compositions contains a reference cycle through %q",
				id,
			)
		}
		if visited[id] {
			return nil
		}
		visiting[id] = true
		for _, reference := range references[id] {
			if err := visit(reference); err != nil {
				return err
			}
		}
		visiting[id] = false
		visited[id] = true
		return nil
	}
	for id := range compositions {
		if err := visit(id); err != nil {
			return err
		}
	}
	return nil
}

func animationValidationError(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrAnimationValidationFailed, fmt.Sprintf(format, args...))
}
