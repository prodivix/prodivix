export const CONTROLLED_SOURCE_SCHEMA_VERSION = '1.0' as const;
export const CONTROLLED_SOURCE_METADATA_KEY =
  'prodivix.controlledSource' as const;

export const CONTROLLED_SOURCE_CAPABILITIES = Object.freeze([
  'element-structure',
  'literal-props',
  'literal-style',
  'literal-text',
] as const);

export const CONTROLLED_SOURCE_ADAPTER_IDS = Object.freeze([
  'react-jsx',
  'css',
] as const);

export type ControlledSourceCapability =
  (typeof CONTROLLED_SOURCE_CAPABILITIES)[number];

export type ControlledSourceAdapterId =
  (typeof CONTROLLED_SOURCE_ADAPTER_IDS)[number];

export type ControlledSourceOwner = Readonly<{
  kind: 'pir-document';
  documentId: string;
}>;

export type ControlledSourceRegionBinding = Readonly<{
  id: string;
  owner: ControlledSourceOwner;
  adapterId: ControlledSourceAdapterId;
  controlledOwnership: 'pir-owned';
  capabilities: readonly ControlledSourceCapability[];
}>;

export type ControlledSourceManifest = Readonly<{
  schemaVersion: typeof CONTROLLED_SOURCE_SCHEMA_VERSION;
  unmanagedOwnership: 'code-owned';
  regions: readonly ControlledSourceRegionBinding[];
}>;

export const CONTROLLED_SOURCE_ISSUE_CODES = Object.freeze({
  inputInvalid: 'CONTROLLED_SOURCE_INPUT_INVALID',
  manifestInvalid: 'CONTROLLED_SOURCE_MANIFEST_INVALID',
  markerMalformed: 'CONTROLLED_SOURCE_MARKER_MALFORMED',
  markerNested: 'CONTROLLED_SOURCE_MARKER_NESTED',
  markerUnexpectedEnd: 'CONTROLLED_SOURCE_MARKER_UNEXPECTED_END',
  markerMismatch: 'CONTROLLED_SOURCE_MARKER_MISMATCH',
  markerUnclosed: 'CONTROLLED_SOURCE_MARKER_UNCLOSED',
  regionDuplicate: 'CONTROLLED_SOURCE_REGION_DUPLICATE',
  regionMissing: 'CONTROLLED_SOURCE_REGION_MISSING',
} as const);

export type ControlledSourceIssueCode =
  (typeof CONTROLLED_SOURCE_ISSUE_CODES)[keyof typeof CONTROLLED_SOURCE_ISSUE_CODES];

export type ControlledSourceIssue = Readonly<{
  code: ControlledSourceIssueCode;
  path: string;
  message: string;
  regionId?: string;
}>;

export type ControlledSourceManifestResult =
  | Readonly<{ status: 'absent' }>
  | Readonly<{
      status: 'valid';
      manifest: ControlledSourceManifest;
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ControlledSourceIssue[];
    }>;

export type ControlledSourceRegionSpan = Readonly<{
  id: string;
  from: number;
  to: number;
  bodyFrom: number;
  bodyTo: number;
  body: string;
}>;

export type ControlledSourceScanResult =
  | Readonly<{
      status: 'ready';
      regions: readonly ControlledSourceRegionSpan[];
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ControlledSourceIssue[];
    }>;

export type ControlledSourceRenderResult =
  | Readonly<{ status: 'ready'; source: string }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ControlledSourceIssue[];
    }>;

export type ControlledSourceReplaceResult =
  | Readonly<{
      status: 'ready';
      source: string;
      previousRegion: ControlledSourceRegionSpan;
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ControlledSourceIssue[];
    }>;

const REGION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:%-]*$/;
const RESERVED_MARKER_TOKEN = '@prodivix-controlled:';
const MARKER_PATTERN =
  /\/\* @prodivix-controlled:(start|end) v=1 id=([a-zA-Z0-9][a-zA-Z0-9._:%-]*) \*\//g;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: ControlledSourceIssue,
  right: ControlledSourceIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.regionId ?? '', right.regionId ?? '') ||
  compareText(left.message, right.message);

const invalid = (
  issues: readonly ControlledSourceIssue[]
): Readonly<{
  status: 'invalid';
  issues: readonly ControlledSourceIssue[];
}> => ({ status: 'invalid', issues: [...issues].sort(compareIssues) });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isCanonicalText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim();

const isControlledSourceCapability = (
  value: unknown
): value is ControlledSourceCapability =>
  CONTROLLED_SOURCE_CAPABILITIES.some((capability) => capability === value);

const isControlledSourceAdapterId = (
  value: unknown
): value is ControlledSourceAdapterId =>
  CONTROLLED_SOURCE_ADAPTER_IDS.some((adapterId) => adapterId === value);

export const isControlledSourceRegionId = (value: unknown): value is string =>
  typeof value === 'string' && REGION_ID_PATTERN.test(value);

