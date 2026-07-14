import type { MouseEvent } from 'react';
import { Handle, Position } from '@xyflow/react';
import { javascript } from '@codemirror/lang-javascript';
import type { Completion } from '@codemirror/autocomplete';
import type { CodeSlotBinding } from '@prodivix/authoring';
import type { NodeGraphPort } from '@prodivix/nodegraph';

export type GraphNodeKind =
  | 'start'
  | 'end'
  | 'process'
  | 'if'
  | 'switch'
  | 'forEach'
  | 'tryCatch'
  | 'delay'
  | 'parallel'
  | 'race'
  | 'onMount'
  | 'onClick'
  | 'onInput'
  | 'onSubmit'
  | 'onRouteEnter'
  | 'onTimer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'fetch'
  | 'retry'
  | 'timeout'
  | 'cancel'
  | 'cacheRead'
  | 'cacheWrite'
  | 'compare'
  | 'math'
  | 'templateString'
  | 'jsonParse'
  | 'jsonStringify'
  | 'map'
  | 'filter'
  | 'reduce'
  | 'getState'
  | 'setState'
  | 'computed'
  | 'watchState'
  | 'localStorageRead'
  | 'localStorageWrite'
  | 'navigate'
  | 'routeParams'
  | 'routeQuery'
  | 'routeGuard'
  | 'renderComponent'
  | 'conditionalRender'
  | 'listRender'
  | 'toast'
  | 'modal'
  | 'log'
  | 'assert'
  | 'breakpoint'
  | 'mockData'
  | 'perfMark'
  | 'code'
  | 'string'
  | 'number'
  | 'expression'
  | 'playAnimation'
  | 'scrollTo'
  | 'focusControl'
  | 'clipboard'
  | 'validate'
  | 'rateLimit'
  | 'formContext'
  | 'formField'
  | 'webSocket'
  | 'uploadFile'
  | 'download'
  | 'envVar'
  | 'theme'
  | 'i18n'
  | 'mediaQuery'
  | 'subFlowCall'
  | 'subFlowInput'
  | 'subFlowOutput'
  | 'memoCache'
  | 'groupBox'
  | 'stickyNote';

export type SwitchCaseItem = { id: string; label: string };
export type FetchStatusItem = { id: string; code: string };
export type NodeBranchItem = { id: string; label: string };
export type NodeKeyValueItem = { id: string; key: string; value: string };

