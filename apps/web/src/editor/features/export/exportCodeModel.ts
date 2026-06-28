export type ExportTab = 'react' | 'vfs';

export type ExportFileLanguage =
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'yaml'
  | 'ignore'
  | 'markdown'
  | 'text';

export type ExportCodeFile = {
  path: string;
  language: ExportFileLanguage;
  content: string;
  binaryContent?: Uint8Array;
  binaryDataUrl?: string;
};

export const EXPORT_AUDIT_FILE_PATHS = {
  manifest: '.prodivix/export-manifest.json',
  origins: '.prodivix/origins.json',
  licenses: '.prodivix/licenses.json',
} as const;

export type FileTreeNode = {
  key: string;
  name: string;
  path: string;
  file?: { path: string; language: ExportFileLanguage };
  children: FileTreeNode[];
};

export const buildFileTree = (
  files: Array<{
    path: string;
    language: ExportFileLanguage;
  }>
): FileTreeNode[] => {
  const root: FileTreeNode = {
    key: 'root',
    name: 'root',
    path: '',
    children: [],
  };

  files.forEach((file) => {
    const segments = file.path.split('/').filter(Boolean);
    let cursor = root;
    segments.forEach((segment, index) => {
      const nodePath = segments.slice(0, index + 1).join('/');
      let next = cursor.children.find((item) => item.path === nodePath);
      if (!next) {
        next = {
          key: nodePath,
          name: segment,
          path: nodePath,
          children: [],
        };
        cursor.children.push(next);
      }
      if (index === segments.length - 1) {
        next.file = file;
      }
      cursor = next;
    });
  });

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .map((node) => ({ ...node, children: sortNodes(node.children) }))
      .sort((a, b) => {
        const aIsDir = a.children.length > 0 && !a.file;
        const bIsDir = b.children.length > 0 && !b.file;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

  return sortNodes(root.children);
};

export const sanitizeExportFileName = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'prodivix-react-export';

export const resolveProjectFileLanguage = (
  path: string
): ExportFileLanguage => {
  const lower = path.toLowerCase();
  const fileName = lower.split('/').pop() ?? lower;
  if (fileName.endsWith('ignore')) return 'ignore';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.md')) return 'markdown';
  return 'text';
};

export const resolveCodeViewerLanguage = (language?: ExportFileLanguage) => {
  if (language === 'json') return 'json';
  if (language === 'html') return 'html';
  if (language === 'css') return 'css';
  if (language === 'yaml') return 'yaml';
  if (language === 'markdown') return 'markdown';
  if (language === 'ignore') return 'ignore';
  if (language === 'text') return 'text';
  return 'typescript';
};
