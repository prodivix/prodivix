package verification

import "encoding/json"

// DecodeVerificationRunSnapshotWire exposes the owner codec for service adapters
// that must bind a decoded Run identity to another durable authorization.
func DecodeVerificationRunSnapshotWire(payload json.RawMessage) (VerificationRunSnapshotWire, []byte, error) {
	return decodeVerificationRunSnapshotWire(payload)
}

func DecodeVerificationPlanWire(payload json.RawMessage) (VerificationPlanGrant, []byte, error) {
	return decodeVerificationPlanWire(payload)
}
func DecodeVerificationRunEventWire(payload json.RawMessage) (VerificationRunEventWire, []byte, error) {
	return decodeVerificationRunEventWire(payload)
}
