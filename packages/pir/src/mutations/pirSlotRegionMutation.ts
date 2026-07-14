import type { PIRUiGraph } from '../pir.types';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  collectPirSubtreeNodeIds,
  createPirMutationIssue,
  freezePirMutationIssues,
  type PIRCollectionRegions,
  type PIRComponentMutationIssue,
  type PIRComponentMutationIssueCode,
  type PIRComponentSlotRegions,
  type PIRResolvedCollectionRegions,
  type PIRResolvedComponentSlotRegions,
  type PIRResolvedGraphPlacement,
} from './pirMutationGraph';

type ComponentSlotRegionResolution =
  | Readonly<{
      ok: true;
      value: PIRResolvedComponentSlotRegions;
    }>
  | Readonly<{
      ok: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

type CollectionRegionResolution =
  | Readonly<{
      ok: true;
      value: PIRResolvedCollectionRegions;
    }>
  | Readonly<{
      ok: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

type OwnedRegionProfile = Readonly<{
  rootPath: string;
  ownerLabel: string;
  memberLabel: string;
  invalidRegionCode: PIRComponentMutationIssueCode;
  childNotFoundCode: PIRComponentMutationIssueCode;
  duplicateChildCode: PIRComponentMutationIssueCode;
  invalidChildCode: PIRComponentMutationIssueCode;
  allowedRegionNames?: ReadonlySet<string>;
  requiredRegionNames?: readonly string[];
}>;

type OwnedRegionResolution =
  | Readonly<{
      ok: true;
      value: Readonly<{
        regions: Readonly<Record<string, readonly string[]>>;
        relocatedChildNodeIds: readonly string[];
        placement: PIRResolvedGraphPlacement;
      }>;
    }>
  | Readonly<{
      ok: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

const COMPONENT_SLOT_PROFILE: OwnedRegionProfile = Object.freeze({
  rootPath: '/slotRegions',
  ownerLabel: 'Component slot',
  memberLabel: 'Slot member id',
  invalidRegionCode: PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidSlotRegion,
  childNotFoundCode: PIR_COMPONENT_MUTATION_ISSUE_CODES.slotChildNotFound,
  duplicateChildCode: PIR_COMPONENT_MUTATION_ISSUE_CODES.duplicateSlotChild,
  invalidChildCode: PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidSlotChild,
});

const COLLECTION_PROFILE: OwnedRegionProfile = Object.freeze({
  rootPath: '/regions',
  ownerLabel: 'Collection region',
  memberLabel: 'Collection region name',
  invalidRegionCode: PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidCollectionRegion,
  childNotFoundCode:
    PIR_COMPONENT_MUTATION_ISSUE_CODES.collectionRegionChildNotFound,
  duplicateChildCode:
    PIR_COMPONENT_MUTATION_ISSUE_CODES.duplicateCollectionRegionChild,
  invalidChildCode:
    PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidCollectionRegionChild,
  allowedRegionNames: new Set(['item', 'empty', 'loading', 'error']),
  requiredRegionNames: Object.freeze(['item']),
});

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolvePirOwnedRegions = (
  graph: PIRUiGraph,
  ownedRegions: unknown,
  placement: PIRResolvedGraphPlacement,
  profile: OwnedRegionProfile
): OwnedRegionResolution => {
  if (!isRecord(ownedRegions)) {
    return {
      ok: false,
      issues: Object.freeze([
        createPirMutationIssue(
          profile.invalidRegionCode,
          profile.rootPath,
          `${profile.ownerLabel} map must be an object.`
        ),
      ]),
    };
  }

  const issues: PIRComponentMutationIssue[] = [];
  for (const requiredName of profile.requiredRegionNames ?? []) {
    if (Object.hasOwn(ownedRegions, requiredName)) continue;
    issues.push(
      createPirMutationIssue(
        profile.invalidRegionCode,
        `${profile.rootPath}/${escapeJsonPointerSegment(requiredName)}`,
        `${profile.ownerLabel} map must define "${requiredName}".`
      )
    );
  }

  const seenChildIds = new Set<string>();
  const childPathById = new Map<string, string>();
  const canonicalRegions: Record<string, readonly string[]> = {};
  for (const regionName of Object.keys(ownedRegions).sort(compareText)) {
    const path = `${profile.rootPath}/${escapeJsonPointerSegment(regionName)}`;
    if (!regionName.trim()) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
          path,
          `${profile.memberLabel} must be non-empty.`
        )
      );
    }
    if (
      profile.allowedRegionNames &&
      !profile.allowedRegionNames.has(regionName)
    ) {
      issues.push(
        createPirMutationIssue(
          profile.invalidRegionCode,
          path,
          `${profile.ownerLabel} name is not supported.`
        )
      );
    }
    const childIds = ownedRegions[regionName];
    if (!Array.isArray(childIds)) {
      issues.push(
        createPirMutationIssue(
          profile.invalidRegionCode,
          path,
          `${profile.ownerLabel} children must be an array.`
        )
      );
      continue;
    }
    canonicalRegions[regionName] = [...childIds];
    childIds.forEach((childNodeId, index) => {
      const childPath = `${path}/${index}`;
      if (typeof childNodeId !== 'string' || !childNodeId.trim()) {
        issues.push(
          createPirMutationIssue(
            PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
            childPath,
            `${profile.ownerLabel} child node id must be non-empty.`
          )
        );
        return;
      }
      if (seenChildIds.has(childNodeId)) {
        issues.push(
          createPirMutationIssue(
            profile.duplicateChildCode,
            childPath,
            `A node may be mounted into only one ${profile.ownerLabel}.`
          )
        );
        return;
      }
      seenChildIds.add(childNodeId);
      childPathById.set(childNodeId, childPath);
      if (!graph.nodesById[childNodeId]) {
        issues.push(
          createPirMutationIssue(
            profile.childNotFoundCode,
            childPath,
            `${profile.ownerLabel} child node does not exist in the PIR graph.`
          )
        );
        return;
      }
      if (childNodeId === graph.rootId) {
        issues.push(
          createPirMutationIssue(
            profile.invalidChildCode,
            childPath,
            `The document root cannot be reparented into a ${profile.ownerLabel}.`
          )
        );
        return;
      }
      if (
        collectPirSubtreeNodeIds(graph, childNodeId).includes(
          placement.parentId
        )
      ) {
        issues.push(
          createPirMutationIssue(
            profile.invalidChildCode,
            childPath,
            `${profile.ownerLabel} child relocation would create a graph cycle.`
          )
        );
      }
    });
  }

  const selectedChildIds = [...seenChildIds].sort(compareText);
  for (let leftIndex = 0; leftIndex < selectedChildIds.length; leftIndex += 1) {
    const leftId = selectedChildIds[leftIndex]!;
    if (!graph.nodesById[leftId]) continue;
    const leftSubtreeIds = new Set(collectPirSubtreeNodeIds(graph, leftId));
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < selectedChildIds.length;
      rightIndex += 1
    ) {
      const rightId = selectedChildIds[rightIndex]!;
      if (!graph.nodesById[rightId]) continue;
      const nestedId = leftSubtreeIds.has(rightId)
        ? rightId
        : collectPirSubtreeNodeIds(graph, rightId).includes(leftId)
          ? leftId
          : undefined;
      if (!nestedId) continue;
      issues.push(
        createPirMutationIssue(
          profile.invalidChildCode,
          childPathById.get(nestedId) ?? profile.rootPath,
          `${profile.ownerLabel} roots must not be ancestors or descendants of one another.`
        )
      );
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues: freezePirMutationIssues(issues) };
  }

  const targetIds =
    placement.regionName === undefined
      ? (graph.childIdsById[placement.parentId] ?? [])
      : (graph.regionsById?.[placement.parentId]?.[placement.regionName] ?? []);
  const relocatedBeforeInsertion = targetIds
    .slice(0, placement.index)
    .filter((nodeId) => seenChildIds.has(nodeId)).length;
  return {
    ok: true,
    value: Object.freeze({
      regions: Object.freeze(canonicalRegions),
      relocatedChildNodeIds: Object.freeze([...seenChildIds].sort(compareText)),
      placement: Object.freeze({
        ...placement,
        index: placement.index - relocatedBeforeInsertion,
      }),
    }),
  };
};

/** Validates and canonicalizes slot child relocation for an insertion. */
export const resolvePirComponentSlotRegions = (
  graph: PIRUiGraph,
  slotRegions: PIRComponentSlotRegions | undefined,
  placement: PIRResolvedGraphPlacement
): ComponentSlotRegionResolution => {
  const result = resolvePirOwnedRegions(
    graph,
    slotRegions ?? {},
    placement,
    COMPONENT_SLOT_PROFILE
  );
  return result.ok
    ? {
        ok: true,
        value: {
          ...result.value,
          regions: result.value.regions as PIRComponentSlotRegions,
        },
      }
    : result;
};

/** Validates canonical Collection states and child relocation as one unit. */
export const resolvePirCollectionRegions = (
  graph: PIRUiGraph,
  regions: PIRCollectionRegions | undefined,
  placement: PIRResolvedGraphPlacement
): CollectionRegionResolution => {
  const result = resolvePirOwnedRegions(
    graph,
    regions ?? { item: [] },
    placement,
    COLLECTION_PROFILE
  );
  return result.ok
    ? {
        ok: true,
        value: {
          ...result.value,
          regions: result.value.regions as PIRCollectionRegions,
        },
      }
    : result;
};
