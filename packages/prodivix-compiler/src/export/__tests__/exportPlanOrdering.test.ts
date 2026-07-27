import { describe, expect, it } from 'vitest';
import {
  ProductionExportPlanner,
  createReactViteExportPreset,
} from '#src/export';
import type { ExportProgram, ExportSourceTrace } from '#src/export';

/**
 * Export planning feeds `.prodivix/export-manifest.json`, `origins.json`,
 * `licenses.json` and every emitted file's `contentHash`. Ordering therefore has
 * to be a pure function of the Workspace bytes, never of the host ICU locale, or
 * two machines produce different bundles for the same revision.
 *
 * Every fixture below pairs an upper-case and a lower-case name so that Unicode
 * code-point order (`B` = U+0042 before `a` = U+0061) is the opposite of what
 * ICU collation yields for Latin script in the locales CI actually runs under.
 */

const sourceTrace: ExportSourceTrace[] = [
  {
    sourceRef: { domain: 'pir', id: 'root', path: '/ui/graph/nodesById/root' },
  },
];

const createOrderingProgram = (): ExportProgram => ({
  target: createReactViteExportPreset().target,
  roots: [
    {
      id: 'home',
      kind: 'component',
      displayName: 'Home',
      sourceRef: sourceTrace[0].sourceRef,
    },
  ],
  modules: [
    {
      id: 'module-home',
      kind: 'react-component',
      suggestedName: 'Home',
      language: 'tsx',
      imports: [
        { kind: 'named', imported: 'alpha', local: 'alpha', source: 'alpha' },
        { kind: 'named', imported: 'Beta', local: 'Beta', source: 'Beta' },
      ],
      body: 'export default function Home() { return null; }',
      sourceTrace,
    },
  ],
  styles: [
    {
      id: 'alpha',
      scope: 'global',
      cssText: '.alpha { color: red; }',
      sourceTrace,
    },
    {
      id: 'Beta',
      scope: 'global',
      cssText: '.beta { color: blue; }',
      sourceTrace,
    },
  ],
  assets: [],
  artifacts: [],
  files: [],
  sources: [
    { kind: 'external-package', packageName: 'alpha', license: 'apache-2.0' },
    { kind: 'external-package', packageName: 'Beta', license: 'MIT' },
  ],
  deployments: [],
  runtimeRequirements: [],
  dependencies: [
    { name: 'alpha', version: '1.0.0' },
    { name: 'Beta', version: '1.0.0' },
  ],
  diagnostics: [],
});

const planOrderingBundle = () =>
  new ProductionExportPlanner().plan(createOrderingProgram());

const readJsonFile = (
  bundle: ReturnType<typeof planOrderingBundle>,
  path: string
): unknown => {
  const file = bundle.files.find((candidate) => candidate.path === path);
  if (!file || typeof file.contents !== 'string') {
    throw new Error(`Expected export bundle to emit ${path}.`);
  }
  return JSON.parse(file.contents);
};

describe('export plan ordering', () => {
  it('orders emitted module imports by Unicode code point', () => {
    const bundle = planOrderingBundle();
    const moduleFile = bundle.files.find((file) => file.id === 'module-home');
    const contents = String(moduleFile?.contents ?? '');
    const namedImportLines = contents
      .split('\n')
      .filter((line) => line.startsWith('import { '));

    expect(namedImportLines).toEqual([
      "import { Beta } from 'Beta';",
      "import { alpha } from 'alpha';",
    ]);
  });

  it('orders manifest dependencies by Unicode code point', () => {
    const manifest = readJsonFile(
      planOrderingBundle(),
      '.prodivix/export-manifest.json'
    ) as { dependencies: { name: string }[] };

    expect(manifest.dependencies.map((entry) => entry.name)).toEqual([
      'Beta',
      'alpha',
    ]);
  });

  it('orders emitted license and origin summaries by Unicode code point', () => {
    const bundle = planOrderingBundle();
    const licenses = readJsonFile(bundle, '.prodivix/licenses.json') as {
      license: string;
    }[];
    const origins = readJsonFile(bundle, '.prodivix/origins.json') as {
      packageName?: string;
    }[];

    expect(licenses.map((entry) => entry.license)).toEqual([
      'MIT',
      'apache-2.0',
    ]);
    expect(
      origins
        .map((entry) => entry.packageName)
        .filter((name): name is string => Boolean(name))
    ).toEqual(['Beta', 'alpha']);
  });

  it('orders manifest source summaries by Unicode code point', () => {
    const manifest = readJsonFile(
      planOrderingBundle(),
      '.prodivix/export-manifest.json'
    ) as { sources: { packageName?: string }[] };

    expect(
      manifest.sources
        .map((entry) => entry.packageName)
        .filter((name): name is string => Boolean(name))
    ).toEqual(['Beta', 'alpha']);
  });

  it('concatenates grouped stylesheet contributions by Unicode code point', () => {
    const bundle = planOrderingBundle();
    const styleSheet = bundle.files.find((file) => file.kind === 'stylesheet');
    const cssText = String(styleSheet?.contents ?? '');

    expect(cssText.indexOf('.beta')).toBeLessThan(cssText.indexOf('.alpha'));
  });
});
