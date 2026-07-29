import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  type NormalizedWorkspaceVerificationCompileProfile,
} from '#src/workspace/workspaceVerificationProbeContract';

/** Generates the framework-neutral, read-only browser probe module body. */
export const createWorkspaceVerificationProbeRuntimeSource = (
  profile: NormalizedWorkspaceVerificationCompileProfile,
  manifestDigest: string
): string => {
  const manifest = canonicalJsonText({
    manifestDigest,
    profileDigest: profile.profileDigest,
    scenarioProgramDigest: profile.scenarioProgramDigest,
    semanticSnapshotDigest: profile.semanticSnapshotDigest,
    targets: profile.targets,
    workspaceRevision: profile.workspaceRevision,
  });
  return `const PROBE_ENDPOINT = ${JSON.stringify(WORKSPACE_VERIFICATION_PROBE_ENDPOINT)};
const PROBE_CANARY = ${JSON.stringify(WORKSPACE_VERIFICATION_PROBE_CANARY)};
const manifest = ${manifest} as const;

type ProbeReadiness = 'document-ready' | 'mounted' | 'visible' | 'enabled';
type ProbeTarget = Readonly<{
  targetId: string;
  readiness: readonly ProbeReadiness[];
  sourceRef: Readonly<{
    workspaceDocumentId: string;
    path: string;
  }>;
  instanceScope?: Readonly<{
    kind: 'collection-item';
    id: string;
  }>;
}>;

const targets: readonly ProbeTarget[] = Object.freeze(
  manifest.targets.map((target) => {
    const instanceScope =
      'instanceScope' in target ? target.instanceScope : undefined;
    return Object.freeze({
      targetId: target.targetId,
      readiness: Object.freeze([...target.readiness]),
      sourceRef: Object.freeze({ ...target.sourceRef }),
      ...(instanceScope === undefined
        ? {}
        : { instanceScope: Object.freeze({ ...instanceScope }) }),
    });
  })
);
const targetById = new Map(targets.map((target) => [target.targetId, target]));

const decodePointerSegment = (value: string) =>
  value.replace(/~1/gu, '/').replace(/~0/gu, '~');

const nodeIdFor = (target: ProbeTarget): string | undefined => {
  const segments = target.sourceRef.path.slice(1).split('/');
  const encodedNodeId =
    segments[0] === 'nodesById'
      ? segments[1]
      : segments[0] === 'ui' &&
          segments[1] === 'graph' &&
          segments[2] === 'nodesById'
        ? segments[3]
        : undefined;
  return encodedNodeId ? decodePointerSegment(encodedNodeId) : undefined;
};

const collectionItemPathSuffix = (id: string): string => {
  const keyIdentity = \`key/6:string/\${id.length}:\${id}\`;
  return \`/\${keyIdentity.length}:\${keyIdentity}\`;
};

const targetElements = (target: ProbeTarget): readonly Element[] => {
  if (typeof document === 'undefined') return Object.freeze([]);
  const nodeId = nodeIdFor(target);
  if (!nodeId) return Object.freeze([]);
  return Object.freeze(
    Array.from(document.getElementsByTagName('*')).filter(
      (element) =>
        element.getAttribute('data-pir-document-id') ===
          target.sourceRef.workspaceDocumentId &&
        element.getAttribute('data-pir-node-id') === nodeId &&
        (target.instanceScope === undefined ||
          element
            .getAttribute('data-pir-instance-path')
            ?.endsWith(collectionItemPathSuffix(target.instanceScope.id)) ===
            true)
    )
  );
};

const elementIsVisible = (element: Element): boolean => {
  if (
    element.hasAttribute('hidden') ||
    element.getAttribute('aria-hidden') === 'true'
  ) {
    return false;
  }
  const style = globalThis.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    element.getClientRects().length > 0
  );
};

const elementIsEnabled = (element: Element): boolean => {
  if (
    element.getAttribute('aria-disabled') === 'true' ||
    ('disabled' in element &&
      Boolean((element as Element & { disabled?: boolean }).disabled))
  ) {
    return false;
  }
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute('inert')) return false;
    current = current.parentElement;
  }
  return true;
};

const readTarget = (target: ProbeTarget) => {
  const elements = targetElements(target);
  const singleElement = elements.length === 1 ? elements[0] : undefined;
  const state = Object.freeze({
    documentReady:
      typeof document !== 'undefined' && document.readyState !== 'loading',
    match:
      elements.length === 0
        ? ('none' as const)
        : elements.length === 1
          ? ('single' as const)
          : ('multiple' as const),
    mounted: elements.length > 0,
    visible: singleElement ? elementIsVisible(singleElement) : false,
    enabled: singleElement ? elementIsEnabled(singleElement) : false,
  });
  const readinessValue = (condition: ProbeReadiness): boolean => {
    switch (condition) {
      case 'document-ready':
        return state.documentReady;
      case 'mounted':
        return state.mounted;
      case 'visible':
        return state.visible;
      case 'enabled':
        return state.enabled;
    }
  };
  return Object.freeze({
    targetId: target.targetId,
    ready: target.readiness.every(readinessValue),
    readiness: target.readiness,
    state,
    sourceTrace: target.sourceRef,
    ...(target.instanceScope === undefined
      ? {}
      : { instanceScope: target.instanceScope }),
  });
};

if (Object.prototype.hasOwnProperty.call(globalThis, PROBE_ENDPOINT)) {
  throw new Error('VERIFICATION_PROBE_ENDPOINT_OCCUPIED');
}

const probe = Object.freeze({
  canary: PROBE_CANARY,
  profile: Object.freeze({
    workspaceRevision: manifest.workspaceRevision,
    profileDigest: manifest.profileDigest,
    scenarioProgramDigest: manifest.scenarioProgramDigest,
    semanticSnapshotDigest: manifest.semanticSnapshotDigest,
    manifestDigest: manifest.manifestDigest,
  }),
  listTargets: () =>
    Object.freeze(
      targets.map((target) =>
        Object.freeze({
          targetId: target.targetId,
          readiness: target.readiness,
          sourceTrace: target.sourceRef,
          ...(target.instanceScope === undefined
            ? {}
            : { instanceScope: target.instanceScope }),
        })
      )
    ),
  readTarget: (targetId: string) => {
    const target = targetById.get(targetId);
    return target ? readTarget(target) : undefined;
  },
});

Object.defineProperty(globalThis, PROBE_ENDPOINT, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: probe,
});

export {};
`;
};
