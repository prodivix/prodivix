import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compilerEntry = resolve(
  repoRoot,
  'packages/prodivix-compiler/src/index.ts'
);
const { generateWorkspaceReactViteBundle } = await import(
  pathToFileURL(compilerEntry).href
);

const officialPackages = ['antd', 'mui', 'radix'];

const readJson = async (path) =>
  JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));

const definitions = await Promise.all(
  officialPackages.map(async (name) => {
    const packageRoot = `packages/plugin-${name}/plugin`;
    const [manifest, codegen, iconProvider] = await Promise.all([
      readJson(`${packageRoot}/manifest.json`),
      readJson(`${packageRoot}/contributions/codegen-policy.json`),
      name === 'radix'
        ? Promise.resolve(undefined)
        : readJson(`${packageRoot}/contributions/icon-provider.json`),
    ]);
    const codegenDeclaration = manifest.contributes.find(
      (contribution) => contribution.point === 'codegenPolicy'
    );
    const iconDeclaration = manifest.contributes.find(
      (contribution) => contribution.point === 'iconProvider'
    );
    if (!codegenDeclaration || (iconProvider && !iconDeclaration)) {
      throw new Error(
        `Official ${name} Manifest is missing a codegen declaration.`
      );
    }
    return {
      name,
      pluginId: manifest.id,
      library: {
        source: {
          pluginId: manifest.id,
          contributionId: codegenDeclaration.id,
          generation: 1,
        },
        libraryId: codegen.libraryId,
        runtimeTypes: [
          ...new Set(codegen.rules.map((rule) => rule.runtimeType)),
        ],
        dependencies: codegen.dependencies,
        rules: codegen.rules,
        unsupported: codegen.unsupported,
      },
      iconProvider:
        iconProvider && iconDeclaration
          ? {
              source: {
                pluginId: manifest.id,
                contributionId: iconDeclaration.id,
                generation: 1,
              },
              providerId: iconProvider.providerId,
              package: iconProvider.package,
              exports: iconProvider.exports,
              normalization: iconProvider.normalization,
              render: iconProvider.render,
              codegen: iconProvider.codegen,
              limits: iconProvider.limits,
            }
          : undefined,
    };
  })
);

const toLiteralBindings = (values = {}) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { kind: 'literal', value },
    ])
  );

const node = (id, type, input = {}) => ({
  id,
  kind: 'element',
  type,
  ...(input.text === undefined
    ? {}
    : { text: { kind: 'literal', value: input.text } }),
  ...(input.props ? { props: toLiteralBindings(input.props) } : {}),
  ...(input.style ? { style: toLiteralBindings(input.style) } : {}),
  ...(input.events ? { events: input.events } : {}),
});

const document = (name, nodesById, childIdsById) => ({
  metadata: { name },
  ui: {
    graph: {
      rootId: 'root',
      nodesById,
      childIdsById,
      order: { strategy: 'childIdsById' },
    },
  },
});

const documentFromTemplates = (name, contribution, templateIds) => {
  const nodesById = { root: node('root', 'container') };
  const childIdsById = { root: [] };
  for (const templateId of templateIds) {
    const template = contribution.templates.find(
      (candidate) => candidate.id === templateId
    );
    if (!template) {
      throw new Error(`Radix export template ${templateId} is missing.`);
    }
    const prefix = templateId.replace(/[^a-z0-9-]+/giu, '-');
    const idByLocalId = Object.fromEntries(
      Object.keys(template.fragment.nodesByLocalId).map((localId) => [
        localId,
        `${prefix}-${localId}`,
      ])
    );
    for (const [localId, descriptor] of Object.entries(
      template.fragment.nodesByLocalId
    )) {
      const nodeId = idByLocalId[localId];
      if (!nodeId || nodesById[nodeId]) {
        throw new Error(
          `Radix export template ${templateId} produced a duplicate node id.`
        );
      }
      nodesById[nodeId] = node(nodeId, descriptor.type, descriptor);
      childIdsById[nodeId] = (
        template.fragment.childIdsByLocalId[localId] ?? []
      ).map((childId) => {
        const resolved = idByLocalId[childId];
        if (!resolved) {
          throw new Error(
            `Radix export template ${templateId} references missing child ${childId}.`
          );
        }
        return resolved;
      });
    }
    childIdsById.root.push(
      ...template.fragment.rootLocalIds.map((localId) => {
        const resolved = idByLocalId[localId];
        if (!resolved) {
          throw new Error(
            `Radix export template ${templateId} references missing root ${localId}.`
          );
        }
        return resolved;
      })
    );
  }
  return document(name, nodesById, childIdsById);
};

