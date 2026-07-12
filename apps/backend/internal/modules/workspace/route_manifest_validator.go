package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var ErrRouteManifestInvalid = errors.New("invalid route manifest")

type RouteManifestValidationIssue struct {
	Code        string `json:"code"`
	RouteNodeID string `json:"routeNodeId,omitempty"`
	Path        string `json:"path"`
	Message     string `json:"message"`
	ArtifactID  string `json:"artifactId,omitempty"`
}

type RouteManifestValidationError struct {
	Issues []RouteManifestValidationIssue
}

func (err *RouteManifestValidationError) Error() string {
	if err == nil || len(err.Issues) == 0 {
		return ErrRouteManifestInvalid.Error()
	}
	return fmt.Sprintf("%s: %s", ErrRouteManifestInvalid, err.Issues[0].Message)
}

func (err *RouteManifestValidationError) Is(target error) bool {
	return target == ErrRouteManifestInvalid
}

type routeManifestDocument struct {
	Version string                 `json:"version"`
	Root    *routeManifestNode     `json:"root"`
	Modules map[string]routeModule `json:"modules,omitempty"`
	Mounts  []routeModuleMount     `json:"mounts,omitempty"`
}

type routeModule struct {
	ModuleID string             `json:"moduleId"`
	Version  string             `json:"version"`
	Root     *routeManifestNode `json:"root"`
}

type routeModuleMount struct {
	MountID           string `json:"mountId"`
	ModuleRef         string `json:"moduleRef"`
	MountPath         string `json:"mountPath,omitempty"`
	ParentRouteNodeID string `json:"parentRouteNodeId,omitempty"`
}

type routeManifestNode struct {
	ID             string                        `json:"id"`
	Segment        string                        `json:"segment,omitempty"`
	Index          bool                          `json:"index,omitempty"`
	LayoutDocID    string                        `json:"layoutDocId,omitempty"`
	PageDocID      string                        `json:"pageDocId,omitempty"`
	OutletNodeID   string                        `json:"outletNodeId,omitempty"`
	OutletBindings map[string]routeOutletBinding `json:"outletBindings,omitempty"`
	Runtime        *routeRuntime                 `json:"runtime,omitempty"`
	Children       []routeManifestNode           `json:"children,omitempty"`
}

type routeOutletBinding struct {
	OutletNodeID string `json:"outletNodeId"`
	PageDocID    string `json:"pageDocId,omitempty"`
}

type routeRuntime struct {
	LoaderRef *routeCodeReference `json:"loaderRef,omitempty"`
	ActionRef *routeCodeReference `json:"actionRef,omitempty"`
	GuardRef  *routeCodeReference `json:"guardRef,omitempty"`
}

type routeCodeReference struct {
	ArtifactID string `json:"artifactId"`
	ExportName string `json:"exportName,omitempty"`
	SymbolID   string `json:"symbolId,omitempty"`
}

type routeSegmentValidation struct {
	Segment string
	Message string
}

func normalizeRouteManifestDocument(payload json.RawMessage) (json.RawMessage, error) {
	manifestJSON, err := normalizeJSONDocument(payload, defaultWorkspaceRouteManifest)
	if err != nil {
		return nil, err
	}
	if err := validateRouteManifestJSON(manifestJSON); err != nil {
		return nil, err
	}
	return manifestJSON, nil
}