const decodeRegionBinding = (
  value: unknown,
  index: number
):
  | Readonly<{ ok: true; binding: ControlledSourceRegionBinding }>
  | Readonly<{ ok: false; issues: readonly ControlledSourceIssue[] }> => {
  const path = `/regions/${index}`;
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [
        {
          code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
          path,
          message: 'Controlled source region binding must be an object.',
        },
      ],
    };
  }
  const issues: ControlledSourceIssue[] = [];
  if (!isControlledSourceRegionId(value.id)) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: `${path}/id`,
      message:
        'Controlled source region id must use letters, digits, dot, colon, percent, underscore, or hyphen.',
    });
  }
  if (!isControlledSourceAdapterId(value.adapterId)) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: `${path}/adapterId`,
      message: 'Controlled source adapterId must identify a supported adapter.',
    });
  }
  if (value.controlledOwnership !== 'pir-owned') {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: `${path}/controlledOwnership`,
      message: 'Controlled region ownership must be "pir-owned".',
    });
  }
  const owner = value.owner;
  if (
    !isRecord(owner) ||
    owner.kind !== 'pir-document' ||
    !isCanonicalText(owner.documentId)
  ) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: `${path}/owner`,
      message:
        'Controlled source owner must identify one canonical PIR document.',
    });
  }
  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.length === 0 ||
    !value.capabilities.every(isControlledSourceCapability)
  ) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: `${path}/capabilities`,
      message:
        'Controlled source capabilities must be a non-empty supported capability list.',
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    binding: Object.freeze({
      id: value.id as string,
      owner: Object.freeze({
        kind: 'pir-document' as const,
        documentId: (owner as Readonly<Record<string, unknown>>)
          .documentId as string,
      }),
      adapterId: value.adapterId as ControlledSourceAdapterId,
      controlledOwnership: 'pir-owned' as const,
      capabilities: Object.freeze(
        [...new Set(value.capabilities as ControlledSourceCapability[])].sort(
          compareText
        )
      ),
    }),
  };
};

/** Decodes the typed ownership manifest stored on a Workspace code document. */
export const decodeControlledSourceManifest = (
  metadata: Readonly<Record<string, unknown>> | undefined
): ControlledSourceManifestResult => {
  const value = metadata?.[CONTROLLED_SOURCE_METADATA_KEY];
  if (value === undefined) return { status: 'absent' };
  if (!isRecord(value)) {
    return invalid([
      {
        code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
        path: `/${CONTROLLED_SOURCE_METADATA_KEY}`,
        message: 'Controlled source manifest must be an object.',
      },
    ]);
  }
  const issues: ControlledSourceIssue[] = [];
  if (value.schemaVersion !== CONTROLLED_SOURCE_SCHEMA_VERSION) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: '/schemaVersion',
      message: `Controlled source schemaVersion must be "${CONTROLLED_SOURCE_SCHEMA_VERSION}".`,
    });
  }
  if (value.unmanagedOwnership !== 'code-owned') {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: '/unmanagedOwnership',
      message: 'Unmanaged source ownership must be "code-owned".',
    });
  }
  if (!Array.isArray(value.regions) || value.regions.length === 0) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.manifestInvalid,
      path: '/regions',
      message: 'Controlled source manifest requires at least one region.',
    });
  }
  const bindings: ControlledSourceRegionBinding[] = [];
  if (Array.isArray(value.regions)) {
    value.regions.forEach((region, index) => {
      const decoded = decodeRegionBinding(region, index);
      if (decoded.ok) bindings.push(decoded.binding);
      else issues.push(...decoded.issues);
    });
  }
  const ids = new Set<string>();
  bindings.forEach((binding, index) => {
    if (!ids.has(binding.id)) {
      ids.add(binding.id);
      return;
    }
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.regionDuplicate,
      path: `/regions/${index}/id`,
      message: `Controlled source region "${binding.id}" is declared more than once.`,
      regionId: binding.id,
    });
  });
  if (issues.length > 0) return invalid(issues);
  return {
    status: 'valid',
    manifest: Object.freeze({
      schemaVersion: CONTROLLED_SOURCE_SCHEMA_VERSION,
      unmanagedOwnership: 'code-owned' as const,
      regions: Object.freeze(
        [...bindings].sort((left, right) => compareText(left.id, right.id))
      ),
    }),
  };
};

const marker = (kind: 'start' | 'end', regionId: string): string =>
  `/* @prodivix-controlled:${kind} v=1 id=${regionId} */`;

