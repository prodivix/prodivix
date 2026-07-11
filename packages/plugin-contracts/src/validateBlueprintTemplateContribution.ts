import type {
  BlueprintTemplateContributionV1,
  CompositionRule,
  Fragment,
  Sequence,
  Template,
} from '#contracts/generated/blueprintTemplateContribution.generated';
import { BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA } from '#contracts/generated/blueprintTemplateContributionSchema.generated';
import type { PluginDiagnostic } from '#contracts/diagnostics';
import {
  compileContributionSchema,
  contributionContractDiagnostic,
  validateContributionStructure,
  type ContributionDescriptorValidationResult,
} from '#contracts/contributionValidation';
import type { JsonValueValidationOptions } from '#contracts/jsonValue';

export type ValidateBlueprintTemplateContributionOptions =
  JsonValueValidationOptions;
export type ValidateBlueprintTemplateContributionResult =
  ContributionDescriptorValidationResult<BlueprintTemplateContributionV1>;

const POINT = 'blueprintTemplate';
const validateStructure =
  compileContributionSchema<BlueprintTemplateContributionV1>(
    BLUEPRINT_TEMPLATE_CONTRIBUTION_V1_SCHEMA
  );

const diagnostic = (message: string, path: string): PluginDiagnostic =>
  contributionContractDiagnostic(POINT, message, path);

const duplicateValues = (
  values: readonly string[],
  path: string,
  label: string
): PluginDiagnostic[] => {
  const seen = new Set<string>();
  const diagnostics: PluginDiagnostic[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) {
      diagnostics.push(
        diagnostic(
          `${label} ${JSON.stringify(value)} is declared more than once.`,
          `${path}/${index}`
        )
      );
    }
    seen.add(value);
  });
  return diagnostics;
};

const slotKey = (slot: CompositionRule['slots'][number]): string =>
  slot.target === 'children' ? 'children' : `region:${slot.name}`;

const validateSequence = (
  sequence: Sequence,
  path: string
): PluginDiagnostic[] => {
  const diagnostics: PluginDiagnostic[] = [];
  if (
    sequence.some((segment) => segment.match === 'any') &&
    sequence.length > 1
  ) {
    diagnostics.push(
      diagnostic(
        'A composition sequence using an any segment cannot contain other segments.',
        path
      )
    );
  }
  const runtimeTypes = new Set<string>();
  sequence.forEach((segment, index) => {
    if (segment.minItems > segment.maxItems) {
      diagnostics.push(
        diagnostic(
          'Composition segment minItems cannot exceed maxItems.',
          `${path}/${index}/minItems`
        )
      );
    }
    if (segment.match !== 'runtime-types') return;
    diagnostics.push(
      ...duplicateValues(
        segment.runtimeTypes,
        `${path}/${index}/runtimeTypes`,
        'Composition runtime type'
      )
    );
    segment.runtimeTypes.forEach((runtimeType, typeIndex) => {
      if (runtimeTypes.has(runtimeType)) {
        diagnostics.push(
          diagnostic(
            `Composition runtime type ${JSON.stringify(runtimeType)} is matched by more than one segment.`,
            `${path}/${index}/runtimeTypes/${typeIndex}`
          )
        );
      }
      runtimeTypes.add(runtimeType);
    });
  });
  return diagnostics;
};

const validateCompositionRules = (
  rules: readonly CompositionRule[]
): PluginDiagnostic[] => {
  const diagnostics: PluginDiagnostic[] = [];
  diagnostics.push(
    ...duplicateValues(
      rules.map((rule) => rule.id),
      '/compositionRules',
      'Composition rule id'
    ),
    ...duplicateValues(
      rules.map((rule) => rule.runtimeType),
      '/compositionRules',
      'Composition runtime type'
    )
  );
  rules.forEach((rule, ruleIndex) => {
    if (rule.parent.mode === 'listed') {
      diagnostics.push(
        ...duplicateValues(
          rule.parent.runtimeTypes,
          `/compositionRules/${ruleIndex}/parent/runtimeTypes`,
          'Allowed parent runtime type'
        )
      );
    }
    diagnostics.push(
      ...duplicateValues(
        rule.slots.map(slotKey),
        `/compositionRules/${ruleIndex}/slots`,
        'Composition slot'
      )
    );
    rule.slots.forEach((slot, slotIndex) => {
      diagnostics.push(
        ...validateSequence(
          slot.sequence,
          `/compositionRules/${ruleIndex}/slots/${slotIndex}/sequence`
        )
      );
    });
  });
  return diagnostics;
};

