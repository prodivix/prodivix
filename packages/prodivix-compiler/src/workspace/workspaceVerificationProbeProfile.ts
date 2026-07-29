import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  isWorkspacePirDocument,
  type WorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE,
  WorkspaceVerificationCompileProfileError,
  type NormalizedWorkspaceVerificationCompileProfile,
  type WorkspaceVerificationCompileProfile,
  type WorkspaceVerificationProbeReadiness,
  type WorkspaceVerificationProbeInstanceScope,
  type WorkspaceVerificationProbeSourceRef,
  type WorkspaceVerificationProbeTarget,
} from '#src/workspace/workspaceVerificationProbeContract';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MAXIMUM_TARGETS = 2_048;
const MAXIMUM_ID_LENGTH = 512;
const MAXIMUM_PATH_LENGTH = 2_048;
const PRIVATE_MATERIAL_PATTERN =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+\S+|(?:password|passwd|secret|token|credential|api[_-]?key)\s*[:=]\s*\S+|(?:secret|credential):\/\/)/iu;
const CREDENTIAL_KEY_PATTERN =
  /^(?:authorization|proxyauthorization|cookie|setcookie|xapikey|apikey|password|passwd|secret|clientsecret|clientkey|token|authtoken|accesstoken|refreshtoken|idtoken|sessiontoken|csrftoken|jwt|credential|credentials|sessionid|privatekey)$/u;

const failProfile = (path: string, reason: string): never => {
  throw new WorkspaceVerificationCompileProfileError(path, reason);
};

const readOwnDataValue = (
  record: Record<string, unknown>,
  key: string,
  path: string
): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !('value' in descriptor)) {
    throw new WorkspaceVerificationCompileProfileError(
      path,
      'Verification compile profile must contain data properties only.'
    );
  }
  return descriptor.value;
};

const requireExactRecord = (
  value: unknown,
  path: string,
  allowedKeys: readonly string[]
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new WorkspaceVerificationCompileProfileError(
      path,
      'Verification compile profile value must be a plain object.'
    );
  }
  const record: Record<string, unknown> = value;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    failProfile(
      path,
      'Verification compile profile cannot contain symbol keys.'
    );
  }
  const keys = ownKeys as string[];
  if (
    keys.length !== allowedKeys.length ||
    keys.some((key) => !allowedKeys.includes(key))
  ) {
    failProfile(
      path,
      'Verification compile profile contains unknown or missing fields.'
    );
  }
  keys.forEach((key) => {
    if (isUnsafeObjectKey(key)) {
      failProfile(`${path}/${key}`, 'Unsafe object key is not allowed.');
    }
    readOwnDataValue(record, key, `${path}/${key}`);
  });
  return record;
};

const assertNoCredentialMaterial = (
  value: unknown,
  path = '/verificationProfile',
  seen = new Set<object>(),
  depth = 0
): void => {
  if (depth > 8) {
    failProfile(
      path,
      'Verification compile profile nesting exceeds its bound.'
    );
  }
  if (typeof value === 'string') {
    if (PRIVATE_MATERIAL_PATTERN.test(value)) {
      failProfile(path, 'Credential or Secret material is not allowed.');
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) {
    failProfile(path, 'Verification compile profile cannot be cyclic.');
  }
  seen.add(value);
  try {
    if (!Array.isArray(value) && !isPlainObject(value)) {
      failProfile(path, 'Verification compile profile must be JSON-shaped.');
    }
    for (const ownKey of Reflect.ownKeys(value)) {
      if (typeof ownKey !== 'string') {
        throw new WorkspaceVerificationCompileProfileError(
          path,
          'Unsafe verification compile profile key is not allowed.'
        );
      }
      const key = ownKey;
      if (isUnsafeObjectKey(key)) {
        failProfile(
          path,
          'Unsafe verification compile profile key is not allowed.'
        );
      }
      const normalizedKey = key.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
      if (CREDENTIAL_KEY_PATTERN.test(normalizedKey)) {
        failProfile(
          `${path}/${key}`,
          'Credential or Secret fields are not allowed.'
        );
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new WorkspaceVerificationCompileProfileError(
          `${path}/${key}`,
          'Accessor properties are not allowed.'
        );
      }
      assertNoCredentialMaterial(
        descriptor.value,
        `${path}/${key}`,
        seen,
        depth + 1
      );
    }
  } finally {
    seen.delete(value);
  }
};

const requireCanonicalText = (
  value: unknown,
  path: string,
  maximumLength: number
): string => {
  if (typeof value !== 'string') {
    throw new WorkspaceVerificationCompileProfileError(
      path,
      'Expected bounded canonical text.'
    );
  }
  if (
    value.length === 0 ||
    value.length > maximumLength ||
    value !== value.normalize('NFC') ||
    value.trim() !== value ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    failProfile(path, 'Expected bounded canonical text.');
  }
  return value;
};

const requireDigest = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new WorkspaceVerificationCompileProfileError(
      path,
      'Expected a canonical sha256 digest.'
    );
  }
  return value;
};

