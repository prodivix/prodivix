/* eslint-disable */
/**
 * Generated from specs/plugins/render-policy-contribution-v2.schema.json.
 * DO NOT EDIT. Run `pnpm --filter @prodivix/plugin-contracts generate`.
 */

export type LocalId = string;
export type RuntimeType = string;
export type ExportName = string;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
export type PropertyName = string;
export type Children =
  | {
      mode: 'preserve' | 'text-only' | 'children-only' | 'none';
    }
  | {
      mode: 'text-prop';
      prop: PropertyName;
    };
export type Label = string;

/**
 * Serializable canvas-safe component rendering policy with explicit render-surface compatibility requirements.
 */
export interface RenderPolicyContributionV2 {
  $schema?: 'https://prodivix.dev/schemas/render-policy-contribution-v2.schema.json';
  schemaVersion: '2.0';
  libraryId: LocalId;
  surface: SurfaceRequirements;
  /**
   * @minItems 1
   * @maxItems 1024
   */
  rules: Rule[];
}
export interface SurfaceRequirements {
  compatibility: 'container-native' | 'host-adapted' | 'isolated';
  viewport: 'container' | 'container-projected' | 'browser-native';
  browserMetrics: 'none' | 'surface-environment' | 'browser-native';
  styles:
    'inherited' | 'owner-scoped' | 'verified-transform' | 'document-isolated';
  focusKeyboard:
    'host-native' | 'host-bridge' | 'isolated-bridge' | 'design-proxy';
  intrinsicSize:
    | 'parent-constrained'
    | 'surface-measured'
    | 'explicit'
    | 'isolation-handshake';
}
export interface Rule {
  id: LocalId;
  runtimeType: RuntimeType;
  componentExport: ExportName;
  props?: PropsTransform;
  children: Children;
  portal: Portal;
  surface?: SurfaceRequirements;
  fallback: Fallback;
  hostImplementationId?: LocalId;
}
export interface PropsTransform {
  defaults?: JsonObject;
  /**
   * @maxItems 128
   */
  rename?: Rename[];
  /**
   * @maxItems 128
   */
  omit?: PropertyName[];
}
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface Rename {
  from: PropertyName;
  to: PropertyName;
}
export interface Portal {
  mode: 'inline' | 'host-overlay' | 'disabled';
  canvasOpen?: CanvasOpen;
}
export interface CanvasOpen {
  prop: PropertyName;
  when: 'always' | 'selected';
  value: boolean;
}
export interface Fallback {
  behavior: 'placeholder' | 'omit' | 'error';
  message?: Label;
}
