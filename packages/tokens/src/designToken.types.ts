export type DesignTokenJsonPrimitive = null | boolean | number | string;

export interface DesignTokenJsonArray extends ReadonlyArray<DesignTokenJsonValue> {}

export interface DesignTokenJsonObject {
  readonly [key: string]: DesignTokenJsonValue;
}

export type DesignTokenJsonValue =
  DesignTokenJsonPrimitive | DesignTokenJsonArray | DesignTokenJsonObject;

export type DesignTokenDeprecated = boolean | string;

export type DesignTokenReferenceTarget =
  | Readonly<{
      kind: 'token';
      tokenPath: readonly string[];
      valuePath: readonly string[];
    }>
  | Readonly<{
      kind: 'group';
      groupPath: readonly string[];
    }>
  | Readonly<{
      kind: 'document-location';
      pointerPath: readonly string[];
    }>;

export type DesignTokenReference = Readonly<{
  syntax: 'curly' | 'json-pointer';
  raw: string;
  target: DesignTokenReferenceTarget;
}>;

export type DesignTokenValueReference = Readonly<{
  valuePath: readonly string[];
  reference: DesignTokenReference;
}>;

export type DesignTokenGroup = Readonly<{
  name?: string;
  path: readonly string[];
  parentPath?: readonly string[];
  description?: string;
  declaredTypeRef?: string;
  typeRef?: string;
  declaredDeprecated?: DesignTokenDeprecated;
  deprecated?: DesignTokenDeprecated;
  extensions?: Readonly<Record<string, DesignTokenJsonValue>>;
  extends?: DesignTokenReference;
}>;

export type DesignToken = Readonly<{
  name: string;
  path: readonly string[];
  groupPath: readonly string[];
  sourceKind: 'value' | 'reference';
  value?: DesignTokenJsonValue;
  directReference?: DesignTokenReference;
  references: readonly DesignTokenValueReference[];
  description?: string;
  declaredTypeRef?: string;
  typeRef: string;
  declaredDeprecated?: DesignTokenDeprecated;
  deprecated?: DesignTokenDeprecated;
  extensions?: Readonly<Record<string, DesignTokenJsonValue>>;
}>;

export type DesignTokenDocument = Readonly<{
  groups: readonly DesignTokenGroup[];
  tokens: readonly DesignToken[];
}>;

export const DESIGN_TOKEN_DECODE_ISSUE_CODES = Object.freeze({
  documentInvalid: 'DTK_DOCUMENT_INVALID',
  nameInvalid: 'DTK_NAME_INVALID',
  nodeInvalid: 'DTK_NODE_INVALID',
  propertyInvalid: 'DTK_PROPERTY_INVALID',
  reservedPropertyInvalid: 'DTK_RESERVED_PROPERTY_INVALID',
  referenceInvalid: 'DTK_REFERENCE_INVALID',
  referenceMissing: 'DTK_REFERENCE_MISSING',
  referenceTargetInvalid: 'DTK_REFERENCE_TARGET_INVALID',
  referenceCycle: 'DTK_REFERENCE_CYCLE',
  groupExtensionCycle: 'DTK_GROUP_EXTENSION_CYCLE',
  typeMissing: 'DTK_TYPE_MISSING',
  typeMismatch: 'DTK_TYPE_MISMATCH',
} as const);

export type DesignTokenDecodeIssueCode =
  (typeof DESIGN_TOKEN_DECODE_ISSUE_CODES)[keyof typeof DESIGN_TOKEN_DECODE_ISSUE_CODES];

export type DesignTokenDecodeIssue = Readonly<{
  code: DesignTokenDecodeIssueCode;
  path: string;
  message: string;
}>;

export type DesignTokenDecodeResult =
  | Readonly<{ ok: true; value: DesignTokenDocument }>
  | Readonly<{ ok: false; issues: readonly DesignTokenDecodeIssue[] }>;

export const formatDesignTokenPath = (path: readonly string[]): string =>
  path.join('.');