const decodeJsonPointerSegment = (value: string, path: string): string => {
  if (/~(?![01])/u.test(value)) {
    failProfile(
      path,
      'SourceRef path contains an invalid JSON Pointer escape.'
    );
  }
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
};

const requireSourcePath = (value: unknown, path: string): string => {
  const sourcePath = requireCanonicalText(value, path, MAXIMUM_PATH_LENGTH);
  if (!sourcePath.startsWith('/')) {
    failProfile(path, 'SourceRef path must be an absolute JSON Pointer.');
  }
  sourcePath
    .slice(1)
    .split('/')
    .forEach((segment) => decodeJsonPointerSegment(segment, path));
  return sourcePath;
};

const READINESS_VALUES: readonly WorkspaceVerificationProbeReadiness[] =
  Object.freeze(['document-ready', 'enabled', 'mounted', 'visible']);

const readReadiness = (
  value: unknown,
  path: string
): readonly WorkspaceVerificationProbeReadiness[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw new WorkspaceVerificationCompileProfileError(
      path,
      'Readiness must contain one to four declared conditions.'
    );
  }
  const candidates: unknown[] = value;
  const conditions = candidates.map((candidate, index) => {
    if (
      typeof candidate !== 'string' ||
      !READINESS_VALUES.includes(
        candidate as WorkspaceVerificationProbeReadiness
      )
    ) {
      failProfile(`${path}/${index}`, 'Unsupported readiness condition.');
    }
    return candidate as WorkspaceVerificationProbeReadiness;
  });
  if (new Set(conditions).size !== conditions.length) {
    failProfile(path, 'Readiness conditions must be unique.');
  }
  return Object.freeze([...conditions].sort(compareUnicodeCodePoints));
};

const readSourceRef = (
  value: unknown,
  path: string
): WorkspaceVerificationProbeSourceRef => {
  const record = requireExactRecord(value, path, [
    'workspaceDocumentId',
    'path',
  ]);
  return Object.freeze({
    workspaceDocumentId: requireCanonicalText(
      readOwnDataValue(
        record,
        'workspaceDocumentId',
        `${path}/workspaceDocumentId`
      ),
      `${path}/workspaceDocumentId`,
      MAXIMUM_ID_LENGTH
    ),
    path: requireSourcePath(
      readOwnDataValue(record, 'path', `${path}/path`),
      `${path}/path`
    ),
  });
};

const readInstanceScope = (
  value: unknown,
  path: string
): WorkspaceVerificationProbeInstanceScope => {
  const record = requireExactRecord(value, path, ['kind', 'id']);
  if (readOwnDataValue(record, 'kind', `${path}/kind`) !== 'collection-item') {
    failProfile(
      `${path}/kind`,
      'Only collection-item verification instance scopes are supported.'
    );
  }
  return Object.freeze({
    kind: 'collection-item',
    id: requireCanonicalText(
      readOwnDataValue(record, 'id', `${path}/id`),
      `${path}/id`,
      MAXIMUM_ID_LENGTH
    ),
  });
};

