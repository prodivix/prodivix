/* eslint-disable */
/**
 * Generated from specs/plugins/blueprint-template-contribution-v1.schema.json.
 * DO NOT EDIT. Run `pnpm --filter @prodivix/plugin-contracts generate`.
 */

export type LocalId = string;
export type RuntimeType = string;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
/**
 * @maxItems 128
 */
export type LocalIdList = LocalId[];
/**
 * @minItems 1
 * @maxItems 32
 */
export type Sequence = (SegmentAny | SegmentRuntimeTypes)[];
export type RegionName = string;

/**
 * Serializable normalized PIR fragments and bounded composition rules for Blueprint Palette creation.
 */
export interface BlueprintTemplateContributionV1 {
  $schema?: 'https://prodivix.dev/schemas/blueprint-template-contribution-v1.schema.json';
  schemaVersion: '1.0';
  surface: 'blueprint.components';
  /**
   * @minItems 1
   * @maxItems 512
   */
  templates: Template[];
  /**
   * @maxItems 1024
   */
  compositionRules?: CompositionRule[];
}
export interface Template {
  id: LocalId;
  palette: PaletteBinding;
  primaryLocalId: LocalId;
  fragment: Fragment;
}
export interface PaletteBinding {
  contributionId: LocalId;
  itemId: LocalId;
}
export interface Fragment {
  /**
   * @minItems 1
   * @maxItems 16
   */
  rootLocalIds: LocalId[];
  nodesByLocalId: {
    [k: string]: Node;
  };
  childIdsByLocalId: {
    [k: string]: LocalIdList;
  };
  regionsByLocalId?: {
    [k: string]: {
      [k: string]: LocalIdList;
    };
  };
}
export interface Node {
  type: RuntimeType;
  props?: JsonObject;
  style?: JsonObject;
  text?: JsonValue;
}
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface CompositionRule {
  id: LocalId;
  runtimeType: RuntimeType;
  parent: ParentAny | ParentListed;
  /**
   * @maxItems 64
   */
  slots: (SlotChildren | SlotRegion)[];
}
export interface ParentAny {
  mode: 'any';
}
export interface ParentListed {
  mode: 'listed';
  /**
   * @minItems 1
   * @maxItems 128
   */
  runtimeTypes: RuntimeType[];
}
export interface SlotChildren {
  target: 'children';
  sequence: Sequence;
}
export interface SegmentAny {
  match: 'any';
  minItems: number;
  maxItems: number;
}
export interface SegmentRuntimeTypes {
  match: 'runtime-types';
  /**
   * @minItems 1
   * @maxItems 128
   */
  runtimeTypes: RuntimeType[];
  minItems: number;
  maxItems: number;
}
export interface SlotRegion {
  target: 'region';
  name: RegionName;
  sequence: Sequence;
}