const radixBlueprintTemplates = await readJson(
  'packages/plugin-radix/plugin/contributions/blueprint-template.json'
);

const fixtures = [
  {
    id: 'antd-only',
    libraries: ['antd'],
    document: document(
      'AntdOnlyExport',
      {
        root: node('root', 'container'),
        form: node('form', 'AntdFormItem', { props: { label: 'Name' } }),
        input: node('input', 'AntdInput', { props: { placeholder: 'Name' } }),
        modal: node('modal', 'AntdModal', {
          props: { open: false, title: 'Generated modal' },
        }),
        table: node('table', 'AntdTable', {
          props: {
            columns: [{ dataIndex: 'name', key: 'name', title: 'Name' }],
            dataSource: [{ key: 'row-1', name: 'Generated row' }],
            pagination: false,
          },
        }),
        typography: node('typography', 'AntdTypography'),
        title: node('title', 'AntdTypographyTitle', {
          props: { level: 2 },
          text: 'Generated heading',
        }),
        paragraph: node('paragraph', 'AntdTypographyParagraph', {
          text: 'Generated body',
        }),
        icon: node('icon', 'PdxIcon', {
          props: {
            'aria-label': 'Search icon',
            iconRef: {
              provider: 'ant-design-icons',
              name: 'Search',
              variant: 'outlined',
            },
            size: 18,
          },
        }),
      },
      {
        root: ['form', 'modal', 'table', 'typography', 'icon'],
        form: ['input'],
        input: [],
        modal: [],
        table: [],
        typography: ['title', 'paragraph'],
        title: [],
        paragraph: [],
        icon: [],
      }
    ),
    sourceMarkers: [
      '<Form.Item',
      '<Input',
      '<Modal',
      '<Table',
      '<Typography',
      '<Typography.Title',
      '<Typography.Paragraph',
      '<SearchOutlined',
    ],
    verify: async (page) => {
      const input = page.getByPlaceholder('Name');
      await expect(input).toBeVisible();
      await input.fill('Ada Lovelace');
      await expect(input).toHaveValue('Ada Lovelace');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Generated heading' })
      ).toBeVisible();
      await expect(
        page.getByText('Generated body', { exact: true })
      ).toBeVisible();
      await expect(page.getByRole('table')).toContainText('Generated row');
      await expect(page.getByLabel('Search icon')).toBeVisible();
    },
  },
  {
    id: 'mui-only',
    libraries: ['mui'],
    document: document(
      'MuiOnlyExport',
      {
        root: node('root', 'MuiAccordion', {
          props: { defaultExpanded: true },
        }),
        summary: node('summary', 'MuiAccordionSummary', { text: 'Summary' }),
        details: node('details', 'MuiAccordionDetails', { text: 'Details' }),
      },
      { root: ['summary', 'details'], summary: [], details: [] }
    ),
    sourceMarkers: [
      "from '@mui/material'",
      '<Accordion',
      '<AccordionSummary',
      '<AccordionDetails',
    ],
    verify: async (page) => {
      const trigger = page.getByRole('button', { name: 'Summary' });
      const details = page.getByText('Details', { exact: true });
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(details).toBeVisible();
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(details).toBeHidden();
      await trigger.click();
      await expect(details).toBeVisible();
    },
  },
  {
    id: 'radix-only',
    libraries: ['radix'],
    document: documentFromTemplates(
      'RadixOnlyExport',
      radixBlueprintTemplates,
      ['radix.tabs', 'radix.dialog', 'radix.tooltip']
    ),
    sourceMarkers: [
      "from '@radix-ui/react-tabs'",
      "from '@radix-ui/react-dialog'",
      "from '@radix-ui/react-tooltip'",
      '<Tabs.Root',
      '<Tabs.Trigger',
      '<Tabs.Content',
      '<Dialog.Portal',
      '<Dialog.Content',
      '<Tooltip.Portal',
      '<Tooltip.Content',
      '<Tooltip.Arrow',
    ],
    verify: async (page) => {
      const first = page.getByRole('tab', { name: 'First' });
      const second = page.getByRole('tab', { name: 'Second' });
      await expect(first).toHaveAttribute('aria-selected', 'true');
      await first.focus();
      await page.keyboard.press('ArrowRight');
      await expect(second).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel')).toHaveText('Second tab content');
      const dialogTrigger = page.getByRole('button', { name: 'Open dialog' });
      await dialogTrigger.click();
      await expect(
        page.getByRole('dialog', { name: 'Dialog title' })
      ).toContainText('Dialog description');
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('dialog', { name: 'Dialog title' })
      ).toBeHidden();
      await expect(dialogTrigger).toBeFocused();
      await dialogTrigger.click();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Dialog title' })
      ).toBeHidden();
      await expect(dialogTrigger).toBeFocused();
      const tooltipTrigger = page.getByRole('button', {
        name: 'Hover for help',
      });
      await tooltipTrigger.focus();
      await expect(page.getByRole('tooltip')).toHaveText('Helpful information');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toBeHidden();
      await expect(tooltipTrigger).toBeFocused();
    },
  },
  {
    id: 'all-official',
    libraries: ['antd', 'mui', 'radix'],
    document: document(
      'AllOfficialExport',
      {
        root: node('root', 'container'),
        antd: node('antd', 'AntdButton', { text: 'Ant action' }),
        mui: node('mui', 'MuiButton', { text: 'Material action' }),
        radix: node('radix', 'RadixSwitchRoot', {
          props: { defaultChecked: true, 'aria-label': 'Feature' },
        }),
        thumb: node('thumb', 'RadixSwitchThumb'),
        icon: node('icon', 'PdxIcon', {
          props: {
            'aria-label': 'Material add icon',
            iconRef: { provider: 'mui-icons', name: 'Add' },
            size: 18,
          },
        }),
      },
      {
        root: ['antd', 'mui', 'radix', 'icon'],
        antd: [],
        mui: [],
        radix: ['thumb'],
        thumb: [],
        icon: [],
      }
    ),
    sourceMarkers: [
      "from 'antd'",
      "from '@mui/material'",
      "from '@radix-ui/react-switch'",
      "from '@mui/icons-material'",
      '<Button ',
      '<Button2',
      '<Switch.Root',
      '<Add',
    ],
    verify: async (page) => {
      await expect(
        page.getByRole('button', { name: 'Ant action' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Material action' })
      ).toBeVisible();
      const feature = page.getByRole('switch', { name: 'Feature' });
      await expect(feature).toHaveAttribute('aria-checked', 'true');
      await feature.click();
      await expect(feature).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByLabel('Material add icon')).toBeVisible();
    },
  },
];