const readTarget = (
  value: unknown,
  path: string
): WorkspaceVerificationProbeTarget => {
  if (!isPlainObject(value)) {
    failProfile(path, 'Verification probe target must be a plain object.');
  }
  const targetValue = value as Record<string, unknown>;
  const targetKeys = Reflect.ownKeys(targetValue);
  if (targetKeys.some((key) => typeof key !== 'string')) {
    failProfile(path, 'Verification probe target cannot contain symbol keys.');
  }
  const hasInstanceScope = targetKeys.includes('instanceScope');
  const record = requireExactRecord(
    targetValue,
    path,
    hasInstanceScope
      ? ['targetId', 'readiness', 'sourceRef', 'instanceScope']
      : ['targetId', 'readiness', 'sourceRef']
  );
  const instanceScope = hasInstanceScope
    ? readInstanceScope(
        readOwnDataValue(record, 'instanceScope', `${path}/instanceScope`),
        `${path}/instanceScope`
      )
    : undefined;
  return Object.freeze({
    targetId: requireCanonicalText(
      readOwnDataValue(record, 'targetId', `${path}/targetId`),
      `${path}/targetId`,
      MAXIMUM_ID_LENGTH
    ),
    readiness: readReadiness(
      readOwnDataValue(record, 'readiness', `${path}/readiness`),
      `${path}/readiness`
    ),
    sourceRef: readSourceRef(
      readOwnDataValue(record, 'sourceRef', `${path}/sourceRef`),
      `${path}/sourceRef`
    ),
    ...(instanceScope === undefined ? {} : { instanceScope }),
  });
};

const readPirNodeId = (
  sourceRef: WorkspaceVerificationProbeSourceRef
): string | undefined => {
  const segments = sourceRef.path.slice(1).split('/');
  const encodedNodeId =
    segments[0] === 'nodesById'
      ? segments[1]
      : segments[0] === 'ui' &&
          segments[1] === 'graph' &&
          segments[2] === 'nodesById'
        ? segments[3]
        : undefined;
  return encodedNodeId
    ? decodeJsonPointerSegment(encodedNodeId, '/verificationProfile/targets')
    : undefined;
};

const validateTargetSource = (
  workspace: WorkspaceSnapshot,
  target: WorkspaceVerificationProbeTarget,
  path: string
): void => {
  const document = workspace.docsById[target.sourceRef.workspaceDocumentId];
  if (!document) {
    failProfile(
      `${path}/sourceRef`,
      'SourceRef document is absent from the exact Workspace.'
    );
  }
  const needsDomTarget = target.readiness.some(
    (condition) => condition !== 'document-ready'
  );
  if (!needsDomTarget) return;
  if (!isWorkspacePirDocument(document)) {
    failProfile(
      `${path}/sourceRef`,
      'DOM readiness requires a canonical PIR document source.'
    );
  }
  const pirDocument = document as WorkspacePirDocument;
  const nodeId = readPirNodeId(target.sourceRef);
  if (!nodeId || !pirDocument.content.ui.graph.nodesById[nodeId]) {
    failProfile(
      `${path}/sourceRef/path`,
      'DOM readiness requires an existing PIR nodesById SourceRef.'
    );
  }
};