export type GraphNodeData = {
  label: string;
  kind: GraphNodeKind;
  value?: string;
  action?: string;
  mode?: string;
  description?: string;
  selector?: string;
  target?: string;
  behavior?: string;
  offset?: string;
  targetId?: string;
  timelineName?: string;
  speed?: string;
  iterations?: string;
  routePath?: string;
  endpoint?: string;
  protocols?: string;
  fieldName?: string;
  accept?: string;
  maxSizeMB?: string;
  openMode?: string;
  filename?: string;
  mimeType?: string;
  fallback?: string;
  parse?: string;
  key?: string;
  rules?: string;
  ruleType?: string;
  schema?: string;
  stopAtFirstError?: string;
  waitMs?: string;
  leading?: string;
  trailing?: string;
  maxWaitMs?: string;
  formId?: string;
  autoCreate?: string;
  resetOnSubmit?: string;
  defaultValue?: string;
  autoReconnect?: string;
  reconnectMs?: string;
  heartbeatMs?: string;
  theme?: string;
  locale?: string;
  namespace?: string;
  fallbackLocale?: string;
  mobileMax?: string;
  tabletMax?: string;
  debounceMs?: string;
  subGraphId?: string;
  inputBindings?:
    NodeKeyValueItem[] | Array<{ id?: string; key?: string; value?: string }>;
  outputBindings?:
    NodeKeyValueItem[] | Array<{ id?: string; key?: string; value?: string }>;
  name?: string;
  type?: string;
  required?: string;
  strategy?: string;
  ttlMs?: string;
  maxSize?: string;
  persist?: string;
  boxWidth?: string;
  boxHeight?: string;
  autoBoxWidth?: number;
  autoBoxHeight?: number;
  autoNoteWidth?: number;
  autoNoteHeight?: number;
  groupBoxId?: string;
  color?: string;
  stateKey?: string;
  operator?: string;
  timeoutMs?: string;
  code?: string;
  codeLanguage?: 'jsx' | 'tsx' | 'js' | 'ts' | 'glsl' | 'wgsl';
  codeSize?: 'sm' | 'md' | 'lg';
  expression?: string;
  executor?: CodeSlotBinding;
  ports?: NodeGraphPort[];
  codeArtifactOptions?: readonly Readonly<{
    id: string;
    path: string;
    language: 'ts' | 'js' | 'css' | 'scss' | 'glsl' | 'wgsl' | 'expr';
  }>[];
  method?: string;
  hasUrlInput?: boolean;
  cases?: SwitchCaseItem[] | string[];
  statusCodes?: FetchStatusItem[] | string[];
  branches?: NodeBranchItem[] | string[];
  keyValueEntries?:
    NodeKeyValueItem[] | Array<{ id?: string; key?: string; value?: string }>;
  onPortContextMenu?: (
    event: MouseEvent,
    nodeId: string,
    handleId: string,
    role: 'source' | 'target'
  ) => void;
  onAddCase?: (nodeId: string) => void;
  onRemoveCase?: (nodeId: string, caseId: string) => void;
  onToggleCollapse?: (nodeId: string) => void;
  onChangeValue?: (nodeId: string, value: string) => void;
  onChangeExpression?: (nodeId: string, expression: string) => void;
  onChangeCode?: (nodeId: string, code: string) => void;
  onBindCodeArtifact?: (nodeId: string, artifactId?: string) => void;
  onOpenCodeSlotDefinition?: (slotId: string) => void;
  onChangeCodeLanguage?: (
    nodeId: string,
    language: NonNullable<GraphNodeData['codeLanguage']>
  ) => void;
  onChangeCodeSize?: (
    nodeId: string,
    size: NonNullable<GraphNodeData['codeSize']>
  ) => void;
  onAddStatusCode?: (nodeId: string) => void;
  onRemoveStatusCode?: (nodeId: string, statusId: string) => void;
  onChangeStatusCode?: (nodeId: string, statusId: string, code: string) => void;
  onChangeMethod?: (nodeId: string, method: string) => void;
  onAddBranch?: (nodeId: string) => void;
  onRemoveBranch?: (nodeId: string, branchId: string) => void;
  onChangeBranchLabel?: (
    nodeId: string,
    branchId: string,
    label: string
  ) => void;
  onAddKeyValueEntry?: (nodeId: string) => void;
  onRemoveKeyValueEntry?: (nodeId: string, entryId: string) => void;
  onChangeKeyValueEntry?: (
    nodeId: string,
    entryId: string,
    field: 'key' | 'value',
    value: string
  ) => void;
  onAddBindingEntry?: (
    nodeId: string,
    binding: 'inputBindings' | 'outputBindings'
  ) => void;
  onRemoveBindingEntry?: (
    nodeId: string,
    binding: 'inputBindings' | 'outputBindings',
    entryId: string
  ) => void;
  onChangeBindingEntry?: (
    nodeId: string,
    binding: 'inputBindings' | 'outputBindings',
    entryId: string,
    field: 'key' | 'value',
    value: string
  ) => void;
  onChangeField?: (nodeId: string, field: string, value: string) => void;
  collapsed?: boolean;
  validationMessage?: string;
};

export type PortSemantic = 'control' | 'data' | 'condition';
export type PortMultiplicity = 'single' | 'multi';

export const resolveMultiplicity = (
  role: 'source' | 'target',
  semantic: PortSemantic
): PortMultiplicity => {
  if (role === 'target' && semantic === 'control') return 'multi';
  if (role === 'source' && semantic === 'data') return 'multi';
  return 'single';
};

export const normalizeCases = (
  cases?: GraphNodeData['cases']
): SwitchCaseItem[] => {
  if (!Array.isArray(cases)) return [];
  return cases
    .map((item, index) =>
      typeof item === 'string'
        ? { id: `${index}`, label: item }
        : {
            id: item.id || `${index}`,
            label: item.label || `case-${index + 1}`,
          }
    )
    .filter((item) => Boolean(item.id));
};

export const normalizeStatusCodes = (
  statusCodes?: GraphNodeData['statusCodes']
): FetchStatusItem[] => {
  if (!Array.isArray(statusCodes)) return [];
  return statusCodes
    .map((item, index) =>
      typeof item === 'string'
        ? { id: `${index}`, code: item || `${200 + index}` }
        : { id: item.id || `${index}`, code: item.code || `${200 + index}` }
    )
    .filter((item) => Boolean(item.id));
};

export const normalizeBranches = (
  branches?: GraphNodeData['branches']
): NodeBranchItem[] => {
  if (!Array.isArray(branches)) return [];
  return branches
    .map((item, index) =>
      typeof item === 'string'
        ? { id: `${index}`, label: item || `branch-${index + 1}` }
        : {
            id: item.id || `${index}`,
            label: item.label || `branch-${index + 1}`,
          }
    )
    .filter((item) => Boolean(item.id));
};

export const normalizeKeyValueEntries = (
  entries?: GraphNodeData['keyValueEntries']
): NodeKeyValueItem[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((item, index) => ({
      id: item.id || `${index}`,
      key: item.key || '',
      value: item.value || '',
    }))
    .filter((item) => Boolean(item.id));
};

