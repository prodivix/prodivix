export type PublicFileCategory = 'image' | 'font' | 'document' | 'other';
export type PublicResourceNodeType = 'folder' | 'file';

export type PublicResourceNode = {
  id: string;
  name: string;
  type: PublicResourceNodeType;
  path: string;
  parentId: string | null;
  category?: PublicFileCategory;
  mime?: string;
  size?: number;
  contentRef?: string;
  textContent?: string;
  updatedAt: string;
  children?: PublicResourceNode[];
};

export type PublicBestPracticeHint = {
  code:
    | 'path.images'
    | 'path.fonts'
    | 'path.icons'
    | 'name.kebab-case'
    | 'size.image'
    | 'size.font'
    | 'svg.script'
    | 'svg.external-link';
  level: 'info' | 'warning';
  message: string;
};

export const PUBLIC_TREE_ROOT_ID = 'public-root';
const IMAGE_SIZE_LIMIT = 500 * 1024;
const FONT_SIZE_LIMIT = 220 * 1024;

const nowIso = () => new Date().toISOString();

const createFolderNode = (
  id: string,
  name: string,
  parentId: string | null
): PublicResourceNode => ({
  id,
  name,
  type: 'folder',
  path: '',
  parentId,
  updatedAt: nowIso(),
  children: [],
});

export const createDefaultPublicTree = (): PublicResourceNode => ({
  ...createFolderNode(PUBLIC_TREE_ROOT_ID, 'public', null),
  children: [
    createFolderNode('public-images', 'images', PUBLIC_TREE_ROOT_ID),
    createFolderNode('public-fonts', 'fonts', PUBLIC_TREE_ROOT_ID),
    createFolderNode('public-icons', 'icons', PUBLIC_TREE_ROOT_ID),
  ],
});

const getPublicTreeStorageKey = (projectId?: string) =>
  `prodivix.publicTree.${projectId?.trim() || 'default'}`;

