import { compareVerificationText } from './verificationCanonical';
import type {
  VerificationBrowserEngine,
  VerificationCheckDefinition,
  VerificationColorScheme,
  VerificationMatrix,
  VerificationMotion,
  VerificationScenarioDescriptor,
  VerificationSurface,
  VerificationViewportAxis,
} from './verification.types';

export type VerificationMatrixCoordinate = Readonly<{
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine?: VerificationBrowserEngine;
  viewport: VerificationViewportAxis;
  colorScheme: VerificationColorScheme;
  motion: VerificationMotion;
  locale: string;
}>;

export type VerificationMatrixExpansion = Readonly<{
  coordinates: readonly VerificationMatrixCoordinate[];
  totalCoordinates: number;
  truncated: boolean;
}>;

export const MAXIMUM_ENUMERATED_VERIFICATION_CELLS = 100_000;

const axisEnabled = (
  check: VerificationCheckDefinition,
  axis: VerificationCheckDefinition['matrixAxes'][number]
): boolean => check.matrixAxes.includes(axis);

export const sortVerificationValues = <T extends string>(
  values: readonly T[]
): readonly T[] =>
  Object.freeze([...new Set(values)].sort(compareVerificationText));

const sortedViewports = (
  values: readonly VerificationViewportAxis[]
): readonly VerificationViewportAxis[] =>
  Object.freeze(
    [...values].sort(
      (left, right) =>
        compareVerificationText(left.id, right.id) ||
        left.width - right.width ||
        left.height - right.height
    )
  );

const chooseAxis = <T extends string>(
  enabled: boolean,
  policyValues: readonly T[],
  supportedValues: readonly T[]
): readonly T[] => {
  const eligible =
    supportedValues.length === 0
      ? sortVerificationValues(policyValues)
      : sortVerificationValues(
          policyValues.filter((value) => supportedValues.includes(value))
        );
  return enabled ? eligible : eligible.slice(0, 1);
};

export const intersectVerificationConstraints = (
  constraints: readonly (readonly string[])[]
): readonly string[] => {
  const [first = Object.freeze([]), ...rest] = constraints;
  return sortVerificationValues(
    rest.reduce<readonly string[]>(
      (current, constraint) =>
        current.filter((value) => constraint.includes(value)),
      first
    )
  );
};

export const expandVerificationMatrix = (
  matrix: VerificationMatrix,
  check: VerificationCheckDefinition,
  scenario: VerificationScenarioDescriptor | undefined,
  impactedFrameworkTargets: readonly string[],
  maximumCoordinates: number
): VerificationMatrixExpansion => {
  const frameworkConstraints = [
    ...(check.frameworkTargets.length > 0 ? [check.frameworkTargets] : []),
    ...(scenario?.frameworkTargets.length ? [scenario.frameworkTargets] : []),
    ...(impactedFrameworkTargets.length > 0 ? [impactedFrameworkTargets] : []),
  ];
  const supportedFrameworkTargets =
    intersectVerificationConstraints(frameworkConstraints);
  const frameworkTargets =
    frameworkConstraints.length > 0 && supportedFrameworkTargets.length === 0
      ? Object.freeze([])
      : chooseAxis(
          axisEnabled(check, 'frameworkTarget'),
          matrix.frameworkTargets,
          supportedFrameworkTargets
        );
  const surfaces = chooseAxis(
    axisEnabled(check, 'surface'),
    matrix.surfaces,
    check.surfaces
  );
  const browserEngines = axisEnabled(check, 'browserEngine')
    ? chooseAxis(true, matrix.browserEngines, check.browserEngines)
    : ([undefined] as const);
  const viewports = axisEnabled(check, 'viewport')
    ? sortedViewports(matrix.viewports)
    : sortedViewports(matrix.viewports).slice(0, 1);
  const colorSchemes = chooseAxis(
    axisEnabled(check, 'colorScheme'),
    matrix.colorSchemes,
    Object.freeze([])
  );
  const motions = chooseAxis(
    axisEnabled(check, 'motion'),
    matrix.motions,
    Object.freeze([])
  );
  const locales = chooseAxis(
    axisEnabled(check, 'locale'),
    matrix.locales,
    Object.freeze([])
  );

  if (
    frameworkTargets.length === 0 ||
    surfaces.length === 0 ||
    browserEngines.length === 0 ||
    viewports.length === 0 ||
    colorSchemes.length === 0 ||
    motions.length === 0 ||
    locales.length === 0
  ) {
    return Object.freeze({
      coordinates: Object.freeze([]),
      totalCoordinates: 0,
      truncated: false,
    });
  }

  const totalCoordinates =
    frameworkTargets.length *
    surfaces.length *
    browserEngines.length *
    viewports.length *
    colorSchemes.length *
    motions.length *
    locales.length;
  const retainedCoordinates = Math.min(
    totalCoordinates,
    Math.max(0, Math.trunc(maximumCoordinates))
  );
  if (retainedCoordinates === 0) {
    return Object.freeze({
      coordinates: Object.freeze([]),
      totalCoordinates,
      truncated: totalCoordinates > 0,
    });
  }

  const coordinates: VerificationMatrixCoordinate[] = [];
  for (const frameworkTarget of frameworkTargets) {
    for (const surface of surfaces) {
      for (const browserEngine of browserEngines) {
        for (const viewport of viewports) {
          for (const colorScheme of colorSchemes) {
            for (const motion of motions) {
              for (const locale of locales) {
                coordinates.push(
                  Object.freeze({
                    frameworkTarget,
                    surface,
                    ...(browserEngine ? { browserEngine } : {}),
                    viewport,
                    colorScheme,
                    motion,
                    locale,
                  })
                );
                if (coordinates.length >= retainedCoordinates) {
                  return Object.freeze({
                    coordinates: Object.freeze(coordinates),
                    totalCoordinates,
                    truncated: coordinates.length < totalCoordinates,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return Object.freeze({
    coordinates: Object.freeze(coordinates),
    totalCoordinates,
    truncated: false,
  });
};
