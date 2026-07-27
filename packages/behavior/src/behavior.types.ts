export type BehaviorJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly BehaviorJsonValue[]
  | { readonly [key: string]: BehaviorJsonValue };

export type BehaviorDocumentDigestRef = Readonly<{
  documentId: string;
  digest?: string;
}>;

export type BehaviorControlProfileRef =
  | Readonly<{
      kind: 'workspace';
      documentId: string;
      digest?: string;
    }>
  | Readonly<{
      kind: 'preset';
      presetId: string;
      digest: string;
    }>;

export type BehaviorSemanticTargetRef = Readonly<{
  kind:
    | 'diagnostic-target'
    | 'semantic-symbol'
    | 'public-contract'
    | 'verification-target';
  id: string;
  workspaceDocumentId: string;
  capability: string;
  instanceScope?: Readonly<{
    kind: 'component-instance' | 'collection-item' | 'route-instance';
    id: string;
  }>;
}>;

export type BehaviorSourceRef = Readonly<{
  workspaceDocumentId: string;
  path: string;
}>;

export type BehaviorTrigger = Readonly<{
  id: string;
  domain:
    | 'route'
    | 'pir'
    | 'data'
    | 'nodegraph'
    | 'animation'
    | 'auth'
    | 'server'
    | 'scenario';
  event: string;
  target?: BehaviorSemanticTargetRef;
}>;

export type BehaviorAction = Readonly<{
  kind:
    | 'navigate'
    | 'semantic-click'
    | 'semantic-input'
    | 'dispatch-data-operation'
    | 'invoke-nodegraph'
    | 'control-animation'
    | 'update-temporary-state'
    | 'invoke-code-slot'
    | 'wait-observation';
  target: BehaviorSemanticTargetRef;
  input?: BehaviorJsonValue;
  capabilityId: string;
  runtimeZone: 'client' | 'server' | 'test';
  effect: 'none' | 'read' | 'write';
  cancellation: 'none' | 'cooperative' | 'required';
}>;

export type BehaviorObservation = Readonly<{
  kind:
    | 'route'
    | 'visible'
    | 'enabled'
    | 'value'
    | 'data-lifecycle'
    | 'network-absence'
    | 'console-absence'
    | 'nodegraph-output'
    | 'animation-state'
    | 'composition-result'
    | 'composition-marker'
    | 'accessible-tree'
    | 'visual-baseline'
    | 'code-assertion';
  target: BehaviorSemanticTargetRef;
  expected?: BehaviorJsonValue;
}>;

export type BehaviorAssertion = Readonly<{
  id: string;
  operator:
    | 'equals'
    | 'not-equals'
    | 'contains'
    | 'matches-schema'
    | 'absent'
    | 'custom';
  expected?: BehaviorJsonValue;
  codeReferenceId?: string;
}>;

export type BehaviorStepMetadata = Readonly<{
  label?: string;
  source?: BehaviorSourceRef;
  failureMode: 'stop' | 'collect-and-stop' | 'advisory';
}>;

export type BehaviorStep = BehaviorStepMetadata &
  (
    | Readonly<{
        id: string;
        kind: 'action';
        action: BehaviorAction;
      }>
    | Readonly<{
        id: string;
        kind: 'observation';
        observation: BehaviorObservation;
        assertions: readonly BehaviorAssertion[];
      }>
    | Readonly<{
        id: string;
        kind: 'parallel';
        steps: readonly BehaviorStep[];
      }>
    | Readonly<{
        id: string;
        kind: 'barrier';
        participantStepIds: readonly string[];
        observation?: BehaviorObservation;
      }>
  );

export type BehaviorTimeoutPolicy = Readonly<{
  totalMs: number;
  stepMs: number;
  settleMs: number;
}>;

export type BehaviorScenario = Readonly<{
  id: string;
  name: string;
  description?: string;
  owner?: Readonly<{ principalId: string }>;
  criticality: 'smoke' | 'standard' | 'critical';
  tags: readonly string[];
  entry: BehaviorTrigger;
  steps: readonly BehaviorStep[];
  fixtureRefs: readonly BehaviorDocumentDigestRef[];
  controlProfileRef: BehaviorControlProfileRef;
  baselineRefs: readonly BehaviorDocumentDigestRef[];
  timeoutPolicy: BehaviorTimeoutPolicy;
}>;

export type BehaviorControlProfile = Readonly<{
  id: string;
  name: string;
  clock: Readonly<{
    mode: 'virtual';
    epoch: string;
    tickMs: number;
  }>;
  timezone: string;
  random: Readonly<{
    algorithm: string;
    seed: string;
  }>;
  identifiers: Readonly<{
    seed: string;
    namespaces: readonly ('attempt' | 'step' | 'action' | 'operation')[];
  }>;
  scheduler: Readonly<{
    strategy: 'deterministic';
    seed: string;
    maximumTurns: number;
  }>;
  network: Readonly<{
    mode: 'fixture-only' | 'isolated-live-read';
    undeclaredRequest: 'reject';
  }>;
  storage: Readonly<{
    bootstrapFixtureIds: readonly string[];
    cleanup: 'required';
  }>;
  rendering: Readonly<{
    devicePixelRatio: number;
    animationClock: 'virtual';
    fontReadiness: 'required' | 'bounded';
  }>;
  serviceWorker: Readonly<{
    mode: 'disabled' | 'isolated';
    cache: 'empty' | 'fixture';
  }>;
  settle: Readonly<{
    conditions: readonly (
      | 'render-stable'
      | 'declared-effects-complete'
      | 'font-ready'
      | 'animation-marker'
      | 'barrier'
    )[];
    maximumFrames: number;
  }>;
  budgets: Readonly<{
    totalMs: number;
    stepMs: number;
    settleMs: number;
    networkMs: number;
    animationMs: number;
  }>;
}>;

