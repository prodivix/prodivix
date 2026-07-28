export const WORKSPACE_DOCUMENT_TYPES = Object.freeze([
  'pir-page',
  'pir-layout',
  'pir-component',
  'pir-graph',
  'pir-animation',
  'design-tokens',
  'design-token-resolver',
  'code',
  'data-source',
  'behavior-scenario',
  'behavior-control-profile',
  'behavior-fixture-set',
  'verification-policy',
  'verification-baseline-set',
  'asset',
  'project-config',
] as const);

export type WorkspaceDocumentType = (typeof WORKSPACE_DOCUMENT_TYPES)[number];

export const WORKSPACE_COMMAND_DOMAINS = Object.freeze([
  'pir',
  'workspace',
  'route',
  'nodegraph',
  'animation',
  'token',
  'code',
  'data',
  'behavior',
  'verification',
  'resource',
] as const);

export type WorkspaceCommandDomain = (typeof WORKSPACE_COMMAND_DOMAINS)[number];

export type WorkspaceDocumentCommandDomain = Exclude<
  WorkspaceCommandDomain,
  'workspace' | 'route'
>;

export type WorkspaceDocumentPatchPolicy =
  | Readonly<{
      kind: 'roots';
      roots: readonly string[];
      extensionRootPrefixes?: readonly string[];
    }>
  | Readonly<{ kind: 'top-level' }>;

export type WorkspaceDocumentPolicy = Readonly<{
  domain: WorkspaceDocumentCommandDomain;
  patch: WorkspaceDocumentPatchPolicy;
  cardinality: 'single' | 'many';
}>;

const roots = (
  domain: WorkspaceDocumentCommandDomain,
  values: readonly string[],
  extensionRootPrefixes?: readonly string[],
  cardinality: 'single' | 'many' = 'many'
): WorkspaceDocumentPolicy =>
  Object.freeze({
    domain,
    cardinality,
    patch: Object.freeze({
      kind: 'roots',
      roots: Object.freeze([...values]),
      ...(extensionRootPrefixes
        ? {
            extensionRootPrefixes: Object.freeze([...extensionRootPrefixes]),
          }
        : {}),
    }),
  });

const topLevel = (
  domain: WorkspaceDocumentCommandDomain
): WorkspaceDocumentPolicy =>
  Object.freeze({
    domain,
    cardinality: 'many',
    patch: Object.freeze({ kind: 'top-level' }),
  });

export const WORKSPACE_DOCUMENT_POLICIES = Object.freeze({
  'pir-page': roots(
    'pir',
    ['/ui/graph', '/componentContract', '/logic', '/metadata'],
    ['/x-']
  ),
  'pir-layout': roots(
    'pir',
    ['/ui/graph', '/componentContract', '/logic', '/metadata'],
    ['/x-']
  ),
  'pir-component': roots(
    'pir',
    ['/ui/graph', '/componentContract', '/logic', '/metadata'],
    ['/x-']
  ),
  'pir-graph': roots('nodegraph', ['/nodes', '/edges', '/publicContract']),
  'pir-animation': roots('animation', [
    '/target',
    '/timelines',
    '/compositions',
    '/entryCompositionId',
    '/svgFilters',
    '/x-animationEditor',
  ]),
  'design-tokens': topLevel('token'),
  'design-token-resolver': topLevel('token'),
  code: roots('code', ['/language', '/source', '/metadata'], ['/x-']),
  'data-source': roots('data', [
    '/source',
    '/schemasById',
    '/operationsById',
    '/importProvenanceById',
  ]),
  'behavior-scenario': roots('behavior', [
    '/id',
    '/name',
    '/description',
    '/owner',
    '/criticality',
    '/tags',
    '/entry',
    '/steps',
    '/fixtureRefs',
    '/controlProfileRef',
    '/baselineRefs',
    '/timeoutPolicy',
  ]),
  'behavior-control-profile': roots('behavior', [
    '/id',
    '/name',
    '/clock',
    '/timezone',
    '/random',
    '/identifiers',
    '/scheduler',
    '/network',
    '/storage',
    '/rendering',
    '/serviceWorker',
    '/settle',
    '/budgets',
  ]),
  'behavior-fixture-set': roots('behavior', ['/id', '/name', '/fixtures']),
  'verification-policy': roots(
    'verification',
    [
      '/id',
      '/name',
      '/defaultRequirement',
      '/rules',
      '/matrixProfiles',
      '/retryPolicies',
      '/exemptions',
      '/budgets',
      '/artifactCapture',
      '/comparison',
      '/evidenceRequirements',
      '/baselinePolicy',
      '/retentionRequest',
    ],
    undefined,
    'single'
  ),
  'verification-baseline-set': roots('verification', [
    '/id',
    '/name',
    '/entries',
  ]),
  asset: roots('resource', [
    '/mime',
    '/category',
    '/size',
    '/blob',
    '/metadata',
  ]),
  'project-config': roots('resource', ['/value', '/metadata']),
} satisfies Record<WorkspaceDocumentType, WorkspaceDocumentPolicy>);

