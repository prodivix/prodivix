import {
  normalizeExecutableProjectPath,
  type ExecutableProjectFile,
} from '@prodivix/runtime-core';

export type BrowserProjectFileTree = {
  [name: string]:
    | Readonly<{ file: Readonly<{ contents: string | Uint8Array }> }>
    | Readonly<{ directory: BrowserProjectFileTree }>;
};

const cloneContents = (contents: string | Uint8Array): string | Uint8Array =>
  typeof contents === 'string' ? contents : new Uint8Array(contents);

const createDirectory = (): BrowserProjectFileTree =>
  Object.create(null) as BrowserProjectFileTree;

/** Projects neutral executable files into the WebContainer mount tree. */
export const createBrowserProjectFileTree = (
  files: readonly ExecutableProjectFile[]
): BrowserProjectFileTree => {
  const root = createDirectory();
  files.forEach((file) => {
    const path = normalizeExecutableProjectPath(file.path);
    const segments = path.split('/');
    let directory = root;
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      const existing = Object.hasOwn(directory, segment)
        ? directory[segment]
        : undefined;
      if (isFile) {
        if (existing) {
          throw new TypeError(
            `Browser project tree contains a conflict at ${path}.`
          );
        }
        directory[segment] = Object.freeze({
          file: Object.freeze({ contents: cloneContents(file.contents) }),
        });
        return;
      }
      if (existing && !('directory' in existing)) {
        throw new TypeError(
          `Browser project path is both a file and a directory: ${segments
            .slice(0, index + 1)
            .join('/')}`
        );
      }
      if (!existing) directory[segment] = { directory: createDirectory() };
      directory = (directory[segment] as { directory: BrowserProjectFileTree })
        .directory;
    });
  });
  return root;
};