const readVerificationProfile = (
  workspace: WorkspaceSnapshot,
  value: unknown
): NormalizedWorkspaceVerificationCompileProfile => {
  assertNoCredentialMaterial(value);
  const record = requireExactRecord(value, '/verificationProfile', [
    'kind',
    'workspaceRevision',
    'profileDigest',
    'scenarioProgramDigest',
    'semanticSnapshotDigest',
    'targets',
  ]);
  if (
    readOwnDataValue(record, 'kind', '/verificationProfile/kind') !==
    'verification'
  ) {
    failProfile('/verificationProfile/kind', 'Expected verification profile.');
  }
  const workspaceRevision = readOwnDataValue(
    record,
    'workspaceRevision',
    '/verificationProfile/workspaceRevision'
  );
  if (typeof workspaceRevision !== 'number') {
    throw new WorkspaceVerificationCompileProfileError(
      '/verificationProfile/workspaceRevision',
      'Verification profile must bind the exact Workspace revision.'
    );
  }
  if (
    !Number.isSafeInteger(workspaceRevision) ||
    workspaceRevision !== workspace.workspaceRev
  ) {
    failProfile(
      '/verificationProfile/workspaceRevision',
      'Verification profile must bind the exact Workspace revision.'
    );
  }
  const rawTargets = readOwnDataValue(
    record,
    'targets',
    '/verificationProfile/targets'
  );
  if (!Array.isArray(rawTargets) || rawTargets.length > MAXIMUM_TARGETS) {
    throw new WorkspaceVerificationCompileProfileError(
      '/verificationProfile/targets',
      `Verification profile supports at most ${MAXIMUM_TARGETS} targets.`
    );
  }
  const targetValues: unknown[] = rawTargets;
  const targets: WorkspaceVerificationProbeTarget[] = targetValues.map(
    (target, index) =>
      readTarget(target, `/verificationProfile/targets/${index}`)
  );
  const targetIds = new Set<string>();
  targets.forEach((target, index) => {
    if (targetIds.has(target.targetId)) {
      failProfile(
        `/verificationProfile/targets/${index}/targetId`,
        'Verification target ids must be unique.'
      );
    }
    targetIds.add(target.targetId);
    validateTargetSource(
      workspace,
      target,
      `/verificationProfile/targets/${index}`
    );
  });
  targets.sort((left, right) =>
    compareUnicodeCodePoints(left.targetId, right.targetId)
  );
  return Object.freeze({
    kind: 'verification',
    workspaceRevision,
    profileDigest: requireDigest(
      readOwnDataValue(
        record,
        'profileDigest',
        '/verificationProfile/profileDigest'
      ),
      '/verificationProfile/profileDigest'
    ),
    scenarioProgramDigest: requireDigest(
      readOwnDataValue(
        record,
        'scenarioProgramDigest',
        '/verificationProfile/scenarioProgramDigest'
      ),
      '/verificationProfile/scenarioProgramDigest'
    ),
    semanticSnapshotDigest: requireDigest(
      readOwnDataValue(
        record,
        'semanticSnapshotDigest',
        '/verificationProfile/semanticSnapshotDigest'
      ),
      '/verificationProfile/semanticSnapshotDigest'
    ),
    targets: Object.freeze(targets),
  });
};

export const normalizeWorkspaceVerificationCompileProfile = (
  workspace: WorkspaceSnapshot,
  value: WorkspaceVerificationCompileProfile | undefined
): WorkspaceVerificationCompileProfile => {
  if (value === undefined) {
    return PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE;
  }
  assertNoCredentialMaterial(value);
  if (
    isPlainObject(value) &&
    readOwnDataValue(value, 'kind', '/verificationProfile/kind') ===
      'production'
  ) {
    requireExactRecord(value, '/verificationProfile', ['kind']);
    return PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE;
  }
  return readVerificationProfile(workspace, value);
};

type WorkspaceVerificationProbeManifestInput = Readonly<{
  workspaceRevision: number;
  profileDigest: string;
  scenarioProgramDigest: string;
  semanticSnapshotDigest: string;
  targets: readonly WorkspaceVerificationProbeTarget[];
}>;

/** Digests the normalized manifest bytes shared by every framework target. */
export const digestNormalizedWorkspaceVerificationProbeManifest = (
  input: WorkspaceVerificationProbeManifestInput
): string =>
  `sha256-${bytesToHex(
    sha256(
      utf8ToBytes(
        canonicalJsonText({
          format: 'prodivix.workspace-verification-probe.v1',
          workspaceRevision: input.workspaceRevision,
          profileDigest: input.profileDigest,
          scenarioProgramDigest: input.scenarioProgramDigest,
          semanticSnapshotDigest: input.semanticSnapshotDigest,
          targets: input.targets,
        })
      )
    )
  )}`;
