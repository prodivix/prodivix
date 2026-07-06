import {
  BUILT_IN_META_NAMESPACES,
  BUILT_IN_META_SOURCE_PRIORITY,
  type BuiltInComponentMeta,
  type BuiltInMetaSource,
} from './builtInMeta.types';

export type BuiltInMetaResolutionPolicy = {
  namespace: (typeof BUILT_IN_META_NAMESPACES)['builtIn'];
  externalNamespace: (typeof BUILT_IN_META_NAMESPACES)['external'];
  sourcePriority: readonly BuiltInMetaSource[];
};

export const BUILT_IN_META_RESOLUTION_POLICY: BuiltInMetaResolutionPolicy = {
  namespace: BUILT_IN_META_NAMESPACES.builtIn,
  externalNamespace: BUILT_IN_META_NAMESPACES.external,
  sourcePriority: BUILT_IN_META_SOURCE_PRIORITY,
};

const getSourcePriorityRank = (source: BuiltInMetaSource) =>
  BUILT_IN_META_RESOLUTION_POLICY.sourcePriority.indexOf(source);

export const compareBuiltInMetaSourcePriority = (
  left: BuiltInMetaSource,
  right: BuiltInMetaSource
) => getSourcePriorityRank(left) - getSourcePriorityRank(right);

export const pickPreferredBuiltInMeta = (
  candidates: Array<BuiltInComponentMeta | null | undefined>
) =>
  candidates
    .filter((candidate): candidate is BuiltInComponentMeta =>
      Boolean(candidate)
    )
    .sort((left, right) =>
      compareBuiltInMetaSourcePriority(left.source, right.source)
    )[0];