// validateWorkspaceRouteDocumentReferences validates the cross-document roles
// that the RouteManifest wire schema cannot express on its own.
func validateWorkspaceRouteDocumentReferences(
	manifestJSON json.RawMessage,
	documents map[string]WorkspaceDocumentRecord,
) error {
	if err := validateRouteManifestJSON(manifestJSON); err != nil {
		return err
	}
	var manifest routeManifestDocument
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return err
	}
	validateDocument := func(
		routeNodeID string,
		path string,
		documentID string,
		allowed ...WorkspaceDocumentType,
	) error {
		if documentID == "" {
			return nil
		}
		document, exists := documents[documentID]
		if !exists {
			return &RouteManifestValidationError{Issues: []RouteManifestValidationIssue{
				routeManifestIssue(
					"RTE-5007",
					routeNodeID,
					path,
					fmt.Sprintf("Route references missing workspace document %s.", documentID),
					"",
				),
			}}
		}
		for _, documentType := range allowed {
			if document.Type == documentType {
				return nil
			}
		}
		return &RouteManifestValidationError{Issues: []RouteManifestValidationIssue{
			routeManifestIssue(
				"RTE-5008",
				routeNodeID,
				path,
				fmt.Sprintf("Route document %s has incompatible type %s.", documentID, document.Type),
				"",
			),
		}}
	}
	var validateNode func(*routeManifestNode, string) error
	validateNode = func(node *routeManifestNode, path string) error {
		if node == nil {
			return nil
		}
		if err := validateDocument(node.ID, path+"/layoutDocId", node.LayoutDocID, WorkspaceDocumentTypePIRLayout); err != nil {
			return err
		}
		if err := validateDocument(node.ID, path+"/pageDocId", node.PageDocID, WorkspaceDocumentTypePIRPage, WorkspaceDocumentTypePIRComponent); err != nil {
			return err
		}
		outletNames := make([]string, 0, len(node.OutletBindings))
		for outletName := range node.OutletBindings {
			outletNames = append(outletNames, outletName)
		}
		sort.Strings(outletNames)
		for _, outletName := range outletNames {
			binding := node.OutletBindings[outletName]
			if err := validateDocument(
				node.ID,
				path+"/outletBindings/"+escapeJSONPointerToken(outletName)+"/pageDocId",
				binding.PageDocID,
				WorkspaceDocumentTypePIRPage,
				WorkspaceDocumentTypePIRComponent,
			); err != nil {
				return err
			}
		}
		for index := range node.Children {
			if err := validateNode(&node.Children[index], fmt.Sprintf("%s/children/%d", path, index)); err != nil {
				return err
			}
		}
		return nil
	}
	if err := validateNode(manifest.Root, "/root"); err != nil {
		return err
	}
	moduleIDs := make([]string, 0, len(manifest.Modules))
	for moduleID := range manifest.Modules {
		moduleIDs = append(moduleIDs, moduleID)
	}
	sort.Strings(moduleIDs)
	for _, moduleID := range moduleIDs {
		module := manifest.Modules[moduleID]
		if err := validateNode(module.Root, "/modules/"+escapeJSONPointerToken(moduleID)+"/root"); err != nil {
			return err
		}
	}
	return nil
}

func validateRouteManifestJSON(payload json.RawMessage) error {
	if err := validateRouteManifestWireSchema(payload); err != nil {
		return err
	}
	var manifest routeManifestDocument
	if err := json.Unmarshal(payload, &manifest); err != nil {
		return routeManifestWireError("/", "Route manifest does not match the canonical wire schema.")
	}
	issues := validateRouteManifestDocument(manifest)
	if len(issues) > 0 {
		return &RouteManifestValidationError{Issues: issues}
	}
	return nil
}

