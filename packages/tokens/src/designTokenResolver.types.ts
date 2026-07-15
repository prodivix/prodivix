import type {
  DesignTokenDocument,
  DesignTokenJsonObject,
  DesignTokenJsonValue,
} from './designToken.types';

export type DesignTokenResolverReferenceTarget =
  | Readonly<{ kind: 'set'; setName: string }>
  | Readonly<{ kind: 'modifier'; modifierName: string }>
  | Readonly<{
      kind: 'document';
      documentPath: string;
      fragment?: string;
    }>
  | Readonly<{
      kind: 'document-location';
      pointerPath: readonly string[];
    }>;

export type DesignTokenResolverReference = Readonly<{
  raw: string;
  target: DesignTokenResolverReferenceTarget;
  overrides?: DesignTokenJsonObject;
}>;

export type DesignTokenResolverSource =
  | Readonly<{
      kind: 'reference';
      reference: DesignTokenResolverReference;
    }>
  | Readonly<{
      kind: 'inline';
      document: DesignTokenDocument;
      raw: DesignTokenJsonObject;
    }>;

export type DesignTokenResolverSet = Readonly<{
  name: string;
  description?: string;
  sources: readonly DesignTokenResolverSource[];
  extensions?: Readonly<Record<string, DesignTokenJsonValue>>;
}>;

export type DesignTokenResolverContext = Readonly<{
  name: string;
  sources: readonly DesignTokenResolverSource[];
}>;

export type DesignTokenResolverModifier = Readonly<{
  name: string;
  description?: string;
  contexts: readonly DesignTokenResolverContext[];
  defaultContext?: string;
  extensions?: Readonly<Record<string, DesignTokenJsonValue>>;
}>;

export type DesignTokenResolverOrderEntry =
  | Readonly<{
      kind: 'set';
      name: string;
      declaration: 'reference' | 'inline';
      definition: DesignTokenResolverSet;
    }>
  | Readonly<{
      kind: 'modifier';
      name: string;
      declaration: 'reference' | 'inline';
      definition: DesignTokenResolverModifier;
    }>;

/** Versionless current model for one DTCG Resolver design system. */
export type DesignTokenResolverDocument = Readonly<{
  name?: string;
  description?: string;
  sets: readonly DesignTokenResolverSet[];
  modifiers: readonly DesignTokenResolverModifier[];
  resolutionOrder: readonly DesignTokenResolverOrderEntry[];
  permutationCount: number;
}>;

export const DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES = Object.freeze({
  documentInvalid: 'DTR_DOCUMENT_INVALID',
  versionUnsupported: 'DTR_VERSION_UNSUPPORTED',
  propertyInvalid: 'DTR_PROPERTY_INVALID',
  nameInvalid: 'DTR_NAME_INVALID',
  setInvalid: 'DTR_SET_INVALID',
  modifierInvalid: 'DTR_MODIFIER_INVALID',
  contextInvalid: 'DTR_CONTEXT_INVALID',
  sourceInvalid: 'DTR_SOURCE_INVALID',
  referenceInvalid: 'DTR_REFERENCE_INVALID',
  referenceMissing: 'DTR_REFERENCE_MISSING',
  referenceTargetInvalid: 'DTR_REFERENCE_TARGET_INVALID',
  referenceCycle: 'DTR_REFERENCE_CYCLE',
  orderInvalid: 'DTR_ORDER_INVALID',
  inlineTokenInvalid: 'DTR_INLINE_TOKEN_INVALID',
} as const);

export type DesignTokenResolverDecodeIssueCode =
  (typeof DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES)[keyof typeof DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES];

export type DesignTokenResolverDecodeIssue = Readonly<{
  code: DesignTokenResolverDecodeIssueCode;
  path: string;
  message: string;
}>;

export type DesignTokenResolverDecodeResult =
  | Readonly<{ ok: true; value: DesignTokenResolverDocument }>
  | Readonly<{
      ok: false;
      issues: readonly DesignTokenResolverDecodeIssue[];
    }>;

export const DESIGN_TOKEN_RESOLUTION_ISSUE_CODES = Object.freeze({
  missingModifier: 'DTR_INPUT_MODIFIER_MISSING',
  unknownModifier: 'DTR_INPUT_MODIFIER_UNKNOWN',
  invalidContext: 'DTR_INPUT_CONTEXT_INVALID',
} as const);

export type DesignTokenResolutionIssueCode =
  (typeof DESIGN_TOKEN_RESOLUTION_ISSUE_CODES)[keyof typeof DESIGN_TOKEN_RESOLUTION_ISSUE_CODES];

export type DesignTokenResolutionIssue = Readonly<{
  code: DesignTokenResolutionIssueCode;
  path: string;
  message: string;
}>;

export type DesignTokenResolvedSource = Readonly<{
  precedence: number;
  orderEntryName: string;
  orderEntryKind: 'set' | 'modifier';
  contextName?: string;
  source: DesignTokenResolverSource;
}>;

export type DesignTokenResolutionPlan = Readonly<{
  selection: Readonly<Record<string, string>>;
  orderedSources: readonly DesignTokenResolvedSource[];
}>;

export type DesignTokenResolutionPlanResult =
  | Readonly<{ ok: true; plan: DesignTokenResolutionPlan }>
  | Readonly<{ ok: false; issues: readonly DesignTokenResolutionIssue[] }>;
