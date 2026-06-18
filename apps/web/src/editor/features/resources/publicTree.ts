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