const byName = new Map(
  definitions.map((definition) => [definition.name, definition])
);
const workspaceRoot = await mkdtemp(
  join(tmpdir(), 'prodivix-official-exports-')
);
const projectsRoot = join(workspaceRoot, 'projects');

const createWorkspace = (fixture) => {
  const documentId = `page-${fixture.id}`;
  const documentNodeId = `document-${fixture.id}`;
  const pagesDirectoryNodeId = 'pages';
  return {
    id: `workspace-${fixture.id}`,
    name: fixture.document.metadata?.name ?? fixture.id,
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
        children: [pagesDirectoryNodeId],
      },
      [pagesDirectoryNodeId]: {
        id: pagesDirectoryNodeId,
        kind: 'dir',
        name: 'pages',
        parentId: 'root',
        children: [documentNodeId],
      },
      [documentNodeId]: {
        id: documentNodeId,
        kind: 'doc',
        name: `${fixture.id}.pir.json`,
        parentId: pagesDirectoryNodeId,
        docId: documentId,
      },
    },
    docsById: {
      [documentId]: {
        id: documentId,
        type: 'pir-page',
        path: `/pages/${fixture.id}.pir.json`,
        contentRev: 1,
        metaRev: 1,
        content: fixture.document,
      },
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'route-root',
        children: [
          { id: `route-${fixture.id}`, index: true, pageDocId: documentId },
        ],
      },
    },
    activeDocumentId: documentId,
    activeRouteNodeId: `route-${fixture.id}`,
  };
};

