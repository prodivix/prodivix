const WINDOWS_DRIVE_PREFIX_PATTERN = /^[a-zA-Z]:/;
const SAFE_SEGMENT_PATTERN = /[^a-zA-Z0-9._-]/g;

const sanitizePathSegment = (segment: string) => {
  const sanitized = segment.replace(SAFE_SEGMENT_PATTERN, '-');
  return sanitized || 'file';
};

export const normalizeExportPath = (path: string): string => {
  const withoutDrive = path.replace(WINDOWS_DRIVE_PREFIX_PATTERN, '');
  const segments = withoutDrive
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== '.' && segment !== '..')
    .map(sanitizePathSegment);

  if (segments.length === 0) {
    return 'file';
  }

  return segments.join('/');
};

export const joinExportPath = (...parts: string[]): string =>
  normalizeExportPath(parts.filter(Boolean).join('/'));

export const ensureFileExtension = (
  path: string,
  extension: string
): string => {
  const normalized = normalizeExportPath(path);
  const normalizedExtension = extension.startsWith('.')
    ? extension
    : `.${extension}`;
  if (normalized.toLowerCase().endsWith(normalizedExtension.toLowerCase())) {
    return normalized;
  }
  return `${normalized}${normalizedExtension}`;
};

const splitPath = (path: string) => normalizeExportPath(path).split('/');

export const getExportDirname = (path: string): string => {
  const segments = splitPath(path);
  segments.pop();
  return segments.join('/');
};

export const getRelativeImportPath = (
  fromFilePath: string,
  toFilePath: string,
  options: { keepExtension?: boolean } = {}
) => {
  const fromDir = getExportDirname(fromFilePath);
  const fromSegments = fromDir ? fromDir.split('/') : [];
  const toSegments = splitPath(toFilePath);
  const toLast = toSegments.at(-1) ?? '';
  const toFinalSegment = options.keepExtension
    ? toLast
    : toLast.replace(/\.[^.]+$/, '');
  const toModuleSegments = [...toSegments.slice(0, -1), toFinalSegment];

  let common = 0;
  while (
    common < fromSegments.length &&
    common < toModuleSegments.length &&
    fromSegments[common] === toModuleSegments[common]
  ) {
    common += 1;
  }

  const upSegments = fromSegments.slice(common).map(() => '..');
  const downSegments = toModuleSegments.slice(common);
  const relativeSegments = [...upSegments, ...downSegments];
  const relativePath = relativeSegments.join('/') || '.';
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

export const createUniqueExportPath = (
  desiredPath: string,
  usedPaths: Set<string>
): string => {
  const normalized = normalizeExportPath(desiredPath);
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }

  const segments = normalized.split('/');
  const fileName = segments.pop() ?? 'file';
  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1] ?? '';
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  let index = 2;

  while (true) {
    const candidate = [...segments, `${baseName}-${index}${extension}`].join(
      '/'
    );
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
    index += 1;
  }
};
