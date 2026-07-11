import type { ContributionPoint } from '#contracts/generated/pluginManifest.generated';

export const BUILT_IN_CONTRIBUTION_POINTS = Object.freeze([
  'command.intent',
  'externalLibrary',
  'renderPolicy',
  'codegenPolicy',
  'iconProvider',
  'blueprintTemplate',
  'inspectorContribution',
  'paletteContribution',
  'animationExtension',
  'nodeGraphExtension',
  'codeAuthoringExtension',
  'diagnosticProvider',
  'workspaceDocumentType',
  'importExportProvider',
  'aiContextProvider',
] as const satisfies readonly ContributionPoint[]);

export type BuiltInContributionPoint =
  (typeof BUILT_IN_CONTRIBUTION_POINTS)[number];

const builtInContributionPoints: ReadonlySet<string> = new Set(
  BUILT_IN_CONTRIBUTION_POINTS
);

export const isBuiltInContributionPoint = (
  point: ContributionPoint
): point is BuiltInContributionPoint => builtInContributionPoints.has(point);