const writeBundle = async (fixture) => {
  const selected = fixture.libraries.map((name) => {
    const definition = byName.get(name);
    if (!definition)
      throw new Error(`Unknown official fixture library ${name}.`);
    return definition;
  });
  const snapshot = {
    schemaVersion: '1.0',
    registryRevision: 1,
    targetPreset: 'react-vite',
    libraries: selected.map((definition) => definition.library),
    iconProviders: selected.flatMap((definition) =>
      definition.iconProvider ? [definition.iconProvider] : []
    ),
  };
  const bundle = generateWorkspaceReactViteBundle(createWorkspace(fixture), {
    projectName: fixture.document.metadata?.name ?? fixture.id,
    codegenPolicySnapshot: snapshot,
  });
  const errors = bundle.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  );
  if (errors.length > 0) {
    throw new Error(
      `${fixture.id} export failed:\n${errors
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('\n')}`
    );
  }
  const generatedSource = bundle.files
    .filter((file) => typeof file.contents === 'string')
    .map((file) => file.contents)
    .join('\n');
  for (const marker of fixture.sourceMarkers ?? []) {
    if (!generatedSource.includes(marker)) {
      throw new Error(
        `${fixture.id} export is missing source marker ${marker}.`
      );
    }
  }
  const packageFile = bundle.files.find((file) => file.path === 'package.json');
  const packageManager = packageFile
    ? JSON.parse(packageFile.contents).packageManager
    : undefined;
  if (typeof packageManager !== 'string' || !packageManager.trim()) {
    throw new Error(`${fixture.id} export has no packageManager declaration.`);
  }
  const projectRoot = join(projectsRoot, fixture.id);
  for (const file of bundle.files) {
    if (file.path === 'pnpm-workspace.yaml') continue;
    if (typeof file.contents !== 'string') {
      throw new Error(`${fixture.id}/${file.path} is not a text export file.`);
    }
    const target = resolve(projectRoot, file.path);
    if (
      !target.startsWith(
        `${resolve(projectRoot)}${process.platform === 'win32' ? '\\' : '/'}`
      )
    ) {
      throw new Error(`Export path escapes fixture root: ${file.path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents, 'utf8');
  }
  return { fixture, packageManager, projectRoot };
};

const contentTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

const closeServer = (server) =>
  new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });

const verifyBuiltProject = async (browser, output) => {
  const distRoot = resolve(output.projectRoot, 'dist');
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(
        /^\/+/,
        ''
      );
      const requestedPath = resolve(distRoot, relativePath || 'index.html');
      const distPrefix = `${distRoot}${process.platform === 'win32' ? '\\' : '/'}`;
      const targetPath =
        requestedPath === distRoot || !requestedPath.startsWith(distPrefix)
          ? resolve(distRoot, 'index.html')
          : requestedPath;
      let contents;
      try {
        contents = await readFile(targetPath);
      } catch {
        contents = await readFile(resolve(distRoot, 'index.html'));
      }
      response.writeHead(200, {
        'content-type':
          contentTypes[extname(targetPath).toLowerCase()] ??
          'application/octet-stream',
      });
      response.end(contents);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error(`${output.fixture.id} export server has no TCP address.`);
  }
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${address.port}`, {
      waitUntil: 'networkidle',
    });
    await output.fixture.verify(page);
  } finally {
    await page.close();
    await closeServer(server);
  }
};

const runCorepack = (args) => {
  const executable =
    process.platform === 'win32'
      ? (process.env.ComSpec ?? 'cmd.exe')
      : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'corepack.cmd', ...args]
      : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `corepack ${args.join(' ')} failed.`,
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
};

try {
  await mkdir(projectsRoot, { recursive: true });
  const outputs = await Promise.all(fixtures.map(writeBundle));
  const packageManagers = [
    ...new Set(outputs.map(({ packageManager }) => packageManager)),
  ];
  if (packageManagers.length !== 1) {
    throw new Error(
      `Official export fixtures disagree on packageManager: ${packageManagers.join(', ')}.`
    );
  }
  await writeFile(
    join(workspaceRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'prodivix-official-export-fixtures',
        private: true,
        packageManager: packageManagers[0],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    join(workspaceRoot, 'pnpm-workspace.yaml'),
    "packages:\n  - 'projects/*'\n\nonlyBuiltDependencies:\n  - esbuild\n",
    'utf8'
  );
  runCorepack([
    'pnpm',
    'install',
    '--prefer-offline',
    '--frozen-lockfile=false',
  ]);
  runCorepack(['pnpm', '--recursive', 'run', 'build']);
  const browser = await chromium.launch();
  try {
    for (const output of outputs) await verifyBuiltProject(browser, output);
  } finally {
    await browser.close();
  }
  console.log(
    `Official plugin export install/build/browser behavior passed for ${fixtures.map(({ id }) => id).join(', ')}.`
  );
} finally {
  if (process.env.KEEP_OFFICIAL_EXPORT_FIXTURES === 'true') {
    console.log(`Official export fixtures retained at ${workspaceRoot}.`);
  } else {
    try {
      await rm(workspaceRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    } catch (error) {
      console.warn(
        `Official export fixture cleanup was deferred for ${workspaceRoot}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