export const normalizeBindingEntries = (
  entries?: GraphNodeData['inputBindings'] | GraphNodeData['outputBindings']
): NodeKeyValueItem[] => normalizeKeyValueEntries(entries);

export const formatCountLabel = (
  count: number,
  singular: string,
  plural: string
) => `${count} ${count === 1 ? singular : plural}`;

export const estimateStickyNoteSize = (content: string) => {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const visibleLines = lines.length ? lines : [''];
  const plainLines = visibleLines.map((line) =>
    line.replace(/[`*_~[\]()>#-]/g, '').trim()
  );
  const longestLine = plainLines.reduce(
    (max, line) => Math.max(max, line.length),
    0
  );
  const lineCount = Math.max(visibleLines.length, 1);
  const hasContent = normalized.trim().length > 0;
  const extraRows = Math.floor(normalized.length / 160);
  const horizontalPadding = 20;
  const verticalPadding = 14;
  const minWidth = hasContent ? 24 : 86;
  const minHeight = hasContent ? 30 : 38;
  return {
    width: Math.min(
      Math.max(longestLine * 8 + horizontalPadding * 2, minWidth),
      1100
    ),
    height: Math.min(
      Math.max(
        lineCount * 18 + verticalPadding * 2 + extraRows * 10,
        minHeight
      ),
      1200
    ),
  };
};

export const CODE_LANGUAGE_KEYWORDS: Record<
  NonNullable<GraphNodeData['codeLanguage']>,
  Completion[]
> = {
  js: [
    { label: 'function', type: 'keyword' },
    { label: 'const', type: 'keyword' },
    { label: 'let', type: 'keyword' },
    { label: 'await', type: 'keyword' },
    { label: 'console.log', type: 'function' },
  ],
  jsx: [
    { label: 'function', type: 'keyword' },
    { label: 'const', type: 'keyword' },
    { label: 'return', type: 'keyword' },
    { label: 'useState', type: 'function' },
    { label: '<div>', type: 'keyword' },
  ],
  ts: [
    { label: 'type', type: 'keyword' },
    { label: 'interface', type: 'keyword' },
    { label: 'const', type: 'keyword' },
    { label: 'async', type: 'keyword' },
    { label: 'Promise', type: 'class' },
  ],
  tsx: [
    { label: 'type', type: 'keyword' },
    { label: 'interface', type: 'keyword' },
    { label: 'useMemo', type: 'function' },
    { label: 'useEffect', type: 'function' },
    { label: '<div>', type: 'keyword' },
  ],
  glsl: [
    { label: 'uniform', type: 'keyword' },
    { label: 'varying', type: 'keyword' },
    { label: 'vec2', type: 'class' },
    { label: 'vec3', type: 'class' },
    { label: 'vec4', type: 'class' },
    { label: 'gl_FragColor', type: 'variable' },
  ],
  wgsl: [
    { label: 'fn', type: 'keyword' },
    { label: 'var', type: 'keyword' },
    { label: 'let', type: 'keyword' },
    { label: 'vec2f', type: 'class' },
    { label: 'vec3f', type: 'class' },
    { label: '@fragment', type: 'keyword' },
  ],
};

export const resolveCodeLanguageExtension = (
  language: NonNullable<GraphNodeData['codeLanguage']>
) => {
  switch (language) {
    case 'jsx':
      return javascript({ jsx: true });
    case 'js':
      return javascript();
    case 'ts':
      return javascript({ typescript: true });
    case 'glsl':
      return javascript();
    case 'wgsl':
      return javascript({ typescript: true });
    case 'tsx':
    default:
      return javascript({ jsx: true, typescript: true });
  }
};

export const renderTarget = (
  id: string,
  handleId: string,
  semantic: PortSemantic,
  multiplicity: PortMultiplicity,
  top: string | undefined,
  onPortContextMenu: GraphNodeData['onPortContextMenu']
) => (
  <Handle
    id={handleId}
    type="target"
    position={Position.Left}
    className={`native-switch-port semantic-${semantic} ${
      multiplicity === 'multi' ? 'is-multi' : ''
    }`}
    style={top ? { top } : undefined}
    onContextMenu={
      onPortContextMenu
        ? (event) => onPortContextMenu(event, id, handleId, 'target')
        : undefined
    }
  />
);

export const renderSource = (
  id: string,
  handleId: string,
  semantic: PortSemantic,
  multiplicity: PortMultiplicity,
  top: string | undefined,
  onPortContextMenu: GraphNodeData['onPortContextMenu']
) => (
  <Handle
    id={handleId}
    type="source"
    position={Position.Right}
    className={`native-switch-port semantic-${semantic} ${
      multiplicity === 'multi' ? 'is-multi' : ''
    }`}
    style={top ? { top } : undefined}
    onContextMenu={
      onPortContextMenu
        ? (event) => onPortContextMenu(event, id, handleId, 'source')
        : undefined
    }
  />
);
