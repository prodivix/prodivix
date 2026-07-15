import {
  writeShaderCompileProfile,
  type ShaderCompileProfile,
} from '@prodivix/authoring';
import type { PublicResourceNode } from '@/editor/features/resources/publicTree';

export type CodeResourceNode = Omit<PublicResourceNode, 'children'> & {
  source?: 'workspace-vfs' | 'workspace-document';
  children?: CodeResourceNode[];
};

export type CodeFileKind =
  'ts' | 'tsx' | 'js' | 'css' | 'scss' | 'json' | 'wgsl' | 'glsl';

export type CodeFileTemplate = {
  name: string;
  mime: string;
  content: string;
  metadata?: Record<string, unknown>;
};

const shaderMetadata = (
  profile: ShaderCompileProfile
): Record<string, unknown> => writeShaderCompileProfile(undefined, profile)!;

export const CODE_FILE_KINDS: CodeFileKind[] = [
  'ts',
  'tsx',
  'js',
  'css',
  'scss',
  'json',
  'wgsl',
  'glsl',
];

export const getCodeAuthoringSelectionStorageKey = (projectId?: string) =>
  `prodivix.codeAuthoring.selection.${projectId?.trim() || 'default'}`;

export const resolveTemplateByCodeKind = (
  kind: CodeFileKind
): CodeFileTemplate => {
  if (kind === 'ts') {
    return {
      name: 'untitled.ts',
      mime: 'text/typescript',
      content: 'export const hello = "prodivix";\n',
    };
  }
  if (kind === 'tsx') {
    return {
      name: 'untitled.tsx',
      mime: 'text/tsx',
      content: 'export function Demo() {\n  return <div>demo</div>;\n}\n',
    };
  }
  if (kind === 'js') {
    return {
      name: 'untitled.js',
      mime: 'text/javascript',
      content: 'export const hello = "prodivix";\n',
    };
  }
  if (kind === 'css') {
    return {
      name: 'untitled.css',
      mime: 'text/css',
      content: '.demo {\n  display: block;\n}\n',
    };
  }
  if (kind === 'scss') {
    return {
      name: 'untitled.scss',
      mime: 'text/x-scss',
      content: '.demo {\n  .title {\n    color: #111;\n  }\n}\n',
    };
  }
  if (kind === 'json') {
    return {
      name: 'untitled.json',
      mime: 'application/json',
      content: '{\n  "name": "resource"\n}\n',
    };
  }
  if (kind === 'wgsl') {
    return {
      name: 'untitled.wgsl',
      mime: 'text/wgsl',
      metadata: shaderMetadata({
        schemaVersion: '1.0',
        target: 'webgpu',
        stage: 'vertex',
        entryPoint: 'vs_main',
      }),
      content:
        '@vertex\nfn vs_main() -> @builtin(position) vec4f {\n  return vec4f(0.0, 0.0, 0.0, 1.0);\n}\n',
    };
  }
  return {
    name: 'untitled.glsl',
    mime: 'text/glsl',
    metadata: shaderMetadata({
      schemaVersion: '1.0',
      target: 'webgl2',
      stage: 'vertex',
    }),
    content:
      '#version 300 es\nprecision highp float;\n\nvoid main() {\n  gl_Position = vec4(0.0);\n}\n',
  };
};

export const inferMimeByCodeFileName = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ts')) return 'text/typescript';
  if (lower.endsWith('.tsx')) return 'text/tsx';
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.jsx')) return 'text/jsx';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.scss')) return 'text/x-scss';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.wgsl')) return 'text/wgsl';
  if (lower.endsWith('.glsl')) return 'text/glsl';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
};

export const resolveDefaultCodeKindByParentPath = (
  parentPath: string
): CodeFileKind => {
  const normalizedPath = parentPath.toLowerCase();
  if (normalizedPath.startsWith('code/styles')) return 'css';
  if (normalizedPath.startsWith('code/shaders')) return 'glsl';
  return 'ts';
};

export type CodeResourceEditorBaseline = {
  documentId: string;
  source: string;
};

export const reconcileCodeResourceEditorDraft = (input: {
  baseline: CodeResourceEditorBaseline | undefined;
  editorValue: string;
  documentId: string;
  source: string;
}): { baseline: CodeResourceEditorBaseline; editorValue: string } => {
  const nextBaseline = {
    documentId: input.documentId,
    source: input.source,
  };
  if (!input.baseline || input.baseline.documentId !== input.documentId) {
    return { baseline: nextBaseline, editorValue: input.source };
  }
  if (input.baseline.source === input.source) {
    return { baseline: input.baseline, editorValue: input.editorValue };
  }
  return {
    baseline: nextBaseline,
    editorValue:
      input.editorValue === input.baseline.source
        ? input.source
        : input.editorValue,
  };
};
