package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/nodegraphcontract"
)

var ErrNodeGraphValidationFailed = errors.New("NodeGraph validation failed")

var defaultNodeGraphDocument = json.RawMessage(`{"version":2,"nodes":[],"edges":[]}`)

type nodeGraphWireDocument struct {
	Nodes          []nodeGraphWireNode          `json:"nodes"`
	Edges          []nodeGraphWireEdge          `json:"edges"`
	PublicContract *nodeGraphWirePublicContract `json:"publicContract"`
}

type nodeGraphWireNode struct {
	ID            string                        `json:"id"`
	DescriptorRef nodeGraphWireDescriptorRef    `json:"descriptorRef"`
	Ports         []nodeGraphWirePort           `json:"ports"`
	Configuration map[string]json.RawMessage    `json:"configuration"`
	CodeSlot      *nodeGraphWireCodeSlotBinding `json:"codeSlot"`
}

type nodeGraphWireDescriptorRef struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

type nodeGraphWirePort struct {
	ID          string `json:"id"`
	Direction   string `json:"direction"`
	Flow        string `json:"flow"`
	TypeRef     string `json:"typeRef"`
	Required    bool   `json:"required"`
	Cardinality string `json:"cardinality"`
}

type nodeGraphWireCodeSlotBinding struct {
	SlotID    string                     `json:"slotId"`
	Reference nodeGraphWireCodeReference `json:"reference"`
}

type nodeGraphWireCodeReference struct {
	ArtifactID string                   `json:"artifactId"`
	SourceSpan *nodeGraphWireSourceSpan `json:"sourceSpan"`
}

type nodeGraphWireSourceSpan struct {
	ArtifactID string `json:"artifactId"`
}

type nodeGraphWirePortReference struct {
	NodeID string `json:"nodeId"`
	PortID string `json:"portId"`
}

type nodeGraphWireEdge struct {
	ID     string                     `json:"id"`
	Source nodeGraphWirePortReference `json:"source"`
	Target nodeGraphWirePortReference `json:"target"`
}

type nodeGraphWirePublicPort struct {
	ID       string                     `json:"id"`
	Port     nodeGraphWirePortReference `json:"port"`
	TypeRef  string                     `json:"typeRef"`
	Required bool                       `json:"required"`
}

type nodeGraphWirePublicContract struct {
	Inputs  []nodeGraphWirePublicPort `json:"inputs"`
	Outputs []nodeGraphWirePublicPort `json:"outputs"`
}

type nodeGraphResolvedPort struct {
	nodeID string
	port   nodeGraphWirePort
}

func nodeGraphPortIdentity(reference nodeGraphWirePortReference) string {
	return reference.NodeID + "\x00" + reference.PortID
}