type FragmentGraph = Readonly<{
  parents: ReadonlyMap<string, string>;
  children: ReadonlyMap<string, readonly string[]>;
}>;

const inspectFragmentGraph = (
  fragment: Fragment,
  path: string,
  diagnostics: PluginDiagnostic[]
): FragmentGraph => {
  const nodes = new Set(Object.keys(fragment.nodesByLocalId));
  const roots = new Set(fragment.rootLocalIds);
  diagnostics.push(
    ...duplicateValues(
      fragment.rootLocalIds,
      `${path}/rootLocalIds`,
      'Fragment root'
    )
  );
  const parents = new Map<string, string>();
  const children = new Map<string, string[]>();

  const registerChildren = (
    ownerId: string,
    childIds: readonly string[],
    childPath: string
  ) => {
    if (!nodes.has(ownerId)) {
      diagnostics.push(
        diagnostic(
          `Fragment edge owner ${JSON.stringify(ownerId)} is not declared in nodesByLocalId.`,
          childPath
        )
      );
    }
    diagnostics.push(...duplicateValues(childIds, childPath, 'Fragment child'));
    childIds.forEach((childId, index) => {
      if (!nodes.has(childId)) {
        diagnostics.push(
          diagnostic(
            `Fragment child ${JSON.stringify(childId)} is not declared in nodesByLocalId.`,
            `${childPath}/${index}`
          )
        );
        return;
      }
      const currentParent = parents.get(childId);
      if (currentParent !== undefined) {
        diagnostics.push(
          diagnostic(
            `Fragment node ${JSON.stringify(childId)} has more than one parent.`,
            `${childPath}/${index}`
          )
        );
      } else {
        parents.set(childId, ownerId);
      }
      const current = children.get(ownerId) ?? [];
      current.push(childId);
      children.set(ownerId, current);
    });
  };

  Object.entries(fragment.childIdsByLocalId).forEach(([ownerId, childIds]) =>
    registerChildren(ownerId, childIds, `${path}/childIdsByLocalId/${ownerId}`)
  );
  Object.entries(fragment.regionsByLocalId ?? {}).forEach(
    ([ownerId, regions]) => {
      Object.entries(regions).forEach(([regionName, childIds]) =>
        registerChildren(
          ownerId,
          childIds,
          `${path}/regionsByLocalId/${ownerId}/${regionName}`
        )
      );
    }
  );

  fragment.rootLocalIds.forEach((rootId, index) => {
    if (!nodes.has(rootId)) {
      diagnostics.push(
        diagnostic(
          `Fragment root ${JSON.stringify(rootId)} is not declared in nodesByLocalId.`,
          `${path}/rootLocalIds/${index}`
        )
      );
    }
    if (parents.has(rootId)) {
      diagnostics.push(
        diagnostic(
          `Fragment root ${JSON.stringify(rootId)} cannot also be a child.`,
          `${path}/rootLocalIds/${index}`
        )
      );
    }
  });
  nodes.forEach((nodeId) => {
    if (!roots.has(nodeId) && !parents.has(nodeId)) {
      diagnostics.push(
        diagnostic(
          `Fragment node ${JSON.stringify(nodeId)} is orphaned.`,
          `${path}/nodesByLocalId/${nodeId}`
        )
      );
    }
  });

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (nodeId: string, depth: number) => {
    if (active.has(nodeId)) {
      diagnostics.push(
        diagnostic(
          `Fragment graph contains a cycle at ${JSON.stringify(nodeId)}.`,
          `${path}/nodesByLocalId/${nodeId}`
        )
      );
      return;
    }
    if (visited.has(nodeId)) return;
    if (depth > 32) {
      diagnostics.push(
        diagnostic(
          'Fragment graph exceeds the maximum depth of 32.',
          `${path}/nodesByLocalId/${nodeId}`
        )
      );
      return;
    }
    active.add(nodeId);
    (children.get(nodeId) ?? []).forEach((childId) =>
      visit(childId, depth + 1)
    );
    active.delete(nodeId);
    visited.add(nodeId);
  };
  fragment.rootLocalIds.forEach((rootId) => visit(rootId, 1));
  nodes.forEach((nodeId) => {
    if (!visited.has(nodeId)) {
      diagnostics.push(
        diagnostic(
          `Fragment node ${JSON.stringify(nodeId)} is not reachable from a root.`,
          `${path}/nodesByLocalId/${nodeId}`
        )
      );
    }
  });
  return { parents, children };
};

