package workspace

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

type routeManifestWireValidator struct {
	issue *RouteManifestValidationIssue
}

var routeManifestAllowedKeys = map[string]struct{}{
	"version": {},
	"root":    {},
	"modules": {},
	"mounts":  {},
}

var routeNodeAllowedKeys = map[string]struct{}{
	"id":             {},
	"segment":        {},
	"index":          {},
	"layoutDocId":    {},
	"pageDocId":      {},
	"outletNodeId":   {},
	"outletBindings": {},
	"runtime":        {},
	"children":       {},
}

var routeOutletBindingAllowedKeys = map[string]struct{}{
	"outletNodeId": {},
	"pageDocId":    {},
}

var routeRuntimeAllowedKeys = map[string]struct{}{
	"loaderRef": {},
	"actionRef": {},
	"guardRef":  {},
}

var routeCodeReferenceAllowedKeys = map[string]struct{}{
	"artifactId": {},
	"exportName": {},
	"symbolId":   {},
}

var routeModuleAllowedKeys = map[string]struct{}{
	"moduleId": {},
	"version":  {},
	"root":     {},
}

var routeMountAllowedKeys = map[string]struct{}{
	"mountId":           {},
	"moduleRef":         {},
	"mountPath":         {},
	"parentRouteNodeId": {},
}

func validateRouteManifestWireSchema(payload json.RawMessage) error {
	var value any
	if err := json.Unmarshal(payload, &value); err != nil {
		return err
	}
	validator := &routeManifestWireValidator{}
	manifest, ok := validator.requireObject(value, "/")
	if !ok {
		return validator.err()
	}
	validator.assertAllowedKeys(manifest, routeManifestAllowedKeys, "/")
	validator.requireCanonicalString(manifest, "version", "/version")
	if root, exists := manifest["root"]; !exists {
		validator.fail("/root", "Route manifest root is required.")
	} else {
		validator.validateNode(root, "/root")
	}
	if rawModules, exists := manifest["modules"]; exists {
		modules, valid := validator.requireObject(rawModules, "/modules")
		if valid {
			moduleIDs := sortedAnyMapKeys(modules)
			for _, moduleID := range moduleIDs {
				modulePath := "/modules/" + escapeJSONPointerToken(moduleID)
				validator.requireCanonicalMapKey(moduleID, modulePath)
				validator.validateModule(moduleID, modules[moduleID], modulePath)
			}
		}
	}
	if rawMounts, exists := manifest["mounts"]; exists {
		mounts, valid := validator.requireArray(rawMounts, "/mounts")
		if valid {
			for index, mount := range mounts {
				validator.validateMount(mount, fmt.Sprintf("/mounts/%d", index))
			}
		}
	}
	return validator.err()
}

func (validator *routeManifestWireValidator) validateNode(value any, path string) {
	node, ok := validator.requireObject(value, path)
	if !ok {
		return
	}
	validator.assertAllowedKeys(node, routeNodeAllowedKeys, path)
	validator.requireCanonicalString(node, "id", path+"/id")
	validator.optionalString(node, "segment", path+"/segment")
	validator.optionalBoolean(node, "index", path+"/index")
	validator.optionalCanonicalString(node, "layoutDocId", path+"/layoutDocId")
	validator.optionalCanonicalString(node, "pageDocId", path+"/pageDocId")
	validator.optionalCanonicalString(node, "outletNodeId", path+"/outletNodeId")
	if rawBindings, exists := node["outletBindings"]; exists {
		bindings, valid := validator.requireObject(rawBindings, path+"/outletBindings")
		if valid {
			for _, name := range sortedAnyMapKeys(bindings) {
				bindingPath := path + "/outletBindings/" + escapeJSONPointerToken(name)
				validator.requireCanonicalMapKey(name, bindingPath)
				validator.validateOutletBinding(bindings[name], bindingPath)
			}
		}
	}
	if rawRuntime, exists := node["runtime"]; exists {
		validator.validateRuntime(rawRuntime, path+"/runtime")
	}
	if rawChildren, exists := node["children"]; exists {
		children, valid := validator.requireArray(rawChildren, path+"/children")
		if valid {
			for index, child := range children {
				validator.validateNode(child, fmt.Sprintf("%s/children/%d", path, index))
			}
		}
	}
}

func (validator *routeManifestWireValidator) validateOutletBinding(value any, path string) {
	binding, ok := validator.requireObject(value, path)
	if !ok {
		return
	}
	validator.assertAllowedKeys(binding, routeOutletBindingAllowedKeys, path)
	validator.requireCanonicalString(binding, "outletNodeId", path+"/outletNodeId")
	validator.optionalCanonicalString(binding, "pageDocId", path+"/pageDocId")
}

func (validator *routeManifestWireValidator) validateRuntime(value any, path string) {
	runtime, ok := validator.requireObject(value, path)
	if !ok {
		return
	}
	validator.assertAllowedKeys(runtime, routeRuntimeAllowedKeys, path)
	for _, name := range []string{"loaderRef", "actionRef", "guardRef"} {
		if reference, exists := runtime[name]; exists {
			validator.validateCodeReference(reference, path+"/"+name)
		}
	}
}