func validateNodeGraphDocument(payload json.RawMessage) error {
	if err := nodegraphcontract.ValidateDocument(payload); err != nil {
		return nodeGraphValidationError("%v", err)
	}

	var document nodeGraphWireDocument
	if err := json.Unmarshal(payload, &document); err != nil {
		return nodeGraphValidationError("/ must be a NodeGraph document")
	}

	nodesByID := make(map[string]nodeGraphWireNode, len(document.Nodes))
	portsByIdentity := make(map[string]nodeGraphResolvedPort)
	codeSlotIDs := make(map[string]struct{})
	for nodeIndex, node := range document.Nodes {
		path := fmt.Sprintf("/nodes/%d", nodeIndex)
		if _, duplicate := nodesByID[node.ID]; duplicate {
			return nodeGraphValidationError("%s duplicates node id %q", path+"/id", node.ID)
		}
		nodesByID[node.ID] = node

		portIDs := make(map[string]struct{}, len(node.Ports))
		for portIndex, port := range node.Ports {
			if _, duplicate := portIDs[port.ID]; duplicate {
				return nodeGraphValidationError(
					"%s duplicates port id %q",
					fmt.Sprintf("%s/ports/%d/id", path, portIndex),
					port.ID,
				)
			}
			portIDs[port.ID] = struct{}{}
			identity := nodeGraphPortIdentity(nodeGraphWirePortReference{
				NodeID: node.ID,
				PortID: port.ID,
			})
			portsByIdentity[identity] = nodeGraphResolvedPort{
				nodeID: node.ID,
				port:   port,
			}
		}

		if node.CodeSlot != nil {
			if _, duplicate := codeSlotIDs[node.CodeSlot.SlotID]; duplicate {
				return nodeGraphValidationError(
					"%s duplicates code slot id %q",
					path+"/codeSlot/slotId",
					node.CodeSlot.SlotID,
				)
			}
			codeSlotIDs[node.CodeSlot.SlotID] = struct{}{}
			if node.CodeSlot.Reference.SourceSpan != nil &&
				node.CodeSlot.Reference.SourceSpan.ArtifactID != node.CodeSlot.Reference.ArtifactID {
				return nodeGraphValidationError(
					"%s must use the referenced artifact",
					path+"/codeSlot/reference/sourceSpan/artifactId",
				)
			}
		}
		if node.DescriptorRef.ID == "core.code" {
			if _, embedded := node.Configuration["code"]; embedded {
				return nodeGraphValidationError(
					"%s must bind source through codeSlot",
					path+"/configuration/code",
				)
			}
			if _, embedded := node.Configuration["codeLanguage"]; embedded {
				return nodeGraphValidationError(
					"%s must bind source through codeSlot",
					path+"/configuration/codeLanguage",
				)
			}
		}
	}

	edgeIDs := make(map[string]struct{}, len(document.Edges))
	connections := make(map[string]int)
	exactConnections := make(map[string]struct{})
	for edgeIndex, edge := range document.Edges {
		path := fmt.Sprintf("/edges/%d", edgeIndex)
		if _, duplicate := edgeIDs[edge.ID]; duplicate {
			return nodeGraphValidationError("%s duplicates edge id %q", path+"/id", edge.ID)
		}
		edgeIDs[edge.ID] = struct{}{}

		sourceIdentity := nodeGraphPortIdentity(edge.Source)
		targetIdentity := nodeGraphPortIdentity(edge.Target)
		source, sourceExists := portsByIdentity[sourceIdentity]
		if !sourceExists {
			return nodeGraphValidationError("%s references unknown output port", path+"/source")
		}
		target, targetExists := portsByIdentity[targetIdentity]
		if !targetExists {
			return nodeGraphValidationError("%s references unknown input port", path+"/target")
		}
		if source.port.Direction != "output" ||
			target.port.Direction != "input" ||
			source.port.Flow != target.port.Flow ||
			(source.port.Flow == "data" && source.port.TypeRef != target.port.TypeRef) {
			return nodeGraphValidationError("%s connects incompatible exact ports", path)
		}
		exactIdentity := sourceIdentity + "\x00" + targetIdentity
		if _, duplicate := exactConnections[exactIdentity]; duplicate {
			return nodeGraphValidationError("%s duplicates an exact port connection", path)
		}
		exactConnections[exactIdentity] = struct{}{}
		connections[sourceIdentity]++
		connections[targetIdentity]++
	}

	for nodeIndex, node := range document.Nodes {
		for portIndex, port := range node.Ports {
			count := connections[nodeGraphPortIdentity(nodeGraphWirePortReference{
				NodeID: node.ID,
				PortID: port.ID,
			})]
			path := fmt.Sprintf("/nodes/%d/ports/%d", nodeIndex, portIndex)
			if port.Cardinality == "single" && count > 1 {
				return nodeGraphValidationError("%s exceeds single cardinality", path)
			}
			if port.Direction == "input" && port.Required && count == 0 {
				return nodeGraphValidationError("%s requires a connection", path)
			}
		}
	}

	if document.PublicContract != nil {
		publicIDs := make(map[string]struct{})
		if err := validateNodeGraphPublicPorts(
			document.PublicContract.Inputs,
			"input",
			portsByIdentity,
			publicIDs,
			"/publicContract/inputs",
		); err != nil {
			return err
		}
		if err := validateNodeGraphPublicPorts(
			document.PublicContract.Outputs,
			"output",
			portsByIdentity,
			publicIDs,
			"/publicContract/outputs",
		); err != nil {
			return err
		}
	}
	return nil
}

func validateNodeGraphPublicPorts(
	publicPorts []nodeGraphWirePublicPort,
	direction string,
	portsByIdentity map[string]nodeGraphResolvedPort,
	publicIDs map[string]struct{},
	path string,
) error {
	for index, publicPort := range publicPorts {
		itemPath := fmt.Sprintf("%s/%d", path, index)
		if _, duplicate := publicIDs[publicPort.ID]; duplicate {
			return nodeGraphValidationError("%s duplicates public port id %q", itemPath+"/id", publicPort.ID)
		}
		publicIDs[publicPort.ID] = struct{}{}
		port, exists := portsByIdentity[nodeGraphPortIdentity(publicPort.Port)]
		if !exists ||
			port.port.Direction != direction ||
			port.port.Flow != "data" ||
			port.port.TypeRef != publicPort.TypeRef {
			return nodeGraphValidationError("%s does not match an exact %s data port", itemPath+"/port", direction)
		}
	}
	return nil
}

func decodeNodeGraphCanonicalString(payload json.RawMessage, path string) (string, error) {
	var value string
	if err := json.Unmarshal(payload, &value); err != nil || value == "" || value != strings.TrimSpace(value) {
		return "", nodeGraphValidationError("%s must be a canonical non-empty string", path)
	}
	return value, nil
}

func isJSONObject(payload json.RawMessage) bool {
	trimmed := bytes.TrimSpace(payload)
	return len(trimmed) > 1 && trimmed[0] == '{'
}

func isJSONArray(payload json.RawMessage) bool {
	trimmed := bytes.TrimSpace(payload)
	return len(trimmed) > 1 && trimmed[0] == '['
}

func nodeGraphValidationError(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrNodeGraphValidationFailed, fmt.Sprintf(format, args...))
}
