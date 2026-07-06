export {
  registerNodeCapability as registerInspectorCapability,
  resolveNodeCapabilities as resolveInspectorCapabilities,
} from '@/pir/renderer/capabilities';

export type {
  NodeCapability as InspectorCapability,
  LinkCapability as LinkInspectorCapability,
  TriggerConflictPolicy,
} from '@/pir/renderer/capabilities';