func (validator *routeManifestWireValidator) validateCodeReference(value any, path string) {
	reference, ok := validator.requireObject(value, path)
	if !ok {
		return
	}
	validator.assertAllowedKeys(reference, routeCodeReferenceAllowedKeys, path)
	validator.requireCanonicalString(reference, "artifactId", path+"/artifactId")
	validator.optionalCanonicalString(reference, "exportName", path+"/exportName")
	validator.optionalCanonicalString(reference, "symbolId", path+"/symbolId")
}

func (validator *routeManifestWireValidator) validateModule(moduleKey string, value any, path string) {
	module, ok := validator.requireObject(value, path)
	if !ok {
		return
	}
	validator.assertAllowedKeys(module, routeModuleAllowedKeys, path)
	moduleID, valid := validator.requireCanonicalString(module, "moduleId", path+"/moduleId")
	if valid && moduleID != moduleKey {
		validator.fail(path+"/moduleId", "Route module key must match moduleId.")
	}
	validator.requireCanonicalString(module, "version", path+"/version")
	if root, exists := module["root"]; !exists {
		validator.fail(path+"/root", "Route module root is required.")
	} else {
		validator.validateNode(root, path+"/root")
	}
}

func (validator *routeManifestWireValidator) validateMount(value any, path string) {
	mount, ok := validator.requireObject(value, path)
	if !ok {
		return
	}
	validator.assertAllowedKeys(mount, routeMountAllowedKeys, path)
	validator.requireCanonicalString(mount, "mountId", path+"/mountId")
	validator.requireCanonicalString(mount, "moduleRef", path+"/moduleRef")
	validator.optionalString(mount, "mountPath", path+"/mountPath")
	validator.optionalCanonicalString(mount, "parentRouteNodeId", path+"/parentRouteNodeId")
}

func (validator *routeManifestWireValidator) assertAllowedKeys(
	value map[string]any,
	allowed map[string]struct{},
	path string,
) {
	for _, key := range sortedAnyMapKeys(value) {
		if _, exists := allowed[key]; !exists {
			validator.fail(joinJSONPointer(path, key), "Unknown route manifest field.")
			return
		}
	}
}

func (validator *routeManifestWireValidator) requireObject(value any, path string) (map[string]any, bool) {
	if validator.issue != nil {
		return nil, false
	}
	object, ok := value.(map[string]any)
	if !ok {
		validator.fail(path, "Expected an object.")
		return nil, false
	}
	return object, true
}

func (validator *routeManifestWireValidator) requireArray(value any, path string) ([]any, bool) {
	if validator.issue != nil {
		return nil, false
	}
	array, ok := value.([]any)
	if !ok {
		validator.fail(path, "Expected an array.")
		return nil, false
	}
	return array, true
}

func (validator *routeManifestWireValidator) requireCanonicalString(
	value map[string]any,
	key string,
	path string,
) (string, bool) {
	raw, exists := value[key]
	if !exists {
		validator.fail(path, "Expected a non-empty string.")
		return "", false
	}
	result, ok := raw.(string)
	if !ok || strings.TrimSpace(result) == "" {
		validator.fail(path, "Expected a non-empty string.")
		return "", false
	}
	if result != strings.TrimSpace(result) {
		validator.fail(path, "Route identifiers must not have leading or trailing whitespace.")
		return "", false
	}
	return result, true
}

func (validator *routeManifestWireValidator) optionalCanonicalString(value map[string]any, key string, path string) {
	if _, exists := value[key]; !exists {
		return
	}
	validator.requireCanonicalString(value, key, path)
}

func (validator *routeManifestWireValidator) optionalString(value map[string]any, key string, path string) {
	raw, exists := value[key]
	if !exists {
		return
	}
	if _, ok := raw.(string); !ok {
		validator.fail(path, "Expected a string.")
	}
}

func (validator *routeManifestWireValidator) optionalBoolean(value map[string]any, key string, path string) {
	raw, exists := value[key]
	if !exists {
		return
	}
	if _, ok := raw.(bool); !ok {
		validator.fail(path, "Expected a boolean.")
	}
}

func (validator *routeManifestWireValidator) requireCanonicalMapKey(value string, path string) {
	if strings.TrimSpace(value) == "" {
		validator.fail(path, "Route map keys must be non-empty.")
		return
	}
	if value != strings.TrimSpace(value) {
		validator.fail(path, "Route map keys must not have leading or trailing whitespace.")
	}
}

func (validator *routeManifestWireValidator) fail(path string, message string) {
	if validator.issue != nil {
		return
	}
	issue := routeManifestIssue("RTE-0006", "", path, message, "")
	validator.issue = &issue
}

func (validator *routeManifestWireValidator) err() error {
	if validator.issue == nil {
		return nil
	}
	return &RouteManifestValidationError{Issues: []RouteManifestValidationIssue{*validator.issue}}
}

func routeManifestWireError(path string, message string) error {
	return &RouteManifestValidationError{Issues: []RouteManifestValidationIssue{
		routeManifestIssue("RTE-0006", "", path, message, ""),
	}}
}

func sortedAnyMapKeys(value map[string]any) []string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func escapeJSONPointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func joinJSONPointer(path string, token string) string {
	if path == "/" {
		return "/" + escapeJSONPointerToken(token)
	}
	return path + "/" + escapeJSONPointerToken(token)
}
