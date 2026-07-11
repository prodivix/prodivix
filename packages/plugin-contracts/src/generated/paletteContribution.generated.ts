/* eslint-disable */
/**
 * Generated from specs/plugins/palette-contribution-v1.schema.json.
 * DO NOT EDIT. Run `pnpm --filter @prodivix/plugin-contracts generate`.
 */

export type LocalId = string;
export type Label = string;
export type Placement =
  | {
      section: 'builtIn';
    }
  | {
      section: 'external';
      libraryId: LocalId;
    };
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
export type ChoiceId = string;

/**
 * Serializable component palette contribution contract for Prodivix Blueprint.
 */
export interface PaletteContributionV1 {
  $schema?: 'https://prodivix.dev/schemas/palette-contribution-v1.schema.json';
  schemaVersion: '1.0';
  surface: 'blueprint.components';
  /**
   * @minItems 1
   * @maxItems 128
   */
  groups: Group[];
}
export interface Group {
  id: LocalId;
  label: Label;
  placement: Placement;
  /**
   * @minItems 1
   * @maxItems 512
   */
  items: Item[];
}
export interface Item {
  kind: 'component';
  id: LocalId;
  label: Label;
  runtimeType?: RuntimeType;
  defaultProps?: JsonObject;
  propOptions?: {
    /**
     * @maxItems 128
     */
    [k: string]: string[];
  };
  presentation?: Presentation;
}
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface Presentation {
  scale?: number;
  /**
   * @minItems 1
   * @maxItems 64
   */
  sizes?: Option[];
  /**
   * @minItems 1
   * @maxItems 128
   */
  variants?: Variant[];
  status?: Status;
}
export interface Option {
  id: ChoiceId;
  label: Label;
  value: string;
}
export interface Variant {
  id: ChoiceId;
  label: Label;
  scale?: number;
  props?: JsonObject;
}
export interface Status {
  prop: string;
  label: Label;
  defaultValue?: string;
  /**
   * @minItems 1
   * @maxItems 64
   */
  options: Option[];
}