const withHydratedMetadata = (
  node: PublicResourceNode,
  parent: PublicResourceNode | null,
  pathSegments: string[]
): PublicResourceNode => {
  const nextPath =
    pathSegments.length === 0 ? 'public' : `public/${pathSegments.join('/')}`;
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

export const readPublicTree = (projectId?: string): PublicResourceNode => {
  if (typeof window === 'undefined') return createDefaultPublicTree();
  try {
    const raw = window.localStorage.getItem(getPublicTreeStorageKey(projectId));
    if (!raw) return withHydratedMetadata(createDefaultPublicTree(), null, []);
    const parsed = JSON.parse(raw) as PublicResourceNode;
    if (!parsed || parsed.type !== 'folder') {
      return withHydratedMetadata(createDefaultPublicTree(), null, []);
    }
    return withHydratedMetadata(parsed, null, []);
  } catch {
    return withHydratedMetadata(createDefaultPublicTree(), null, []);
  }
};

export const writePublicTree = (
  projectId: string | undefined,
  tree: PublicResourceNode
) => {
  if (typeof window === 'undefined') return;
  const next = withHydratedMetadata(tree, null, []);
  window.localStorage.setItem(
    getPublicTreeStorageKey(projectId),
    JSON.stringify(next)
  );
};

const walkTree = (
  node: PublicResourceNode,
  visitor: (
    node: PublicResourceNode,
    parent: PublicResourceNode | null
  ) => void,
  parent: PublicResourceNode | null = null
) => {
  visitor(node, parent);
  (node.children ?? []).forEach((child) => walkTree(child, visitor, node));
};

export const findNodeById = (
  tree: PublicResourceNode,
  nodeId: string
): PublicResourceNode | undefined => {
  let target: PublicResourceNode | undefined;
  walkTree(tree, (node) => {
    if (node.id === nodeId) target = node;
  });
  return target;
};

export const createNodeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const mapNode = (
  node: PublicResourceNode,
  mapper: (current: PublicResourceNode) => PublicResourceNode
): PublicResourceNode => {
  const mappedChildren =
    node.type === 'folder'
      ? (node.children ?? []).map((child) => mapNode(child, mapper))
      : undefined;
  return mapper({ ...node, children: mappedChildren });
};

export const flattenPublicFiles = (
  tree: PublicResourceNode
): Array<PublicResourceNode & { path: string }> => {
  const files: Array<PublicResourceNode & { path: string }> = [];
  walkTree(tree, (node) => {
    if (node.type !== 'file') return;
    files.push({ ...node, path: node.path });
  });
  return files;
};

export const listFolderNodes = (
  tree: PublicResourceNode
): PublicResourceNode[] => {
  const folders: PublicResourceNode[] = [];
  walkTree(tree, (node) => {
    if (node.type === 'folder') folders.push(node);
  });
  return folders;
};

export const createFolder = (
  tree: PublicResourceNode,
  parentId: string,
  folderName: string
): PublicResourceNode => {
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

export const createFile = (
  tree: PublicResourceNode,
  parentId: string,
  options: {
    name: string;
    category: PublicFileCategory;
    mime: string;
    size: number;
    contentRef?: string;
    textContent?: string;
  }
): PublicResourceNode => {
  const name = options.name.trim();
  if (!name) return tree;
  const fileNode: PublicResourceNode = {
    id: createNodeId(),
    name,
    type: 'file',
    parentId,
    path: '',
    category: options.category,
    mime: options.mime,
    size: options.size,
    contentRef: options.contentRef,
    textContent: options.textContent,
    updatedAt: nowIso(),
  };
  const next = mapNode(tree, (current) => {
    if (current.id !== parentId || current.type !== 'folder') return current;
    return {
      ...current,
      updatedAt: nowIso(),
      children: [...(current.children ?? []), fileNode],
    };
  });
  return withHydratedMetadata(next, null, []);
};

export const renameNode = (
  tree: PublicResourceNode,
  nodeId: string,
  nextName: string
): PublicResourceNode => {
  const normalizedName = nextName.trim();
  if (!normalizedName || nodeId === tree.id) return tree;
  return withHydratedMetadata(
    mapNode(tree, (current) => {
      if (current.id !== nodeId) return current;
      return {
        ...current,
        name: normalizedName,
        updatedAt: nowIso(),
      };
    }),
    null,
    []
  );
};

export const removeNodeById = (
  tree: PublicResourceNode,
  nodeId: string
): PublicResourceNode => {
  if (nodeId === tree.id) return tree;
  const apply = (node: PublicResourceNode): PublicResourceNode => {
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

export const inferCategoryByFile = (file: File): PublicFileCategory => {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('font/') || /\.(woff2?|ttf|otf)$/i.test(file.name))
    return 'font';
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    /\.(txt|md|json|svg)$/i.test(file.name)
  ) {
    return 'document';
  }
  return 'other';
};

export const readFileAsDataUrl = async (file: File): Promise<string> =>
  await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const resolveCategoryLabel = (category: PublicFileCategory): string => {
  if (category === 'image') return 'Image';
  if (category === 'font') return 'Font';
  if (category === 'document') return 'Document';
  return 'Other';
};

export const collectBestPracticeHints = (
  node: PublicResourceNode
): PublicBestPracticeHint[] => {
  if (node.type !== 'file') return [];
  const hints: PublicBestPracticeHint[] = [];
  if (
    node.category !== 'font' &&
    !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(node.name)
  ) {
    hints.push({
      code: 'name.kebab-case',
      level: 'info',
      message: 'Prefer lowercase kebab-case file names and avoid spaces.',
    });
  }
  if (node.category === 'image' && !node.path.startsWith('public/images/')) {
    hints.push({
      code: 'path.images',
      level: 'info',
      message: 'Image assets are recommended under public/images.',
    });
  }
  if (node.category === 'font' && !node.path.startsWith('public/fonts/')) {
    hints.push({
      code: 'path.fonts',
      level: 'info',
      message: 'Font assets are recommended under public/fonts.',
    });
  }
  if (node.mime?.includes('svg') && !node.path.startsWith('public/icons/')) {
    hints.push({
      code: 'path.icons',
      level: 'info',
      message: 'Icon SVG assets are recommended under public/icons.',
    });
  }
  if (node.category === 'image' && (node.size ?? 0) > IMAGE_SIZE_LIMIT) {
    hints.push({
      code: 'size.image',
      level: 'warning',
      message: 'Image file size exceeds 500 KB, consider compression.',
    });
  }
  if (node.category === 'font' && (node.size ?? 0) > FONT_SIZE_LIMIT) {
    hints.push({
      code: 'size.font',
      level: 'warning',
      message: 'Font file size exceeds 220 KB, consider subsetting.',
    });
  }
  if (node.mime?.includes('svg') && node.textContent) {
    const svgSource = node.textContent.toLowerCase();
    if (svgSource.includes('<script')) {
      hints.push({
        code: 'svg.script',
        level: 'warning',
        message: 'SVG contains script tags. Remove them for safer delivery.',
      });
    }
    if (svgSource.includes('http://') || svgSource.includes('https://')) {
      hints.push({
        code: 'svg.external-link',
        level: 'warning',
        message: 'SVG references external URLs. Prefer inline/local resources.',
      });
    }
  }
  return hints;
};