// validateRouteManifestDocument applies graph-wide route invariants after the
// closed wire schema has been validated.
func validateRouteManifestDocument(manifest routeManifestDocument) []RouteManifestValidationIssue {
	var issues []RouteManifestValidationIssue
	if manifest.Version == "" {
		issues = append(issues, routeManifestIssue("RTE-0001", "", "/version", "Route manifest version is required.", ""))
	}
	if manifest.Root == nil {
		issues = append(issues, routeManifestIssue("RTE-0002", "", "/root", "Route manifest root is required.", ""))
		return issues
	}
	if manifest.Root.ID != "root" {
		issues = append(issues, routeManifestIssue("RTE-0003", manifest.Root.ID, "/root/id", "Route manifest root id must be root.", ""))
	}

	routeIDs := map[string]string{}
	walkRouteManifestNode(manifest.Root, "/root", routeIDs, &issues)

	moduleIDs := map[string]struct{}{}
	moduleKeys := make([]string, 0, len(manifest.Modules))
	for key := range manifest.Modules {
		moduleKeys = append(moduleKeys, key)
	}
	sort.Strings(moduleKeys)
	for _, key := range moduleKeys {
		module := manifest.Modules[key]
		modulePath := "/modules/" + key
		moduleID := module.ModuleID
		if moduleID == "" {
			issues = append(issues, routeManifestIssue("RTE-5002", "", modulePath+"/moduleId", "Route module moduleId is required.", ""))
		}
		if moduleID != "" && moduleID != key {
			issues = append(issues, routeManifestIssue("RTE-5002", "", modulePath+"/moduleId", "Route module key must match moduleId.", ""))
		}
		if _, exists := moduleIDs[moduleID]; moduleID != "" && exists {
			issues = append(issues, routeManifestIssue("RTE-5002", "", modulePath+"/moduleId", "Route module moduleId must be unique.", ""))
		}
		if moduleID != "" {
			moduleIDs[moduleID] = struct{}{}
		}
		if module.Version == "" {
			issues = append(issues, routeManifestIssue("RTE-5002", "", modulePath+"/version", "Route module version is required.", ""))
		}
		if module.Root == nil {
			issues = append(issues, routeManifestIssue("RTE-5003", "", modulePath+"/root", "Route module root is required.", ""))
			continue
		}
		walkRouteManifestNode(module.Root, modulePath+"/root", routeIDs, &issues)
	}

	mountIDs := map[string]struct{}{}
	for index, mount := range manifest.Mounts {
		mountPath := fmt.Sprintf("/mounts/%d", index)
		mountID := mount.MountID
		if mountID == "" {
			issues = append(issues, routeManifestIssue("RTE-5004", "", mountPath+"/mountId", "Route module mountId is required.", ""))
		}
		if _, exists := mountIDs[mountID]; mountID != "" && exists {
			issues = append(issues, routeManifestIssue("RTE-5004", "", mountPath+"/mountId", "Route module mountId must be unique.", ""))
		}
		if mountID != "" {
			mountIDs[mountID] = struct{}{}
		}
		if _, exists := manifest.Modules[mount.ModuleRef]; mount.ModuleRef == "" || !exists {
			issues = append(issues, routeManifestIssue("RTE-5005", "", mountPath+"/moduleRef", "Route module mount references a missing module.", ""))
		}
		parentRouteNodeID := mount.ParentRouteNodeID
		if parentRouteNodeID != "" {
			if _, exists := routeIDs[parentRouteNodeID]; !exists {
				issues = append(issues, routeManifestIssue("RTE-5006", parentRouteNodeID, mountPath+"/parentRouteNodeId", "Route module mount parentRouteNodeId is missing.", ""))
			}
		}
		if mount.MountPath != "" {
			if validation := validateRouteSegment(mount.MountPath); validation.Message != "" {
				issues = append(issues, routeManifestIssue("RTE-1010", "", mountPath+"/mountPath", validation.Message, ""))
			}
		}
	}

	return issues
}

func walkRouteManifestNode(
	node *routeManifestNode,
	path string,
	routeIDs map[string]string,
	issues *[]RouteManifestValidationIssue,
) {
	routeNodeID := node.ID
	if routeNodeID == "" {
		*issues = append(*issues, routeManifestIssue("RTE-0004", "", path+"/id", "Route node id is required.", ""))
	} else if previousPath, exists := routeIDs[routeNodeID]; exists {
		*issues = append(*issues, routeManifestIssue("RTE-0005", routeNodeID, path+"/id", "Route node id must be unique; first seen at "+previousPath+".", ""))
	} else {
		routeIDs[routeNodeID] = path
	}

	if node.Index && strings.TrimSpace(node.Segment) != "" {
		*issues = append(*issues, routeManifestIssue("RTE-1002", routeNodeID, path+"/segment", "Index routes cannot define a segment.", ""))
	}
	if !node.Index {
		if validation := validateRouteSegment(node.Segment); validation.Message != "" {
			*issues = append(*issues, routeManifestIssue("RTE-1010", routeNodeID, path+"/segment", validation.Message, ""))
		}
	}
	validateRouteRuntimeRefs(routeNodeID, path, node.Runtime, issues)

	siblingKeys := map[string]string{}
	for index := range node.Children {
		child := &node.Children[index]
		key := routeDuplicateKey(child)
		childPath := fmt.Sprintf("%s/children/%d", path, index)
		if previousRouteID, exists := siblingKeys[key]; exists {
			message := "Route " + routeNodeID + " cannot have duplicate child segment " + key + "."
			if key == "__index__" {
				message = "Route " + routeNodeID + " cannot have multiple index children."
			}
			*issues = append(*issues, routeManifestIssue("RTE-1001", child.ID, childPath, message+" Previous route: "+previousRouteID+".", ""))
		} else {
			siblingKeys[key] = child.ID
		}
		walkRouteManifestNode(child, childPath, routeIDs, issues)
	}
}

