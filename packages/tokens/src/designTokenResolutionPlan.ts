import {
  DESIGN_TOKEN_RESOLUTION_ISSUE_CODES,
  type DesignTokenResolutionIssue,
  type DesignTokenResolutionPlanResult,
  type DesignTokenResolvedSource,
  type DesignTokenResolverDocument,
  type DesignTokenResolverSet,
  type DesignTokenResolverSource,
} from './designTokenResolver.types';

const normalizeInputName = (value: string): string =>
  value.toLowerCase();

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const expandSources = (
  sources: readonly DesignTokenResolverSource[],
  setsByName: ReadonlyMap<string, DesignTokenResolverSet>,
  output: DesignTokenResolverSource[],
  issues: DesignTokenResolutionIssue[],
  path: string,
  visiting = new Set<string>()
): void => {
  sources.forEach((source, index) => {
    if (source.kind === 'reference' && source.reference.target.kind === 'set') {
      const setName = normalizeInputName(source.reference.target.setName);
      const set = setsByName.get(setName);
      if (!set) {
        issues.push(
          Object.freeze({
            code: DESIGN_TOKEN_RESOLUTION_ISSUE_CODES.referenceMissing,
            path: `${path}/${index}`,
            message: `Set ${source.reference.target.setName} does not exist.`,
          })
        );
        return;
      }
      if (visiting.has(setName)) {
        issues.push(
          Object.freeze({
            code: DESIGN_TOKEN_RESOLUTION_ISSUE_CODES.referenceCycle,
            path: `${path}/${index}`,
            message: `Set reference ${set.name} forms a cycle.`,
          })
        );
        return;
      }
      const nextVisiting = new Set(visiting).add(setName);
      expandSources(
        set.sources,
        setsByName,
        output,
        issues,
        `/sets/${set.name}/sources`,
        nextVisiting
      );
      return;
    }
    output.push(source);
  });
};

/**
 * Validates a user theme/variant selection and flattens resolver precedence.
 * Token aliases intentionally remain unresolved until all ordered sources are
 * merged by a later value-resolution capability, as required by DTCG.
 */
export const createDesignTokenResolutionPlan = (
  document: DesignTokenResolverDocument,
  input: Readonly<Record<string, string>>
): DesignTokenResolutionPlanResult => {
  const issues: DesignTokenResolutionIssue[] = [];
  const effectiveModifiers = document.resolutionOrder.reduce<
    DesignTokenResolverDocument['modifiers'][number][]
  >((result, entry) => {
    if (
      entry.kind === 'modifier' &&
      !result.some(
        (modifier) =>
          normalizeInputName(modifier.name) === normalizeInputName(entry.name)
      )
    ) {
      result.push(entry.definition);
    }
    return result;
  }, []);
  const modifiersByName = new Map(
    effectiveModifiers.map((modifier) => [
      normalizeInputName(modifier.name),
      modifier,
    ])
  );
  const inputByName = new Map<string, { name: string; value: string }>();

  Object.entries(input).forEach(([name, value]) => {
    const key = normalizeInputName(name);
    const existing = inputByName.get(key);
    if (existing || !modifiersByName.has(key)) {
      issues.push(
        Object.freeze({
          code: DESIGN_TOKEN_RESOLUTION_ISSUE_CODES.unknownModifier,
          path: `/input/${name}`,
          message: existing
            ? `Modifier input ${name} duplicates ${existing.name} without regard to case.`
            : `Modifier ${name} is not declared by this resolver.`,
        })
      );
      return;
    }
    inputByName.set(key, { name, value });
  });

  const selection: Record<string, string> = {};
  effectiveModifiers.forEach((modifier) => {
    const key = normalizeInputName(modifier.name);
    const requested = inputByName.get(key)?.value ?? modifier.defaultContext;
    if (requested === undefined) {
      issues.push(
        Object.freeze({
          code: DESIGN_TOKEN_RESOLUTION_ISSUE_CODES.missingModifier,
          path: `/input/${modifier.name}`,
          message: `Modifier ${modifier.name} requires a context selection.`,
        })
      );
      return;
    }
    const context = modifier.contexts.find(
      (candidate) =>
        normalizeInputName(candidate.name) === normalizeInputName(requested)
    );
    if (!context) {
      issues.push(
        Object.freeze({
          code: DESIGN_TOKEN_RESOLUTION_ISSUE_CODES.invalidContext,
          path: `/input/${modifier.name}`,
          message: `Context ${requested} is not valid for modifier ${modifier.name}.`,
        })
      );
      return;
    }
    selection[modifier.name] = context.name;
  });

  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(
        issues.sort(
          (left, right) =>
            compareText(left.path, right.path) ||
            compareText(left.code, right.code)
        )
      ),
    });
  }

  const setsByName = new Map(
    document.sets.map((set) => [normalizeInputName(set.name), set])
  );
  const orderedSources: DesignTokenResolvedSource[] = [];
  document.resolutionOrder.forEach((entry) => {
    const sources: DesignTokenResolverSource[] = [];
    if (entry.kind === 'set') {
      expandSources(
        entry.definition.sources,
        setsByName,
        sources,
        issues,
        `/resolutionOrder/${entry.name}/sources`
      );
      sources.forEach((source) =>
        orderedSources.push(
          Object.freeze({
            precedence: orderedSources.length,
            orderEntryName: entry.name,
            orderEntryKind: 'set',
            source,
          })
        )
      );
      return;
    }
    const contextName =
      selection[entry.name] ?? selection[entry.definition.name];
    const context = entry.definition.contexts.find(
      (candidate) => candidate.name === contextName
    );
    if (!context) {
      issues.push(
        Object.freeze({
          code: DESIGN_TOKEN_RESOLUTION_ISSUE_CODES.invalidContext,
          path: `/resolutionOrder/${entry.name}`,
          message: `Modifier ${entry.name} has no selected context.`,
        })
      );
      return;
    }
    expandSources(
      context.sources,
      setsByName,
      sources,
      issues,
      `/resolutionOrder/${entry.name}/contexts/${context.name}`
    );
    sources.forEach((source) =>
      orderedSources.push(
        Object.freeze({
          precedence: orderedSources.length,
          orderEntryName: entry.name,
          orderEntryKind: 'modifier',
          contextName: context.name,
          source,
        })
      )
    );
  });

  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(
        issues.sort(
          (left, right) =>
            compareText(left.path, right.path) ||
            compareText(left.code, right.code)
        )
      ),
    });
  }

  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      selection: Object.freeze(selection),
      orderedSources: Object.freeze(orderedSources),
    }),
  });
};
