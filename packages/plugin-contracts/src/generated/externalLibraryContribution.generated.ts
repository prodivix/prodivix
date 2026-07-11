/* eslint-disable */
/**
 * Generated from specs/plugins/external-library-contribution-v1.schema.json.
 * DO NOT EDIT. Run `pnpm --filter @prodivix/plugin-contracts generate`.
 */

export type LocalId = string;
export type Label = string;
export type PackageName = string;
export type Semver = string;
export type License = string;
export type ExportName = string;
export type RuntimeType = string;
export type PropertyName = string;

/**
 * Serializable external component library identity, component descriptor, slot, behavior, and dependency metadata contract.
 */
export interface ExternalLibraryContributionV1 {
  $schema?: 'https://prodivix.dev/schemas/external-library-contribution-v1.schema.json';
  schemaVersion: '1.0';
  libraryId: LocalId;
  displayName: Label;
  package: PackageCoordinate;
  hostImplementationId?: LocalId;
  exportDiscovery: ExportDiscovery;
  /**
   * @minItems 1
   * @maxItems 1024
   */
  components: Component[];
  /**
   * @maxItems 128
   */
  dependencies: Dependency[];
}
export interface PackageCoordinate {
  name: PackageName;
  version: Semver;
  license: License;
}
export interface ExportDiscovery {
  strategy: 'declared' | 'named-react-components';
  /**
   * @maxItems 1024
   */
  include?: ExportName[];
  /**
   * @maxItems 1024
   */
  exclude?: ExportName[];
}
export interface Component {
  exportName: ExportName;
  componentName: Label;
  runtimeType: RuntimeType;
  /**
   * @maxItems 256
   */
  props?: Prop[];
  /**
   * @maxItems 64
   */
  slots?: Slot[];
  /**
   * @maxItems 64
   */
  behaviorTags?: LocalId[];
}
export interface Prop {
  name: PropertyName;
  valueType:
    'string' | 'number' | 'boolean' | 'object' | 'array' | 'event' | 'unknown';
  required?: boolean;
  description?: string;
}
export interface Slot {
  name: PropertyName;
  cardinality: 'zero-or-one' | 'exactly-one' | 'many';
}
export interface Dependency {
  name: PackageName;
  version: Semver;
  kind: 'dependency' | 'peerDependency';
  license: License;
}
