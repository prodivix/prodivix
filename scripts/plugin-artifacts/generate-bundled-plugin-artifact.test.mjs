import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { format } from 'prettier';
import { generateBundledPluginArtifact } from './generate-bundled-plugin-artifact.mjs';

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'prodivix-plugin-artifact-')
);
await mkdir(path.join(temporaryDirectory, 'plugin', 'contributions'), {
  recursive: true,
});
await mkdir(path.join(temporaryDirectory, 'src'), { recursive: true });
await writeFile(
  path.join(temporaryDirectory, 'plugin', 'manifest.json'),
  JSON.stringify({
    schemaVersion: '1.0',
    id: '@prodivix/plugin-script-test',
    displayName: 'Plugin Script Test',
    version: '1.0.0',
    publisher: 'prodivix',
    engines: { prodivix: '>=0.1.0 <1.0.0' },
    capabilities: [
      {
        id: 'extension.register',
        scope: 'paletteContribution',
        reason: 'Register the fixture Palette contribution.',
      },
    ],
    contributes: [
      {
        id: 'fixture.palette',
        point: 'paletteContribution',
        contractVersion: '1.0',
        source: {
          kind: 'resource',
          path: './contributions/palette.json',
        },
      },
    ],
  }),
  'utf8'
);
await writeFile(
  path.join(temporaryDirectory, 'plugin', 'contributions', 'palette.json'),
  '{"z":1,"a":2}',
  'utf8'
);

const generated = await generateBundledPluginArtifact({
  packageRoot: temporaryDirectory,
});
assert.match(generated.artifact.packageDigest, /^sha256-/);
assert.equal(generated.artifact.resources.length, 2);
assert.equal(
  new TextDecoder().decode(
    Uint8Array.from(generated.artifact.resources[0].bytes)
  ),
  '{"a":2,"z":1}'
);
const generatedManifest = JSON.parse(
  await readFile(
    path.join(temporaryDirectory, 'plugin', 'manifest.json'),
    'utf8'
  )
);
assert.match(
  generatedManifest.contributes[0].source.integrity,
  /^sha256-[A-Za-z0-9+/]{43}=$/
);
await generateBundledPluginArtifact({
  packageRoot: temporaryDirectory,
  check: true,
});

const output = await readFile(generated.outputFile, 'utf8');
await writeFile(generated.outputFile, `${output}\n`, 'utf8');
await assert.rejects(
  generateBundledPluginArtifact({
    packageRoot: temporaryDirectory,
    check: true,
  }),
  /is stale/
);