export const matchesBlueprintCompositionSequence = (
  sequence: Sequence,
  childTypes: readonly string[]
): boolean => {
  if (sequence.length === 1 && sequence[0]!.match === 'any') {
    return (
      childTypes.length >= sequence[0]!.minItems &&
      childTypes.length <= sequence[0]!.maxItems
    );
  }
  let offset = 0;
  for (const segment of sequence) {
    if (segment.match !== 'runtime-types') return false;
    const accepted = new Set(segment.runtimeTypes);
    let count = 0;
    while (
      offset < childTypes.length &&
      accepted.has(childTypes[offset]!) &&
      count < segment.maxItems
    ) {
      offset += 1;
      count += 1;
    }
    if (count < segment.minItems) return false;
  }
  return offset === childTypes.length;
};

const validateFragmentComposition = (
  template: Template,
  graph: FragmentGraph,
  rulesByRuntimeType: ReadonlyMap<string, CompositionRule>,
  path: string
): PluginDiagnostic[] => {
  const diagnostics: PluginDiagnostic[] = [];
  const fragment = template.fragment;
  Object.entries(fragment.nodesByLocalId).forEach(([localId, node]) => {
    const rule = rulesByRuntimeType.get(node.type);
    if (!rule) return;
    const parentId = graph.parents.get(localId);
    const parentType = parentId
      ? fragment.nodesByLocalId[parentId]?.type
      : undefined;
    if (
      rule.parent.mode === 'listed' &&
      (!parentType || !rule.parent.runtimeTypes.includes(parentType))
    ) {
      diagnostics.push(
        diagnostic(
          `Template node ${JSON.stringify(localId)} does not have an allowed parent runtime type.`,
          `${path}/fragment/nodesByLocalId/${localId}`
        )
      );
    }
    rule.slots.forEach((slot) => {
      const childIds =
        slot.target === 'children'
          ? (fragment.childIdsByLocalId[localId] ?? [])
          : (fragment.regionsByLocalId?.[localId]?.[slot.name] ?? []);
      const childTypes = childIds.flatMap((childId) => {
        const child = fragment.nodesByLocalId[childId];
        return child ? [child.type] : [];
      });
      if (!matchesBlueprintCompositionSequence(slot.sequence, childTypes)) {
        diagnostics.push(
          diagnostic(
            `Template node ${JSON.stringify(localId)} does not satisfy composition slot ${JSON.stringify(slotKey(slot))}.`,
            `${path}/fragment/nodesByLocalId/${localId}`
          )
        );
      }
    });
  });
  return diagnostics;
};

const validateTemplate = (
  template: Template,
  index: number,
  rulesByRuntimeType: ReadonlyMap<string, CompositionRule>
): PluginDiagnostic[] => {
  const path = `/templates/${index}`;
  const diagnostics: PluginDiagnostic[] = [];
  if (!template.fragment.nodesByLocalId[template.primaryLocalId]) {
    diagnostics.push(
      diagnostic(
        `Template primary node ${JSON.stringify(template.primaryLocalId)} is not declared in nodesByLocalId.`,
        `${path}/primaryLocalId`
      )
    );
  }
  const graph = inspectFragmentGraph(
    template.fragment,
    `${path}/fragment`,
    diagnostics
  );
  diagnostics.push(
    ...validateFragmentComposition(template, graph, rulesByRuntimeType, path)
  );
  return diagnostics;
};

const validateSemantics = (
  descriptor: BlueprintTemplateContributionV1
): PluginDiagnostic[] => {
  const rules = descriptor.compositionRules ?? [];
  const diagnostics = validateCompositionRules(rules);
  diagnostics.push(
    ...duplicateValues(
      descriptor.templates.map((template) => template.id),
      '/templates',
      'Blueprint template id'
    ),
    ...duplicateValues(
      descriptor.templates.map(
        (template) =>
          `${template.palette.contributionId}\u0000${template.palette.itemId}`
      ),
      '/templates',
      'Palette template binding'
    )
  );
  const rulesByRuntimeType = new Map(
    rules.map((rule) => [rule.runtimeType, rule] as const)
  );
  descriptor.templates.forEach((template, index) => {
    diagnostics.push(...validateTemplate(template, index, rulesByRuntimeType));
  });
  return diagnostics;
};

export const validateBlueprintTemplateContribution = (
  input: unknown,
  options: ValidateBlueprintTemplateContributionOptions = {}
): ValidateBlueprintTemplateContributionResult => {
  const result = validateContributionStructure(input, {
    point: POINT,
    label: 'Blueprint Template contribution',
    validate: validateStructure,
    json: options,
  });
  if (!result.ok) return result;
  const diagnostics = validateSemantics(result.descriptor);
  return diagnostics.length > 0 ? { ok: false, diagnostics } : result;
};