export const WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES = Object.freeze([
  Object.freeze({ prefix: 'core.nodegraph', domain: 'nodegraph' as const }),
  Object.freeze({ prefix: 'core.animation', domain: 'animation' as const }),
  Object.freeze({ prefix: 'core.design-tokens', domain: 'token' as const }),
  Object.freeze({
    prefix: 'core.design-token-resolvers',
    domain: 'token' as const,
  }),
  Object.freeze({ prefix: 'core.code', domain: 'code' as const }),
  Object.freeze({ prefix: 'core.data', domain: 'data' as const }),
  Object.freeze({ prefix: 'core.behavior', domain: 'behavior' as const }),
  Object.freeze({
    prefix: 'core.verification',
    domain: 'verification' as const,
  }),
  Object.freeze({ prefix: 'core.resource', domain: 'resource' as const }),
  Object.freeze({ prefix: 'core.route', domain: 'route' as const }),
  Object.freeze({
    prefix: 'core.workspace-sync',
    domain: 'workspace' as const,
  }),
  Object.freeze({ prefix: 'core.workspace', domain: 'workspace' as const }),
  Object.freeze({ prefix: 'core.pir', domain: 'pir' as const }),
]);

const workspaceDocumentTypes = new Set<WorkspaceDocumentType>(
  WORKSPACE_DOCUMENT_TYPES
);
const workspaceCommandDomains = new Set<WorkspaceCommandDomain>(
  WORKSPACE_COMMAND_DOMAINS
);

export const isWorkspaceDocumentType = (
  value: unknown
): value is WorkspaceDocumentType =>
  typeof value === 'string' &&
  workspaceDocumentTypes.has(value as WorkspaceDocumentType);

export const isWorkspaceCommandDomain = (
  value: unknown
): value is WorkspaceCommandDomain =>
  typeof value === 'string' &&
  workspaceCommandDomains.has(value as WorkspaceCommandDomain);

export const isWorkspaceDocumentCommandDomain = (
  value: WorkspaceCommandDomain
): value is WorkspaceDocumentCommandDomain =>
  value !== 'workspace' && value !== 'route';

export const isPirWorkspaceDocumentType = (
  value: WorkspaceDocumentType
): value is 'pir-page' | 'pir-layout' | 'pir-component' =>
  WORKSPACE_DOCUMENT_POLICIES[value].domain === 'pir';

export const getWorkspaceDocumentPolicy = (
  type: WorkspaceDocumentType
): WorkspaceDocumentPolicy => WORKSPACE_DOCUMENT_POLICIES[type];

export const getWorkspaceDocumentDomain = (
  type: WorkspaceDocumentType
): WorkspaceDocumentCommandDomain => getWorkspaceDocumentPolicy(type).domain;

export const getWorkspaceDocumentCardinality = (
  type: WorkspaceDocumentType
): WorkspaceDocumentPolicy['cardinality'] =>
  getWorkspaceDocumentPolicy(type).cardinality;

export const resolveWorkspaceCommandNamespaceDomain = (
  namespace: string
): WorkspaceCommandDomain | undefined =>
  WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES.find(
    ({ prefix }) => namespace === prefix || namespace.startsWith(`${prefix}.`)
  )?.domain;

export const isWorkspaceDocumentPatchPathAllowed = (
  type: WorkspaceDocumentType,
  path: string
): boolean => {
  if (
    !path.startsWith('/') ||
    path === '/' ||
    path === '/ui/root' ||
    path.startsWith('/ui/root/')
  ) {
    return false;
  }

  const policy = getWorkspaceDocumentPolicy(type).patch;
  if (policy.kind === 'top-level') return true;
  if (
    policy.roots.some((root) => path === root || path.startsWith(`${root}/`))
  ) {
    return true;
  }
  return Boolean(
    policy.extensionRootPrefixes?.some((prefix) => path.startsWith(prefix))
  );
};