func validateRouteRuntimeRefs(
	routeNodeID string,
	path string,
	runtime *routeRuntime,
	issues *[]RouteManifestValidationIssue,
) {
	if runtime == nil {
		return
	}
	refs := map[string]*routeCodeReference{
		"loaderRef": runtime.LoaderRef,
		"actionRef": runtime.ActionRef,
		"guardRef":  runtime.GuardRef,
	}
	for name, ref := range refs {
		if ref == nil {
			continue
		}
		if strings.TrimSpace(ref.ArtifactID) == "" {
			*issues = append(*issues, routeManifestIssue("RTE-2010", routeNodeID, path+"/runtime/"+name+"/artifactId", "Route runtime references must point to a CodeArtifact.", ""))
		}
	}
}

func routeDuplicateKey(node *routeManifestNode) string {
	if node.Index {
		return "__index__"
	}
	validation := validateRouteSegment(node.Segment)
	if validation.Message != "" {
		return "__invalid__:" + strings.TrimSpace(node.ID)
	}
	return validation.Segment
}

func validateRouteSegment(input string) routeSegmentValidation {
	segment := strings.Trim(strings.TrimSpace(input), "/")
	if segment == "" {
		return routeSegmentValidation{Segment: ""}
	}
	pieces := strings.Split(segment, "/")
	for index, piece := range pieces {
		if strings.TrimSpace(piece) == "" {
			return routeSegmentValidation{Segment: segment, Message: "Route segment cannot contain empty path parts."}
		}
		if piece == "*" {
			if index != len(pieces)-1 {
				return routeSegmentValidation{Segment: segment, Message: "Wildcard route segment must be the last path part."}
			}
			continue
		}
		if strings.HasPrefix(piece, "*") {
			if strings.TrimSpace(strings.TrimPrefix(piece, "*")) == "" {
				return routeSegmentValidation{Segment: segment, Message: "Named wildcard route segment requires a parameter name."}
			}
			if index != len(pieces)-1 {
				return routeSegmentValidation{Segment: segment, Message: "Wildcard route segment must be the last path part."}
			}
			continue
		}
		if strings.HasPrefix(piece, ":") {
			if strings.TrimSpace(strings.TrimPrefix(piece, ":")) == "" {
				return routeSegmentValidation{Segment: segment, Message: "Dynamic route segment requires a parameter name."}
			}
			continue
		}
		if strings.HasPrefix(piece, "[...") && strings.HasSuffix(piece, "]") {
			if strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(piece, "[..."), "]")) == "" {
				return routeSegmentValidation{Segment: segment, Message: "Catch-all route segment requires a parameter name."}
			}
			if index != len(pieces)-1 {
				return routeSegmentValidation{Segment: segment, Message: "Catch-all route segment must be the last path part."}
			}
			continue
		}
		if strings.HasPrefix(piece, "[") && strings.HasSuffix(piece, "]") {
			if strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(piece, "["), "]")) == "" {
				return routeSegmentValidation{Segment: segment, Message: "Dynamic route segment requires a parameter name."}
			}
		}
	}
	return routeSegmentValidation{Segment: segment}
}

func routeManifestIssue(code string, routeNodeID string, path string, message string, artifactID string) RouteManifestValidationIssue {
	return RouteManifestValidationIssue{
		Code:        code,
		RouteNodeID: routeNodeID,
		Path:        path,
		Message:     message,
		ArtifactID:  artifactID,
	}
}
