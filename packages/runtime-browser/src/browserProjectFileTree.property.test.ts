import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createBrowserProjectFileTree } from './browserProjectFileTree';

const segmentArbitrary = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
    minLength: 1,
    maxLength: 10,
  })
  .map((characters) => characters.join(''));

describe('browser project file tree properties', () => {
  it('treats Object prototype names as ordinary path segments', () => {
    const tree = createBrowserProjectFileTree([
      { path: 'constructor/toString.ts', contents: 'export {};' },
    ]);

    expect(Object.getPrototypeOf(tree)).toBeNull();
    expect(tree.constructor).toEqual({
      directory: {
        'toString.ts': { file: { contents: 'export {};' } },
      },
    });
  });

  it('materializes every normalized neutral project file exactly once', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(segmentArbitrary, fc.string()), {
          minLength: 1,
          maxLength: 30,
        }),
        (entries) => {
          const files = [
            { path: 'package.json', contents: '{"private":true}' },
            ...entries.map(([directory, contents], index) => ({
              path: `root-${index}/${directory}/file-${index}.txt`,
              contents,
            })),
          ];
          const snapshot = createExecutableProjectSnapshot({
            workspace: {
              workspaceId: 'workspace',
              snapshotId: 'snapshot',
            },
            target: {
              presetId: 'react-vite',
              framework: 'react',
              runtime: 'vite',
            },
            files,
            dependencyPlan: { manifestFilePath: 'package.json' },
            entrypoints: [{ kind: 'preview', path: files[1]!.path }],
            capabilityRequirements: {
              preview: ['filesystem'],
              build: ['filesystem'],
              test: ['filesystem'],
            },
          });
          const tree = createBrowserProjectFileTree(snapshot.files);

          snapshot.files.forEach((file) => {
            if (file.path === 'package.json') {
              expect(tree['package.json']).toEqual({
                file: { contents: '{"private":true}' },
              });
              return;
            }
            const [root, directory, name] = file.path.split('/');
            const rootNode = tree[root];
            expect(rootNode && 'directory' in rootNode).toBe(true);
            const directoryNode =
              rootNode && 'directory' in rootNode
                ? rootNode.directory[directory]
                : undefined;
            expect(directoryNode && 'directory' in directoryNode).toBe(true);
            const fileNode =
              directoryNode && 'directory' in directoryNode
                ? directoryNode.directory[name]
                : undefined;
            expect(fileNode && 'file' in fileNode).toBe(true);
            if (fileNode && 'file' in fileNode) {
              expect(fileNode.file.contents).toEqual(file.contents);
            }
          });
        }
      )
    );
  });
});