export type BehaviorFixtureTarget = Readonly<{
  kind: 'data-operation' | 'server-function' | 'storage' | 'auth-session';
  resourceId: string;
}>;

export type BehaviorFixtureOutcome =
  | Readonly<{
      kind: 'result';
      value: BehaviorJsonValue;
    }>
  | Readonly<{
      kind: 'fault';
      fault: 'error' | 'timeout' | 'disconnect' | 'retry-after';
      delayMs?: number;
    }>;

export type BehaviorFixture = Readonly<{
  id: string;
  target: BehaviorFixtureTarget;
  inputDigest: string;
  attempt?: number;
  page?: string;
  outcome: BehaviorFixtureOutcome;
}>;

export type BehaviorFixtureSet = Readonly<{
  id: string;
  name: string;
  fixtures: readonly BehaviorFixture[];
}>;

export type BehaviorScenarioProgram = Readonly<{
  scenarioId: string;
  scenarioDigest: string;
  workspaceRevision: number;
  semanticSnapshotDigest: string;
  executableSnapshotDigest: string;
  compilerDigest: string;
  registryDigest: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  baselineSetDigests: readonly string[];
  requiredCapabilities: readonly string[];
  capabilityManifest: readonly Readonly<{
    capabilityId: string;
    descriptorKind: string;
    targetCapability: string;
    owner: string;
    runtimeZones: readonly ('client' | 'server' | 'test')[];
    effect: 'none' | 'read' | 'write';
    cancellation: 'none' | 'cooperative' | 'required';
  }>[];
  targetManifest: readonly Readonly<{
    targetId: string;
    semanticSymbolId: string;
    capability: string;
    source: BehaviorSourceRef;
    instanceScope?: BehaviorSemanticTargetRef['instanceScope'];
  }>[];
  instructions: readonly Readonly<{
    id: string;
    stepId: string;
    dependencyInstructionIds: readonly string[];
    operation: string;
    capabilityId?: string;
    targetId?: string;
    input?: BehaviorJsonValue;
  }>[];
  observations: readonly Readonly<{
    stepId: string;
    kind: BehaviorObservation['kind'];
    targetId: string;
    expected?: BehaviorJsonValue;
    assertionIds: readonly string[];
    assertions: readonly BehaviorAssertion[];
    automatonDigest: string;
  }>[];
  sourceTrace: readonly Readonly<{
    instructionId: string;
    source: BehaviorSourceRef;
  }>[];
  budgets: BehaviorTimeoutPolicy;
  programDigest: string;
}>;

export type BehaviorRecorderDraft = Readonly<{
  id: string;
  workspaceRevision: number;
  maximumEvents: number;
  truncatedEventCount: number;
  events: readonly Readonly<{
    id: string;
    resolution: 'resolved' | 'ambiguous' | 'unresolved' | 'sensitive';
    target?: BehaviorSemanticTargetRef;
    alternatives?: readonly BehaviorSemanticTargetRef[];
    confidence?: number;
    suggestedAction?: BehaviorAction;
  }>[];
}>;

export type BehaviorRegistryDescriptor = Readonly<{
  kind: string;
  owner: string;
  inputSchemaDigest: string;
  outputSchemaDigest: string;
  targetCapability: string;
  runtimeZones: readonly ('client' | 'server' | 'test')[];
  effect: 'none' | 'read' | 'write';
  cancellation: 'none' | 'cooperative' | 'required';
  determinism: 'deterministic' | 'controlled' | 'unsupported';
  sourceTraceResolverId: string;
  redactionPolicyId: string;
}>;

export type BehaviorRegistryContribution = Readonly<{
  contributorId: string;
  triggers: readonly BehaviorRegistryDescriptor[];
  actions: readonly BehaviorRegistryDescriptor[];
  observations: readonly BehaviorRegistryDescriptor[];
}>;

export type BehaviorDocumentKind =
  'behavior-scenario' | 'behavior-control-profile' | 'behavior-fixture-set';

export type BehaviorDocumentByKind = Readonly<{
  'behavior-scenario': BehaviorScenario;
  'behavior-control-profile': BehaviorControlProfile;
  'behavior-fixture-set': BehaviorFixtureSet;
}>;

export type BehaviorWireDocument<TCurrent> = TCurrent & {
  wireVersion: 1;
};

export type BehaviorDecodeIssue = Readonly<{
  code: 'BHV-1001';
  path: string;
  message: string;
}>;

export type BehaviorDecodeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly BehaviorDecodeIssue[] }>;