export const renderControlledSourceRegion = (input: {
  regionId: string;
  body: string;
}): ControlledSourceRenderResult => {
  const issues: ControlledSourceIssue[] = [];
  if (!isControlledSourceRegionId(input.regionId)) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.inputInvalid,
      path: '/regionId',
      message:
        'Controlled source region id must use letters, digits, dot, colon, percent, underscore, or hyphen.',
    });
  }
  if (input.body.includes(RESERVED_MARKER_TOKEN)) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.markerNested,
      path: '/body',
      message: 'Controlled source body cannot contain a nested region marker.',
      ...(isControlledSourceRegionId(input.regionId)
        ? { regionId: input.regionId }
        : {}),
    });
  }
  if (issues.length > 0) return invalid(issues);
  const body = input.body.replaceAll(/\r\n?/g, '\n').replace(/\n*$/u, '');
  return {
    status: 'ready',
    source: `${marker('start', input.regionId)}\n${body}\n${marker('end', input.regionId)}`,
  };
};

/** Scans reserved markers without interpreting or rewriting unmanaged source. */
export const scanControlledSourceRegions = (
  source: string
): ControlledSourceScanResult => {
  const issues: ControlledSourceIssue[] = [];
  const exactMarkers = [...source.matchAll(MARKER_PATTERN)];
  const sourceWithoutExactMarkers = source.replace(MARKER_PATTERN, '');
  if (sourceWithoutExactMarkers.includes(RESERVED_MARKER_TOKEN)) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.markerMalformed,
      path: '/source',
      message: 'Controlled source contains a malformed reserved marker.',
    });
  }
  let open:
    Readonly<{ id: string; from: number; markerEnd: number }> | undefined;
  const regions: ControlledSourceRegionSpan[] = [];
  const regionIds = new Set<string>();
  exactMarkers.forEach((match, index) => {
    const kind = match[1] as 'start' | 'end';
    const id = match[2]!;
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (kind === 'start') {
      if (open) {
        issues.push({
          code: CONTROLLED_SOURCE_ISSUE_CODES.markerNested,
          path: `/markers/${index}`,
          message: `Controlled region "${id}" starts before region "${open.id}" ends.`,
          regionId: id,
        });
        return;
      }
      open = { id, from, markerEnd: to };
      return;
    }
    if (!open) {
      issues.push({
        code: CONTROLLED_SOURCE_ISSUE_CODES.markerUnexpectedEnd,
        path: `/markers/${index}`,
        message: `Controlled region "${id}" ends without a matching start marker.`,
        regionId: id,
      });
      return;
    }
    if (open.id !== id) {
      issues.push({
        code: CONTROLLED_SOURCE_ISSUE_CODES.markerMismatch,
        path: `/markers/${index}`,
        message: `Controlled region "${open.id}" is closed by marker "${id}".`,
        regionId: open.id,
      });
      open = undefined;
      return;
    }
    if (regionIds.has(id)) {
      issues.push({
        code: CONTROLLED_SOURCE_ISSUE_CODES.regionDuplicate,
        path: `/markers/${index}`,
        message: `Controlled source region "${id}" appears more than once.`,
        regionId: id,
      });
    } else {
      regionIds.add(id);
      const bodyFrom = source.startsWith('\r\n', open.markerEnd)
        ? open.markerEnd + 2
        : source[open.markerEnd] === '\n'
          ? open.markerEnd + 1
          : open.markerEnd;
      const bodyTo =
        source.slice(Math.max(bodyFrom, from - 2), from) === '\r\n'
          ? from - 2
          : source[from - 1] === '\n'
            ? from - 1
            : from;
      regions.push({
        id,
        from: open.from,
        to,
        bodyFrom,
        bodyTo,
        body: source.slice(bodyFrom, bodyTo),
      });
    }
    open = undefined;
  });
  if (open) {
    issues.push({
      code: CONTROLLED_SOURCE_ISSUE_CODES.markerUnclosed,
      path: '/source',
      message: `Controlled region "${open.id}" has no matching end marker.`,
      regionId: open.id,
    });
  }
  if (issues.length > 0) return invalid(issues);
  return {
    status: 'ready',
    regions: Object.freeze(
      [...regions].sort((left, right) => left.from - right.from)
    ),
  };
};

/** Replaces one PIR-owned region while preserving every unmanaged byte. */
export const replaceControlledSourceRegion = (input: {
  source: string;
  regionId: string;
  body: string;
}): ControlledSourceReplaceResult => {
  const scanned = scanControlledSourceRegions(input.source);
  if (scanned.status === 'invalid') return scanned;
  const previousRegion = scanned.regions.find(
    (region) => region.id === input.regionId
  );
  if (!previousRegion) {
    return invalid([
      {
        code: CONTROLLED_SOURCE_ISSUE_CODES.regionMissing,
        path: '/regionId',
        message: `Controlled source region "${input.regionId}" does not exist.`,
        regionId: input.regionId,
      },
    ]);
  }
  const rendered = renderControlledSourceRegion({
    regionId: input.regionId,
    body: input.body,
  });
  if (rendered.status === 'invalid') return rendered;
  return {
    status: 'ready',
    previousRegion,
    source: `${input.source.slice(0, previousRegion.from)}${rendered.source}${input.source.slice(previousRegion.to)}`,
  };
};
