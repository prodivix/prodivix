import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { useParams } from 'react-router';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CodeFileTree, type CodeFileKind } from './CodeFileTree';
import { useEditorShortcut } from '@/editor/shortcuts';
import {
  createCodeFile,
  createCodeFolder,
  findCodeNodeById,
  flattenCodeFiles,
  readCodeTree,
  removeCodeNodeById,
  renameCodeNode,
  updateCodeFileContent,
  writeCodeTree,
  type CodeResourceNode,
} from './codeTree';

type CodeResourcePageProps = {
  embedded?: boolean;
};

const getResourceManagerCodeSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.code.selection.${projectId?.trim() || 'default'}`;

const resolveTemplateByKind = (kind: CodeFileKind) => {
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
      content:
        '@vertex\nfn vs_main() -> @builtin(position) vec4f {\n  return vec4f(0.0, 0.0, 0.0, 1.0);\n}\n',
    };
  }
  return {
    name: 'untitled.glsl',
    mime: 'text/glsl',
    content: 'void main() {\n  gl_Position = vec4(0.0);\n}\n',
  };
};

const inferMimeByName = (name: string) => {
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

const resolveLanguageExtensionByName = (name: string) => {
  const lower = name.toLowerCase();
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.wgsl') ||
    lower.endsWith('.glsl') ||
    lower.endsWith('.json')
  ) {
    return javascript({ typescript: true, jsx: true });
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return css();
  }
  return javascript({ typescript: true, jsx: true });
};

export function CodeResourcePage({ embedded = false }: CodeResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const [tree, setTree] = useState<CodeResourceNode>(() =>
    readCodeTree(projectId)
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    const initialTree = readCodeTree(projectId);
    const storedSelection =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(
            getResourceManagerCodeSelectionStorageKey(projectId)
          );
    if (storedSelection && findCodeNodeById(initialTree, storedSelection)) {
      return storedSelection;
    }
    return flattenCodeFiles(initialTree)[0]?.id ?? initialTree.id;
  });
  const [requestRenameNodeId, setRequestRenameNodeId] = useState<string>();
  const [editorValue, setEditorValue] = useState('');

  const selectedNode = useMemo(
    () => findCodeNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  );
  const allFiles = useMemo(() => flattenCodeFiles(tree), [tree]);
  const selectedFile = selectedNode.type === 'file' ? selectedNode : undefined;
  const selectedFileSize =
    selectedFile?.size ?? selectedFile?.textContent?.length ?? 0;
  const isDirty = Boolean(
    selectedFile && editorValue !== (selectedFile.textContent ?? '')
  );

  const persistTree = (nextTree: CodeResourceNode) => {
    setTree(nextTree);
    writeCodeTree(projectId, nextTree);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!findCodeNodeById(tree, selectedNodeId)) {
      const fallbackId = flattenCodeFiles(tree)[0]?.id ?? tree.id;
      setSelectedNodeId(fallbackId);
      return;
    }
    window.localStorage.setItem(
      getResourceManagerCodeSelectionStorageKey(projectId),
      selectedNodeId
    );
  }, [projectId, selectedNodeId, tree]);

  useEffect(() => {
    if (!selectedFile) {
      setEditorValue('');
      return;
    }
    setEditorValue(selectedFile.textContent ?? '');
  }, [selectedFile?.id]);

  const collectNodeIds = (node: CodeResourceNode): Set<string> => {
    const ids = new Set<string>();
    const walk = (current: CodeResourceNode) => {
      ids.add(current.id);
      (current.children ?? []).forEach(walk);
    };
    walk(node);
    return ids;
  };

  const resolveCreatedNodeId = (
    previousTree: CodeResourceNode,
    nextTree: CodeResourceNode
  ) => {
    const beforeIds = collectNodeIds(previousTree);
    let createdId: string | undefined;
    const walk = (current: CodeResourceNode) => {
      if (createdId) return;
      if (!beforeIds.has(current.id)) {
        createdId = current.id;
        return;
      }
      (current.children ?? []).forEach(walk);
    };
    walk(nextTree);
    return createdId;
  };

  const handleCreateFolder = (parentId: string) => {
    const nextTree = createCodeFolder(tree, parentId, 'new-folder');
    const createdId = resolveCreatedNodeId(tree, nextTree);
    persistTree(nextTree);
    if (createdId) {
      setSelectedNodeId(createdId);
      setRequestRenameNodeId(createdId);
    }
  };

  const resolveDefaultKindByParent = (parentId: string): CodeFileKind => {
    const parent = findCodeNodeById(tree, parentId);
    const parentPath = parent?.path.toLowerCase() ?? '';
    if (parentPath.startsWith('code/styles')) return 'css';
    if (parentPath.startsWith('code/shaders')) return 'glsl';
    return 'ts';
  };

  const handleCreateCodeFile = (parentId: string, kind?: CodeFileKind) => {
    const resolvedKind = kind ?? resolveDefaultKindByParent(parentId);
    const template = resolveTemplateByKind(resolvedKind);
    const nextTree = createCodeFile(tree, parentId, {
      name: template.name,
      mime: template.mime,
      size: template.content.length,
      textContent: template.content,
      contentRef: `data:${template.mime};charset=utf-8,${encodeURIComponent(template.content)}`,
    });
    const createdId = resolveCreatedNodeId(tree, nextTree);
    persistTree(nextTree);
    if (createdId) {
      setSelectedNodeId(createdId);
      setRequestRenameNodeId(createdId);
    }
  };

  const handleSave = () => {
    if (!selectedFile) return;
    const nextTree = updateCodeFileContent(tree, selectedFile.id, editorValue);
    persistTree(nextTree);
  };

  useEditorShortcut(
    'Mod+S',
    () => {
      handleSave();
    },
    {
      allowInEditable: true,
    }
  );

  const shellClassName = embedded
    ? 'grid gap-4'
    : 'mx-auto grid w-full max-w-7xl gap-4 px-6 py-6';

  return (
    <section className={shellClassName}>
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <h2 className="text-base font-semibold text-(--text-primary)">
          {t('resourceManager.code.header.title')}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {t('resourceManager.code.header.description')}
        </p>
      </article>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <CodeFileTree
          tree={tree}
          selectedId={selectedNodeId}
          requestRenameNodeId={requestRenameNodeId}
          onSelect={(nodeId) => {
            setSelectedNodeId(nodeId);
            setRequestRenameNodeId(undefined);
          }}
          onCreateFolder={handleCreateFolder}
          onCreateCodeFile={handleCreateCodeFile}
          onRename={(nodeId, nextName) =>
            persistTree(renameCodeNode(tree, nodeId, nextName))
          }
          onDelete={(nodeId) => {
            const next = removeCodeNodeById(tree, nodeId);
            persistTree(next);
            if (selectedNodeId === nodeId) {
              setSelectedNodeId(next.id);
            }
          }}
        />

        <article className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
                {t('resourceManager.code.labels.selected')}
              </p>
              <h3 className="text-sm font-semibold text-(--text-primary)">
                {selectedNode.type === 'file'
                  ? selectedNode.name
                  : t('resourceManager.code.labels.folder')}
              </h3>
              <p className="text-xs text-(--text-secondary)">
                {selectedNode.path}
              </p>
            </div>
            <div className="text-xs text-(--text-secondary)">
              {t('resourceManager.code.labels.files')}:{' '}
              <strong>{allFiles.length}</strong>
            </div>
          </div>

          {selectedFile ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-(--text-secondary)">
                  {t('resourceManager.code.labels.mime')}:{' '}
                  {selectedFile.mime || inferMimeByName(selectedFile.name)} |
                  {t('resourceManager.code.labels.size')}: {selectedFileSize}{' '}
                  {t('resourceManager.code.labels.bytes')}
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-black/12 bg-black px-2.5 py-1.5 text-xs text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleSave}
                  disabled={!isDirty}
                >
                  <Save size={12} />
                  {t('resourceManager.code.actions.save')}
                </button>
              </div>
              <CodeMirror
                value={editorValue}
                onChange={(value) => setEditorValue(value)}
                extensions={[resolveLanguageExtensionByName(selectedFile.name)]}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
                className="rounded-lg border border-black/10 bg-black/[0.02] text-[12px] [&_.cm-editor]:min-h-[460px]"
              />
            </>
          ) : (
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm text-(--text-secondary)">
              {t('resourceManager.code.empty')}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