const officialDirectory = await mkdtemp(
  path.join(tmpdir(), 'prodivix-official-plugin-artifact-')
);
await mkdir(path.join(officialDirectory, 'plugin', 'contributions'), {
  recursive: true,
});
await mkdir(path.join(officialDirectory, 'src'), { recursive: true });
await writeFile(
  path.join(officialDirectory, 'package.json'),
  JSON.stringify({
    name: '@prodivix/plugin-generator-fixture',
    version: '0.0.1',
    dependencies: { '@fixture/ui': '1.0.0' },
  }),
  'utf8'
);
const officialResources = {
  'external-library.json': {
    schemaVersion: '1.0',
    libraryId: 'fixture-ui',
    displayName: 'Fixture UI',
    package: { name: '@fixture/ui', version: '1.0.0', license: 'MIT' },
    hostImplementationId: 'fixture.components',
    exportDiscovery: {
      strategy: 'declared',
      include: ['Accordion', 'AccordionSummary'],
    },
    components: [
      {
        exportName: 'Accordion',
        componentName: 'Accordion',
        runtimeType: 'FixtureAccordion',
      },
      {
        exportName: 'AccordionSummary',
        componentName: 'Accordion Summary',
        runtimeType: 'FixtureAccordionSummary',
      },
    ],
    dependencies: [],
  },
  'palette.json': {
    schemaVersion: '1.0',
    surface: 'blueprint.components',
    groups: [
      {
        id: 'fixture-components',
        label: 'Fixture Components',
        placement: { section: 'external', libraryId: 'fixture-ui' },
        items: [
          { kind: 'component', id: 'fixture-accordion', label: 'Accordion' },
        ],
      },
    ],
  },
  'blueprint-template.json': {
    schemaVersion: '1.0',
    surface: 'blueprint.components',
    templates: [
      {
        id: 'fixture.accordion-template',
        palette: {
          contributionId: 'fixture.palette',
          itemId: 'fixture-accordion',
        },
        primaryLocalId: 'root',
        fragment: {
          rootLocalIds: ['root'],
          nodesByLocalId: {
            root: { type: 'FixtureAccordion' },
            summary: { type: 'FixtureAccordionSummary' },
          },
          childIdsByLocalId: { root: ['summary'] },
        },
      },
    ],
  },
  'render-policy.json': {
    schemaVersion: '1.0',
    libraryId: 'fixture-ui',
    rules: [
      {
        id: 'fixture.accordion',
        runtimeType: 'FixtureAccordion',
        componentExport: 'Accordion',
        children: { mode: 'children-only' },
        portal: { mode: 'inline' },
        fallback: { behavior: 'error', message: 'Accordion is unavailable.' },
      },
      {
        id: 'fixture.accordion-summary',
        runtimeType: 'FixtureAccordionSummary',
        componentExport: 'AccordionSummary',
        children: { mode: 'preserve' },
        portal: { mode: 'inline' },
        fallback: {
          behavior: 'error',
          message: 'Accordion Summary is unavailable.',
        },
      },
    ],
  },
  'codegen-policy.json': {
    schemaVersion: '1.0',
    targetPreset: 'react-vite',
    libraryId: 'fixture-ui',
    dependencies: [
      {
        name: '@fixture/ui',
        version: '1.0.0',
        kind: 'dependency',
        license: 'MIT',
      },
    ],
    rules: [
      {
        id: 'fixture.accordion',
        runtimeType: 'FixtureAccordion',
        elementPath: ['Accordion'],
        import: {
          packageName: '@fixture/ui',
          kind: 'named',
          imported: 'Accordion',
        },
        children: { mode: 'children-only' },
      },
      {
        id: 'fixture.accordion-summary',
        runtimeType: 'FixtureAccordionSummary',
        elementPath: ['AccordionSummary'],
        import: {
          packageName: '@fixture/ui',
          kind: 'named',
          imported: 'AccordionSummary',
        },
        children: { mode: 'preserve' },
      },
    ],
    unsupported: {
      behavior: 'error',
      message: 'Fixture UI component has no export policy.',
    },
  },
};
for (const [fileName, value] of Object.entries(officialResources)) {
  await writeFile(
    path.join(officialDirectory, 'plugin', 'contributions', fileName),
    JSON.stringify(value),
    'utf8'
  );
}
await writeFile(
  path.join(officialDirectory, 'plugin', 'support-matrix.json'),
  JSON.stringify({
    schemaVersion: '1.0',
    catalog: {
      catalogId: 'fixture-ui',
      description: 'Generator fixture component library.',
      scope: 'component',
    },
    library: {
      id: 'fixture-ui',
      displayName: 'Fixture UI',
      package: { name: '@fixture/ui', version: '1.0.0', license: 'MIT' },
    },
    hostPackages: [{ name: '@fixture/ui', version: '1.0.0' }],
    hostImplementations: [
      { id: 'fixture.components', kind: 'component-library' },
      { id: 'fixture.palette', kind: 'palette-projection' },
    ],
    unsupportedRuntimeTypes: ['FixtureLegacyAccordion'],
    components: [
      {
        path: 'Accordion',
        exportName: 'Accordion',
        runtimeType: 'FixtureAccordion',
        paletteItemId: 'fixture-accordion',
        support: 'template',
        creation: 'template',
      },
      {
        path: 'Accordion.Summary',
        exportName: 'AccordionSummary',
        runtimeType: 'FixtureAccordionSummary',
        support: 'supported',
        creation: 'template-only',
      },
    ],
  }),
  'utf8'
);
const officialDeclarations = [
  ['fixture.library', 'externalLibrary', 'external-library.json'],
  ['fixture.palette', 'paletteContribution', 'palette.json'],
  ['fixture.templates', 'blueprintTemplate', 'blueprint-template.json'],
  ['fixture.render', 'renderPolicy', 'render-policy.json'],
  ['fixture.codegen', 'codegenPolicy', 'codegen-policy.json'],
];
await writeFile(
  path.join(officialDirectory, 'plugin', 'manifest.json'),
  JSON.stringify({
    schemaVersion: '1.0',
    id: '@prodivix/plugin-generator-fixture',
    displayName: 'Generator Fixture',
    version: '0.0.1',
    publisher: 'prodivix',
    engines: { prodivix: '>=0.1.0 <1.0.0' },
    capabilities: officialDeclarations.map(([, point]) => ({
      id: 'extension.register',
      scope: point,
      reason: `Register ${point}.`,
    })),
    contributes: officialDeclarations.map(([id, point, fileName]) => ({
      id,
      point,
      contractVersion: '1.0',
      source: { kind: 'resource', path: `./contributions/${fileName}` },
    })),
  }),
  'utf8'
);
const officialGenerated = await generateBundledPluginArtifact({
  packageRoot: officialDirectory,
});
assert.equal(officialGenerated.catalog.support.total, 2);
assert.equal(
  officialGenerated.catalog.components[1].creation,
  'template-only'
);
assert.deepEqual(officialGenerated.catalog.unsupportedRuntimeTypes, [
  'FixtureLegacyAccordion',
]);
for (const generatedFile of [
  officialGenerated.outputFile,
  officialGenerated.catalogOutputFile,
]) {
  const generatedSource = await readFile(generatedFile, 'utf8');
  assert.equal(
    await format(generatedSource, { parser: 'typescript' }),
    generatedSource
  );
}
const generatedManifestSource = await readFile(
  path.join(officialDirectory, 'plugin', 'manifest.json'),
  'utf8'
);
assert.equal(
  await format(generatedManifestSource, { parser: 'json' }),
  generatedManifestSource
);
await generateBundledPluginArtifact({
  packageRoot: officialDirectory,
  check: true,
});

process.stdout.write('Bundled plugin artifact generator tests passed.\n');
