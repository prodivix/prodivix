import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  generateWorkspaceReactViteBundle,
  generateWorkspaceVueViteBundle,
} from '@prodivix/prodivix-compiler';
import {
  captureWorkspaceSemanticRevisions,
  decodeWorkspaceSnapshot,
} from '@prodivix/workspace';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { readBoundedCliInput } from './boundedInput.js';

export type WorkspaceExportOptions = Readonly<{
  input: string;
  output: string;
  target: string;
}>;
export type WorkspaceProductReceipt = Readonly<{
  format: 'prodivix.cli.export.v1';
  workspaceId: string;
  sourceDigest: string;
  sourceRevisions: ReturnType<typeof captureWorkspaceSemanticRevisions>;
  target: 'react-vite' | 'vue-vite';
  files: readonly string[];
}>;

/** Emits only a compiler projection; no CLI command rewrites its input Workspace. */
export const exportWorkspace = (
  options: WorkspaceExportOptions
): WorkspaceProductReceipt => {
  if (options.target !== 'react-vite' && options.target !== 'vue-vite')
    throw new TypeError('Target must be react-vite or vue-vite.');
  const bytes = readBoundedCliInput(options.input, 67_108_864, {
    allowStdin: false,
  });
  const { workspace } = decodeWorkspaceSnapshot(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  );
  const bundle =
    options.target === 'react-vite'
      ? generateWorkspaceReactViteBundle(workspace)
      : generateWorkspaceVueViteBundle(workspace);
  const errors = bundle.diagnostics.filter(
    ({ severity }) => severity === 'error'
  );
  if (errors.length)
    throw new TypeError(
      errors.map(({ code, message }) => `${code}: ${message}`).join('\n')
    );
  const output = resolve(options.output);
  if (
    existsSync(output) &&
    (lstatSync(output).isSymbolicLink() ||
      !lstatSync(output).isDirectory() ||
      readdirSync(output).length)
  )
    throw new TypeError('Output must be a new or empty directory.');
  mkdirSync(dirname(output), { recursive: true });
  const stage = mkdtempSync(join(dirname(output), '.prodivix-export-'));
  try {
    const paths = new Set<string>();
    for (const file of bundle.files) {
      const name = file.path.replaceAll('\\', '/');
      if (
        !name ||
        isAbsolute(name) ||
        /^[a-z]:/iu.test(name) ||
        name.split('/').some((part) => !part || part === '.' || part === '..')
      )
        throw new TypeError('Compiler output contains an invalid path.');
      const destination = resolve(stage, name);
      const inside = relative(stage, destination);
      if (
        isAbsolute(inside) ||
        inside.startsWith('..') ||
        paths.has(name.toLowerCase())
      )
        throw new TypeError(
          'Compiler output contains an escaping or duplicate path.'
        );
      paths.add(name.toLowerCase());
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, file.contents, { flag: 'wx' });
    }
    const receipt: WorkspaceProductReceipt = Object.freeze({
      format: 'prodivix.cli.export.v1',
      workspaceId: workspace.id,
      sourceDigest: `sha256-${createHash('sha256').update(canonicalJsonText(workspace)).digest('hex')}`,
      sourceRevisions: captureWorkspaceSemanticRevisions(workspace),
      target: options.target,
      files: Object.freeze(bundle.files.map(({ path }) => path)),
    });
    writeFileSync(
      join(stage, 'prodivix-export.json'),
      `${canonicalJsonText(receipt)}\n`,
      { flag: 'wx' }
    );
    if (existsSync(output)) rmSync(output); // Only the verified empty directory is removed.
    renameSync(stage, output);
    return receipt;
  } finally {
    // stage is an exact freshly-created directory under the selected output parent.
    if (existsSync(stage)) rmSync(stage, { recursive: true });
  }
};

export const buildExportedWorkspace = async (output: string): Promise<void> => {
  const cwd = resolve(output);
  const manifest = JSON.parse(
    readFileSync(join(cwd, 'package.json'), 'utf8')
  ) as { packageManager?: unknown };
  if (
    typeof manifest.packageManager !== 'string' ||
    !/^pnpm@[\d.]+$/u.test(manifest.packageManager)
  )
    throw new TypeError(
      'Generated project must declare its exact pnpm package manager.'
    );
  for (const args of [
    ['install', '--ignore-scripts'],
    ['run', 'build'],
  ]) {
    await new Promise<void>((resolveTask, reject) => {
      const child = spawn('corepack', ['pnpm', ...args], {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        signal: AbortSignal.timeout(900_000),
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? resolveTask()
          : reject(
              new Error(
                `Generated project ${args[0]} failed (${String(code)}).`
              )
            )
      );
    });
  }
  if (!existsSync(join(cwd, 'dist', 'index.html')))
    throw new Error('Production build did not emit dist/index.html.');
};
