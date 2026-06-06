package pircontract

import "encoding/json"
import "fmt"

const (
	CurrentVersion = "1.3"
	CurrentLabel   = "v" + CurrentVersion
	UIGraphVersion = 1

	LegacyDocumentOpenMessage = "This project uses a legacy PIR document and cannot be opened in " + CurrentLabel + "."
)

var defaultDocumentJSON = fmt.Sprintf(
	`{"version":"%s","ui":{"graph":{"version":%d,"rootId":"root","nodesById":{"root":{"id":"root","type":"container"}},"childIdsById":{"root":[]}}}}`,
	CurrentVersion,
	UIGraphVersion,
)

func DefaultDocument() json.RawMessage {
	return json.RawMessage(defaultDocumentJSON)
}
