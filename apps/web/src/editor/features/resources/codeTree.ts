import type { PublicFileCategory, PublicResourceNode } from './publicTree';

export type CodeResourceNode = PublicResourceNode;

export const CODE_TREE_ROOT_ID = 'code-root';

const nowIso = () => new Date().toISOString();

const getCodeTreeStorageKey = (projectId?: string) =>
  `prodivix.codeTree.${projectId?.trim() || 'default'}`;

const createFolderNode = (
  id: string,
  name: string,
  parentId: string | null
): CodeResourceNode => ({
  id,
  name,
  type: 'folder',
  path: '',
  parentId,
  category: 'document',
  mime: 'inode/directory',
  updatedAt: nowIso(),
  children: [],
});

export const createDefaultCodeTree = (): CodeResourceNode => ({
  ...createFolderNode(CODE_TREE_ROOT_ID, 'code', null),
  children: [
    createFolderNode('code-scripts', 'scripts', CODE_TREE_ROOT_ID),
    createFolderNode('code-styles', 'styles', CODE_TREE_ROOT_ID),
    createFolderNode('code-shaders', 'shaders', CODE_TREE_ROOT_ID),
  ],
});

const withHydratedMetadata = (
  node: CodeResourceNode,
  parent: CodeResourceNode | null,
  pathSegments: string[]
): CodeResourceNode => {
  const nextPath =
    pathSegments.length === 0 ? 'code' : `code/${pathSegments.join('/')}`;
  const hydratedChildren =
    node.type === 'folder'
      ? (node.children ?? []).map((child) =>
          withHydratedMetadata(child, node, [...pathSegments, child.name])
        )
      : undefined;
  return {
    ...node,
    path: nextPath,
    parentId: parent?.id ?? null,
    updatedAt: node.updatedAt || nowIso(),
    children: hydratedChildren,
  };
};

export const readCodeTree = (projectId?: string): CodeResourceNode => {
  if (typeof window === 'undefined') return createDefaultCodeTree();
  try {
    const raw = window.localStorage.getItem(getCodeTreeStorageKey(projectId));
    if (!raw) return withHydratedMetadata(createDefaultCodeTree(), null, []);
    const parsed = JSON.parse(raw) as CodeResourceNode;
    if (!parsed || parsed.type !== 'folder') {
      return withHydratedMetadata(createDefaultCodeTree(), null, []);
    }
    return withHydratedMetadata(parsed, null, []);
  } catch {
    return withHydratedMetadata(createDefaultCodeTree(), null, []);
  }
};

export const writeCodeTree = (
  projectId: string | undefined,
  tree: CodeResourceNode
) => {
  if (typeof window === 'undefined') return;
  const next = withHydratedMetadata(tree, null, []);
  window.localStorage.setItem(
    getCodeTreeStorageKey(projectId),
    JSON.stringify(next)
  );
};

const walkTree = (
  node: CodeResourceNode,
  visitor: (node: CodeResourceNode, parent: CodeResourceNode | null) => void,
  parent: CodeResourceNode | null = null
) => {
  visitor(node, parent);
  (node.children ?? []).forEach((child) => walkTree(child, visitor, node));
};

const mapNode = (
  node: CodeResourceNode,
  mapper: (current: CodeResourceNode) => CodeResourceNode
): CodeResourceNode => {
  const mappedChildren =
    node.type === 'folder'
      ? (node.children ?? []).map((child) => mapNode(child, mapper))
      : undefined;
  return mapper({ ...node, children: mappedChildren });
};

export const findCodeNodeById = (
  tree: CodeResourceNode,
  nodeId: string
): CodeResourceNode | undefined => {
  let target: CodeResourceNode | undefined;
  walkTree(tree, (node) => {
    if (node.id === nodeId) target = node;
  });
  return target;
};

export const flattenCodeFiles = (
  tree: CodeResourceNode
): Array<CodeResourceNode & { path: string }> => {
  const files: Array<CodeResourceNode & { path: string }> = [];
  walkTree(tree, (node) => {
    if (node.type !== 'file') return;
    files.push({ ...node, path: node.path });
  });
  return files;
};

export const createNodeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const splitNameAndExtension = (name: string) => {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return { baseName: name, extension: '' };
  }
  return {
    baseName: name.slice(0, dotIndex),
    extension: name.slice(dotIndex),
  };
};

