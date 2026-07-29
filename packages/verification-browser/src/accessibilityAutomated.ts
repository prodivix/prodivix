import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  decodePrivateJson,
  strictArray,
  strictBoolean,
  strictDiagnosticCodes,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
  strictString,
  throwPartial,
} from './privateBoundary';

export type AccessibilityImpact = 'minor' | 'moderate' | 'serious' | 'critical';

type AxeProjectedNode = Readonly<{
  targetId: string;
  sourceTraceDigest?: string;
}>;

export type AxeProjectedRule = Readonly<{
  ruleId: string;
  impact: AccessibilityImpact;
  messageKey: string;
  diagnosticCodes: readonly string[];
  relatedNodeCount: number;
  nodes: readonly AxeProjectedNode[];
}>;

export type DecodedAxeAccessibilityPayload = Readonly<{
  format: 'prodivix.axe-accessibility-report';
  version: 1;
  tool: Readonly<{
    name: 'axe-core';
    version: string;
    schemaDigest: string;
  }>;
  scanId: string;
  targetId: string;
  violations: readonly AxeProjectedRule[];
  incomplete: readonly AxeProjectedRule[];
}>;

export type NormalizedAccessibilityFinding = Readonly<{
  ruleId: string;
  impact: AccessibilityImpact;
  targetId: string;
  messageKey: string;
  relatedNodeCount: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
  disposition: 'violation' | 'incomplete';
}>;

export type AutomatedAccessibilityResult = Readonly<{
  scanId: string;
  targetId: string;
  status: 'passed' | 'failed' | 'blocked';
  findings: readonly NormalizedAccessibilityFinding[];
  tool: DecodedAxeAccessibilityPayload['tool'];
}>;

const decodeAxeTool = (
  value: unknown
): DecodedAxeAccessibilityPayload['tool'] => {
  const tool = strictObject(value, '$.tool', [
    'name',
    'version',
    'schemaDigest',
  ]);
  return Object.freeze({
    name: strictEnum(tool.name, '$.tool.name', ['axe-core'] as const),
    version: strictString(tool.version, '$.tool.version', 64),
    schemaDigest: strictSha256Digest(tool.schemaDigest, '$.tool.schemaDigest'),
  });
};

const decodeAxeRule = (value: unknown, path: string): AxeProjectedRule => {
  const rule = strictObject(value, path, [
    'ruleId',
    'impact',
    'messageKey',
    'diagnosticCodes',
    'relatedNodeCount',
    'nodes',
  ]);
  const rawNodes = strictArray(
    rule.nodes,
    `${path}.nodes`,
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumAccessibilityNodesPerRule
  );
  if (rawNodes.length === 0) {
    throwPartial(
      `${path}.nodes`,
      `${path} must contain at least one sanitized semantic node.`
    );
  }
  const nodes = rawNodes.map((value, index) => {
    const nodePath = `${path}.nodes[${index}]`;
    const node = strictObject(
      value,
      nodePath,
      ['targetId'],
      ['sourceTraceDigest']
    );
    const sourceTraceDigest =
      node.sourceTraceDigest === undefined
        ? undefined
        : strictSha256Digest(
            node.sourceTraceDigest,
            `${nodePath}.sourceTraceDigest`
          );
    return Object.freeze({
      targetId: strictIdentifier(node.targetId, `${nodePath}.targetId`),
      ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
    });
  });
  assertUniqueIdentities(nodes, ({ targetId }) => targetId, `${path}.nodes`);
  return Object.freeze({
    ruleId: strictIdentifier(rule.ruleId, `${path}.ruleId`),
    impact: strictEnum(rule.impact, `${path}.impact`, [
      'minor',
      'moderate',
      'serious',
      'critical',
    ] as const),
    messageKey: strictIdentifier(rule.messageKey, `${path}.messageKey`),
    diagnosticCodes: strictDiagnosticCodes(
      rule.diagnosticCodes,
      `${path}.diagnosticCodes`
    ),
    relatedNodeCount: strictSafeInteger(
      rule.relatedNodeCount,
      `${path}.relatedNodeCount`,
      {
        minimum: rawNodes.length,
        maximum: 1_000_000,
      }
    ),
    nodes: Object.freeze(
      [...nodes].sort((left, right) =>
        compareUnicodeCodePoints(left.targetId, right.targetId)
      )
    ),
  });
};

/**
 * Accepts only the sanitized axe projection produced inside the first-party
 * browser boundary. Raw HTML snippets, selectors, handles, and vendor objects
 * are unknown fields and fail closed.
 */
export const decodeAxeAccessibilityPayload = (
  source: string | Uint8Array | unknown
): DecodedAxeAccessibilityPayload => {
  const decoded = decodePrivateJson(source, 'axe accessibility report');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'tool',
    'scanId',
    'targetId',
    'complete',
    'violations',
    'incomplete',
  ]);
  strictEnum(root.format, '$.format', [
    'prodivix.axe-accessibility-report',
  ] as const);
  if (root.version !== 1) {
    throwPartial(
      '$.version',
      'axe accessibility report uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throwPartial(
      '$.complete',
      'axe accessibility report is partial and cannot be normalized.'
    );
  }
  const decodeRules = (key: 'violations' | 'incomplete') =>
    strictArray(
      root[key],
      `$.${key}`,
      BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumAccessibilityRules
    ).map((entry, index) => decodeAxeRule(entry, `$.${key}[${index}]`));
  const violations = decodeRules('violations');
  const incomplete = decodeRules('incomplete');
  const allRules = [...violations, ...incomplete];
  assertUniqueIdentities(allRules, ({ ruleId }) => ruleId, '$.rules');
  const orderRules = (rules: readonly AxeProjectedRule[]) =>
    Object.freeze(
      [...rules].sort((left, right) =>
        compareUnicodeCodePoints(left.ruleId, right.ruleId)
      )
    );
  return Object.freeze({
    format: 'prodivix.axe-accessibility-report',
    version: 1,
    tool: decodeAxeTool(root.tool),
    scanId: strictIdentifier(root.scanId, '$.scanId'),
    targetId: strictIdentifier(root.targetId, '$.targetId'),
    violations: orderRules(violations),
    incomplete: orderRules(incomplete),
  });
};

export const normalizeAutomatedAccessibility = (
  report: DecodedAxeAccessibilityPayload
): AutomatedAccessibilityResult => {
  const findings = (
    [
      ...report.violations.map((rule) => [rule, 'violation'] as const),
      ...report.incomplete.map((rule) => [rule, 'incomplete'] as const),
    ] as const
  ).flatMap(([rule, disposition]) =>
    rule.nodes.map((node) =>
      Object.freeze({
        ruleId: rule.ruleId,
        impact: rule.impact,
        targetId: node.targetId,
        messageKey: rule.messageKey,
        relatedNodeCount: rule.relatedNodeCount,
        diagnosticCodes: rule.diagnosticCodes,
        ...(node.sourceTraceDigest === undefined
          ? {}
          : { sourceTraceDigest: node.sourceTraceDigest }),
        disposition,
      })
    )
  );
  findings.sort((left, right) => {
    const ruleOrder = compareUnicodeCodePoints(left.ruleId, right.ruleId);
    return ruleOrder === 0
      ? compareUnicodeCodePoints(left.targetId, right.targetId)
      : ruleOrder;
  });
  return Object.freeze({
    scanId: report.scanId,
    targetId: report.targetId,
    status:
      report.violations.length > 0
        ? 'failed'
        : report.incomplete.length > 0
          ? 'blocked'
          : 'passed',
    findings: Object.freeze(findings),
    tool: report.tool,
  });
};
