import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  encodeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { buildExportedWorkspace, exportWorkspace } from './workspaceProduct.js';

const fixture = (): WorkspaceSnapshot => ({
  id: 'cli-project',
  name: 'CLI Project',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: { version: '1', root: { id: 'root', pageDocId: 'page' } },
});

test('CLI export materializes both production targets from strict canonical input and keeps input untouched', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-export-'));
  try {
    const input = join(directory, 'workspace.json');
    const source = JSON.stringify(encodeWorkspaceSnapshot(fixture(), {}));
    writeFileSync(input, source);
    for (const target of ['react-vite', 'vue-vite']) {
      const output = join(directory, target);
      const receipt = exportWorkspace({ input, output, target });
      assert.equal(receipt.workspaceId, 'cli-project');
      assert.equal(receipt.sourceRevisions.workspaceRev, 1);
      assert.match(receipt.sourceDigest, /^sha256-[a-f0-9]{64}$/u);
      assert.ok(receipt.files.includes('index.html'));
      assert.match(
        JSON.parse(readFileSync(join(output, 'package.json'), 'utf8')).scripts
          .build,
        /vite build$/u
      );
      assert.equal(readFileSync(input, 'utf8'), source);
      assert.throws(
        () => exportWorkspace({ input, output, target }),
        /new or empty/u
      );
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('CLI refuses invalid canonical input and unsupported targets before creating output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-invalid-'));
  try {
    const input = join(directory, 'workspace.json');
    writeFileSync(input, '{}');
    assert.throws(() =>
      exportWorkspace({
        input,
        output: join(directory, 'invalid'),
        target: 'react-vite',
      })
    );
    assert.throws(
      () =>
        exportWorkspace({
          input,
          output: join(directory, 'invalid'),
          target: 'unknown',
        }),
      /Target must/u
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('CLI refuses an oversized file before creating export output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-large-input-'));
  try {
    const input = join(directory, 'workspace.json');
    const output = join(directory, 'export');
    writeFileSync(input, '{}');
    truncateSync(input, 67_108_865);
    assert.throws(
      () => exportWorkspace({ input, output, target: 'react-vite' }),
      /byte limit/u
    );
    assert.equal(existsSync(output), false);
    assert.throws(() =>
      exportWorkspace({ input: directory, output, target: 'react-vite' })
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test(
  'exported React and Vue projects produce real standalone production builds',
  { skip: process.env.PRODIVIX_CLI_STANDALONE_BUILD !== '1' },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-production-'));
    try {
      const input = join(directory, 'workspace.json');
      writeFileSync(
        input,
        JSON.stringify(encodeWorkspaceSnapshot(fixture(), {}))
      );
      for (const target of ['react-vite', 'vue-vite']) {
        const output = join(directory, target);
        exportWorkspace({ input, output, target });
        await buildExportedWorkspace(output);
        assert.match(
          readFileSync(join(output, 'dist', 'index.html'), 'utf8'),
          /<html/u
        );
      }
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);