const resolveUniqueChildName = (
  desiredName: string,
  siblings: CodeResourceNode[],
  excludeNodeId?: string
) => {
  const normalizedDesired = desiredName.toLowerCase();
  const usedNames = new Set(
    siblings
      .filter((sibling) => sibling.id !== excludeNodeId)
      .map((sibling) => sibling.name.toLowerCase())
  );
  if (!usedNames.has(normalizedDesired)) return desiredName;
  const { baseName, extension } = splitNameAndExtension(desiredName);
  let suffix = 1;
  let candidate = `${baseName}-${suffix}${extension}`;
  while (usedNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${baseName}-${suffix}${extension}`;
  }
  return candidate;
};

export const createCodeFolder = (
  tree: CodeResourceNode,
  parentId: string,
  folderName: string
): CodeResourceNode => {
  const normalizedName = folderName.trim();
  if (!normalizedName) return tree;
  const node = createFolderNode(createNodeId(), normalizedName, parentId);
  const next = mapNode(tree, (current) => {
    if (current.id !== parentId || current.type !== 'folder') return current;
    return {
      ...current,
      updatedAt: nowIso(),
      children: [...(current.children ?? []), node],
    };
  });
  return withHydratedMetadata(next, null, []);
};

export const createCodeFile = (
  tree: CodeResourceNode,
  parentId: string,
  options: {
    name: string;
    mime: string;
    size: number;
    contentRef?: string;
    textContent?: string;
    category?: PublicFileCategory;
  }
): CodeResourceNode => {
  const name = options.name.trim();
  if (!name) return tree;
  const next = mapNode(tree, (current) => {
    if (current.id !== parentId || current.type !== 'folder') return current;
    const uniqueName = resolveUniqueChildName(name, current.children ?? []);
    const fileNode: CodeResourceNode = {
      id: createNodeId(),
      name: uniqueName,
      type: 'file',
      parentId,
      path: '',
      category: options.category ?? 'document',
      mime: options.mime,
      size: options.size,
      contentRef: options.contentRef,
      textContent: options.textContent,
      updatedAt: nowIso(),
    };
    return {
      ...current,
      updatedAt: nowIso(),
      children: [...(current.children ?? []), fileNode],
    };
  });
  return withHydratedMetadata(next, null, []);
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
  return 'text/plain';
};

export const renameCodeNode = (
  tree: CodeResourceNode,
  nodeId: string,
  nextName: string
): CodeResourceNode => {
  const normalizedName = nextName.trim();
  if (!normalizedName || nodeId === tree.id) return tree;
  const renameNode = (
    node: CodeResourceNode,
    parent: CodeResourceNode | null
  ): CodeResourceNode => {
    if (node.id === nodeId) {
      if (node.type !== 'file') {
        return {
          ...node,
          name: normalizedName,
          updatedAt: nowIso(),
        };
      }
      const siblingNodes = parent?.children ?? [];
      const uniqueName = resolveUniqueChildName(
        normalizedName,
        siblingNodes,
        node.id
      );
      const mime = inferMimeByName(uniqueName);
      const contentRef = node.textContent
        ? `data:${mime};charset=utf-8,${encodeURIComponent(node.textContent)}`
        : node.contentRef;
      return {
        ...node,
        name: uniqueName,
        mime,
        contentRef,
        updatedAt: nowIso(),
      };
    }
    if (node.type !== 'folder') return node;
    return {
      ...node,
      children: (node.children ?? []).map((child) => renameNode(child, node)),
    };
  };
  return withHydratedMetadata(renameNode(tree, null), null, []);
};

export const removeCodeNodeById = (
  tree: CodeResourceNode,
  nodeId: string
): CodeResourceNode => {
  if (nodeId === tree.id) return tree;
  const apply = (node: CodeResourceNode): CodeResourceNode => {
    if (node.type !== 'folder') return node;
    return {
      ...node,
      children: (node.children ?? [])
        .filter((child) => child.id !== nodeId)
        .map(apply),
    };
  };
  return withHydratedMetadata(apply(tree), null, []);
};

export const updateCodeFileContent = (
  tree: CodeResourceNode,
  nodeId: string,
  textContent: string
): CodeResourceNode =>
  withHydratedMetadata(
    mapNode(tree, (current) => {
      if (current.id !== nodeId || current.type !== 'file') return current;
      const size = new TextEncoder().encode(textContent).length;
      const mime = current.mime || 'text/plain';
      return {
        ...current,
        textContent,
        size,
        contentRef: `data:${mime};charset=utf-8,${encodeURIComponent(textContent)}`,
        updatedAt: nowIso(),
      };
    }),
    null,
    []
  );

export const readFileAsDataUrl = async (file: File): Promise<string> =>
  await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
