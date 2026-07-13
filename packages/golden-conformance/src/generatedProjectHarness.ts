import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { ReactExportBundle } from '@prodivix/prodivix-compiler';
import { build, transformWithOxc } from 'vite';

export type GoldenBuildEvidence = Readonly<{
  bundleFileCount: number;
  emittedFileCount: number;
  transformedModuleCount: number;
}>;

const resolveSafeOutputPath = (root: string, filePath: string): string => {
  const target = resolve(root, filePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Generated file escaped the Golden build root: ${filePath}`
    );
  }
  return target;
};

const writeBundle = async (
  root: string,
  bundle: ReactExportBundle
): Promise<void> => {
  for (const file of bundle.files) {
    const target = resolveSafeOutputPath(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
};

const isBareImport = (id: string): boolean =>
  !id.startsWith('.') &&
  !id.startsWith('/') &&
  !id.startsWith('\0') &&
  !/^[a-zA-Z]:[\\/]/.test(id);

type GoldenRollupOutput = Readonly<{ output: readonly unknown[] }>;

const countRollupOutputs = (
  output: GoldenRollupOutput | GoldenRollupOutput[]
): number =>
  (Array.isArray(output) ? output : [output]).reduce(
    (count, item) => count + item.output.length,
    0
  );

const transformGeneratedModules = async (
  bundle: ReactExportBundle
): Promise<number> => {
  const extensions = [
    '.cjs',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.mts',
    '.ts',
    '.tsx',
  ];
  let transformed = 0;
  for (const file of bundle.files) {
    if (typeof file.contents !== 'string') continue;
    const extension = extensions.find((candidate) =>
      file.path.endsWith(candidate)
    );
    if (!extension) continue;
    await transformWithOxc(file.contents, file.path);
    transformed += 1;
  }
  return transformed;
};

/** Syntax-checks every generated module and builds the reachable graph without a server. */
export const buildGoldenExportBundle = async (
  bundle: ReactExportBundle
): Promise<GoldenBuildEvidence> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-golden-'));
  try {
    const transformedModuleCount = await transformGeneratedModules(bundle);
    await writeBundle(root, bundle);
    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        rollupOptions: {
          external: isBareImport,
        },
      },
    });
    return {
      bundleFileCount: bundle.files.length,
      emittedFileCount: countRollupOutputs(
        output as GoldenRollupOutput | GoldenRollupOutput[]
      ),
      transformedModuleCount,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
