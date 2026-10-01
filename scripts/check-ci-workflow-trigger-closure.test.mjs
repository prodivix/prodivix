import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  checkCiWorkflowTriggerClosure,
  collectWorkspaceDependencyTriggerPaths,
  validateWorkflowTriggerPaths,
} from './check-ci-workflow-trigger-closure.mjs';

const workflow = (first, second) =>
  `on:\n  pull_request:\n    paths:\n${first.map((path) => `      - '${path}'\n`).join('')}  push:\n    paths:\n${second.map((path) => `      - '${path}'\n`).join('')}\njobs:\n`;

test('includes the runtime and transitive production workspace owners once', () => {
  const packages = new Map([
    [
      'runtime',
      {
        directory: 'apps/runtime',
        manifest: {
          dependencies: { owner: 'workspace:*' },
          devDependencies: { fixture: 'workspace:*' },
        },
      },
    ],
    [
      'owner',
      {
        directory: 'packages/owner',
        manifest: { optionalDependencies: { leaf: 'workspace:*' } },
      },
    ],
    [
      'leaf',
      {
        directory: 'packages/leaf',
        manifest: { peerDependencies: { owner: 'workspace:*' } },
      },
    ],
  ]);
  assert.deepEqual(
    collectWorkspaceDependencyTriggerPaths(packages, 'runtime'),
    ['apps/runtime/**', 'packages/leaf/**', 'packages/owner/**']
  );
});

test('rejects an unresolved workspace production dependency', () => {
  assert.throws(
    () =>
      collectWorkspaceDependencyTriggerPaths(
        new Map([
          [
            'runtime',
            {
              directory: 'apps/runtime',
              manifest: { dependencies: { missing: 'workspace:*' } },
            },
          ],
        ]),
        'runtime'
      ),
    /Workspace dependency missing has no manifest/u
  );
});

test('checks each pull request and push filter independently', () => {
  const required = ['apps/runtime/**', 'packages/owner/**'];
  assert.deepEqual(
    validateWorkflowTriggerPaths(
      'runtime.yml',
      workflow(required, required),
      required,
      { expectedCount: 2 }
    ),
    []
  );
  const issues = validateWorkflowTriggerPaths(
    'runtime.yml',
    workflow(required, ['apps/runtime/**']),
    required,
    { expectedCount: 2 }
  );
  assert.deepEqual(issues, [
    'runtime.yml path filter 2 must trigger when packages/owner/** changes.',
  ]);
});

test('preserves exact two-filter and quoted rootless workflow guards', () => {
  const source = 'on:\n  push:\n    paths:\n      - rootless.sh\n\njobs:\n';
  assert.equal(
    validateWorkflowTriggerPaths('rootless.yml', source, ['rootless.sh'], {
      expectedCount: 2,
    }).length,
    1
  );
  assert.equal(
    validateWorkflowTriggerPaths(
      'rootless.yml',
      workflow(['rootless.sh'], ['rootless.sh']).replaceAll(
        "'rootless.sh'",
        'rootless.sh'
      ),
      ['rootless.sh'],
      { expectedCount: 2 }
    ).length,
    1
  );
});

test('guards nginx in every deployment filter including a future pull request filter', () => {
  const required = ['apps/web/docker/nginx.conf'];
  const push =
    'on:\n  push:\n    paths:\n      - apps/web/docker/nginx.conf\n\njobs:\n';
  assert.deepEqual(
    validateWorkflowTriggerPaths('deploy.yml', push, required, {
      quotedOnly: false,
    }),
    []
  );
  assert.deepEqual(
    validateWorkflowTriggerPaths(
      'deploy.yml',
      workflow(required, ['deploy/**']),
      required,
      { quotedOnly: false }
    ),
    [
      'deploy.yml path filter 2 must trigger when apps/web/docker/nginx.conf changes.',
    ]
  );
});

test('loads real manifest closure, tolerates empty workspace globs and rejects removed triggers', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'prodivix-trigger-closure-'));
  try {
    await mkdir(join(repoRoot, '.github/workflows'), { recursive: true });
    await mkdir(join(repoRoot, 'apps/agent-runtime'), { recursive: true });
    await mkdir(join(repoRoot, 'packages/leaf'), { recursive: true });
    await writeFile(
      join(repoRoot, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n\n'
    );
    await writeFile(
      join(repoRoot, 'apps/agent-runtime/package.json'),
      JSON.stringify({
        name: '@prodivix/agent-runtime',
        dependencies: { '@prodivix/leaf': 'workspace:*' },
      })
    );
    await writeFile(
      join(repoRoot, 'packages/leaf/package.json'),
      JSON.stringify({ name: '@prodivix/leaf' })
    );
    const required = [
      'apps/agent-runtime/**',
      'packages/leaf/**',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'turbo.json',
      'scripts/check-ci-workflow-trigger-closure.mjs',
    ];
    const v7Path = join(repoRoot, '.github/workflows/g4-v7-product.yml');
    const v9Path = join(repoRoot, '.github/workflows/g4-v9-golden-closure.yml');
    const deployPath = join(repoRoot, '.github/workflows/deploy-smoke.yml');
    await writeFile(v7Path, workflow(required, required));
    const rootless = [...required, 'scripts/ci/configure-rootless-podman.sh'];
    await writeFile(
      v9Path,
      `${workflow(rootless, rootless)}  gate:\n    steps:\n      - run: bash scripts/ci/configure-rootless-podman.sh\n`
    );
    await writeFile(
      deployPath,
      'on:\n  push:\n    paths:\n      - apps/web/docker/nginx.conf\n\njobs:\n'
    );
    const valid = await checkCiWorkflowTriggerClosure(repoRoot);
    assert.deepEqual(valid.issues, []);
    assert.deepEqual(valid.runtimePaths, [
      'apps/agent-runtime/**',
      'packages/leaf/**',
    ]);
    await writeFile(
      v7Path,
      workflow(
        required,
        required.filter((path) => path !== 'packages/leaf/**')
      )
    );
    await writeFile(
      deployPath,
      'on:\n  push:\n    paths:\n      - deploy/**\n\njobs:\n'
    );
    assert.deepEqual((await checkCiWorkflowTriggerClosure(repoRoot)).issues, [
      'g4-v7-product.yml path filter 2 must trigger when packages/leaf/** changes.',
      'deploy-smoke.yml path filter 1 must trigger when apps/web/docker/nginx.conf changes.',
    ]);
  } finally {
    assert.equal(dirname(repoRoot), tmpdir());
    await rm(repoRoot, { recursive: true, force: true });
  }
});
