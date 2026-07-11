import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  canonicalJsonBytes,
  computeBundledPluginPackageDigest,
  createWebCryptoBundledPluginDigestService,
  normalizeBundledPluginResourcePath,
} from '../../packages/plugin-package/dist/index.js';
import {
  parseStrictJsonDocument,
  validateBlueprintTemplateContribution,
  validateCodegenPolicyContribution,
  validateExternalLibraryContribution,
  validateIconProviderContribution,
  validatePaletteContribution,
  validatePluginManifest,
  validateRenderPolicyContribution,
} from '../../packages/plugin-contracts/dist/index.js';

const decoder = new TextDecoder();
const digestService = createWebCryptoBundledPluginDigestService();
const OFFICIAL_SUPPORT_STATUSES = new Set([
  'supported',
  'template',
  'degraded',
]);
const OFFICIAL_CREATION_MODES = new Set([
  'direct',
  'template',
  'template-only',
]);
const OFFICIAL_IMPLEMENTATION_KINDS = new Set([
  'component-library',
  'palette-projection',
  'render-policy',
  'icon-provider',
]);
const descriptorValidators = Object.freeze({
  externalLibrary: validateExternalLibraryContribution,
  paletteContribution: validatePaletteContribution,
  blueprintTemplate: validateBlueprintTemplateContribution,
  renderPolicy: validateRenderPolicyContribution,
  codegenPolicy: validateCodegenPolicyContribution,
  iconProvider: validateIconProviderContribution,
});

const dirname = (resourcePath) => {
  const index = resourcePath.lastIndexOf('/');
  return index < 0 ? '' : resourcePath.slice(0, index);
};

const resolveManifestResourcePath = (manifestPath, sourcePath) => {
  const normalizedSource = normalizeBundledPluginResourcePath(sourcePath);
  const base = dirname(manifestPath);
  return base ? `${base}/${normalizedSource}` : normalizedSource;
};

const collectJsonFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(absolutePath);
    }
  }
  return files;
};

const toTypeScript = (artifact) => `/**
 * Generated bundled plugin artifact. DO NOT EDIT.
 */
import type { BundledPluginArtifactV1 } from '@prodivix/plugin-package';

export const BUNDLED_PLUGIN_ARTIFACT = ${JSON.stringify(
  artifact,
  null,
  2
)} as const satisfies BundledPluginArtifactV1;
`;

const toCatalogTypeScript = (catalog) => `/**
 * Generated official plugin catalog. DO NOT EDIT.
 */
import type { GeneratedOfficialPluginCatalog } from '@prodivix/plugin-package';

export const GENERATED_OFFICIAL_PLUGIN_CATALOG = ${JSON.stringify(
  catalog,
  null,
  2
)} as const satisfies GeneratedOfficialPluginCatalog;
`;

const formatGeneratedSource = async (
  source,
  parser,
  absolutePackageRoot
) => {
  const configured =
    (await resolveConfig(path.join(absolutePackageRoot, 'package.json'))) ?? {};
  return format(source, { ...configured, parser });
};

const isRecord = (value) =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requireString = (value, path) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value.trim();
};

const uniqueBy = (items, select, label) => {
  const seen = new Set();
  for (const item of items) {
    const key = select(item);
    if (seen.has(key)) throw new Error(`${label} ${JSON.stringify(key)} is duplicated.`);
    seen.add(key);
  }
  return seen;
};

const readJsonResourceValue = (resourcesByPath, resourcePath, label) => {
  const resource = resourcesByPath.get(resourcePath);
  if (!resource) throw new Error(`${label} ${resourcePath} does not exist.`);
  if (!isRecord(resource.value)) throw new Error(`${label} must be a JSON object.`);
  return resource.value;
};

const validateOfficialSupportMatrixShape = (matrix) => {
  if (matrix.schemaVersion !== '1.0') {
    throw new Error('Official support matrix schemaVersion must be "1.0".');
  }
  if (!isRecord(matrix.catalog) || !isRecord(matrix.library)) {
    throw new Error('Official support matrix requires catalog and library objects.');
  }
  if (!isRecord(matrix.library.package)) {
    throw new Error('Official support matrix requires a library package coordinate.');
  }
  if (!Array.isArray(matrix.hostPackages) || matrix.hostPackages.length === 0) {
    throw new Error('Official support matrix requires hostPackages.');
  }
  if (
    !Array.isArray(matrix.hostImplementations) ||
    matrix.hostImplementations.length === 0
  ) {
    throw new Error('Official support matrix requires hostImplementations.');
  }
  if (!Array.isArray(matrix.components) || matrix.components.length === 0) {
    throw new Error('Official support matrix requires components.');
  }
  const components = matrix.components.map((component, index) => {
    if (!isRecord(component)) {
      throw new Error(`support-matrix components[${index}] must be an object.`);
    }
    const support = requireString(component.support, `components[${index}].support`);
    const creation = requireString(component.creation, `components[${index}].creation`);
    if (!OFFICIAL_SUPPORT_STATUSES.has(support)) {
      throw new Error(`components[${index}].support is not supported.`);
    }
    if (!OFFICIAL_CREATION_MODES.has(creation)) {
      throw new Error(`components[${index}].creation is not supported.`);
    }
    const paletteItemId =
      typeof component.paletteItemId === 'string' &&
      component.paletteItemId.trim()
        ? component.paletteItemId.trim()
        : undefined;
    if (creation === 'template-only' ? paletteItemId : !paletteItemId) {
      throw new Error(
        creation === 'template-only'
          ? `components[${index}] template-only runtime cannot declare a Palette item.`
          : `components[${index}] creation mode requires a Palette item.`
      );
    }
    return Object.freeze({
      path: requireString(component.path, `components[${index}].path`),
      exportName: requireString(
        component.exportName,
        `components[${index}].exportName`
      ),
      runtimeType: requireString(
        component.runtimeType,
        `components[${index}].runtimeType`
      ),
      ...(paletteItemId ? { paletteItemId } : {}),
      support,
      creation,
    });
  });
  uniqueBy(components, (item) => item.path, 'Component path');
  uniqueBy(components, (item) => item.exportName, 'Component export');
  uniqueBy(components, (item) => item.runtimeType, 'Component runtime type');
  uniqueBy(
    components.filter((item) => item.paletteItemId),
    (item) => item.paletteItemId,
    'Palette item'
  );

  if (
    matrix.unsupportedRuntimeTypes !== undefined &&
    !Array.isArray(matrix.unsupportedRuntimeTypes)
  ) {
    throw new Error('unsupportedRuntimeTypes must be an array when declared.');
  }
  const unsupportedRuntimeTypes = Object.freeze(
    (matrix.unsupportedRuntimeTypes ?? []).map((runtimeType, index) =>
      requireString(runtimeType, `unsupportedRuntimeTypes[${index}]`)
    )
  );
  uniqueBy(
    unsupportedRuntimeTypes,
    (runtimeType) => runtimeType,
    'Unsupported runtime type'
  );
  const componentRuntimeTypes = new Set(
    components.map((component) => component.runtimeType)
  );
  const conflictingRuntimeType = unsupportedRuntimeTypes.find((runtimeType) =>
    componentRuntimeTypes.has(runtimeType)
  );
  if (conflictingRuntimeType) {
    throw new Error(
      `Unsupported runtime type ${JSON.stringify(conflictingRuntimeType)} is also declared as a component.`
    );
  }

  const hostImplementations = matrix.hostImplementations.map(
    (implementation, index) => {
      if (!isRecord(implementation)) {
        throw new Error(
          `support-matrix hostImplementations[${index}] must be an object.`
        );
      }
      const kind = requireString(
        implementation.kind,
        `hostImplementations[${index}].kind`
      );
      if (!OFFICIAL_IMPLEMENTATION_KINDS.has(kind)) {
        throw new Error(`hostImplementations[${index}].kind is not supported.`);
      }
      return Object.freeze({
        id: requireString(
          implementation.id,
          `hostImplementations[${index}].id`
        ),
        kind,
      });
    }
  );
  uniqueBy(hostImplementations, (item) => item.id, 'Host implementation');

  const hostPackages = matrix.hostPackages.map((coordinate, index) => {
    if (!isRecord(coordinate)) {
      throw new Error(`support-matrix hostPackages[${index}] must be an object.`);
    }
    return Object.freeze({
      name: requireString(coordinate.name, `hostPackages[${index}].name`),
      version: requireString(
        coordinate.version,
        `hostPackages[${index}].version`
      ),
    });
  });
  uniqueBy(hostPackages, (item) => item.name, 'Host package');

  return Object.freeze({
    catalog: Object.freeze({
      catalogId: requireString(matrix.catalog.catalogId, 'catalog.catalogId'),
      description: requireString(
        matrix.catalog.description,
        'catalog.description'
      ),
      scope: requireString(matrix.catalog.scope, 'catalog.scope'),
    }),
    library: Object.freeze({
      id: requireString(matrix.library.id, 'library.id'),
      displayName: requireString(
        matrix.library.displayName,
        'library.displayName'
      ),
      package: Object.freeze({
        name: requireString(matrix.library.package.name, 'library.package.name'),
        version: requireString(
          matrix.library.package.version,
          'library.package.version'
        ),
        license: requireString(
          matrix.library.package.license,
          'library.package.license'
        ),
      }),
    }),
    hostPackages: Object.freeze(hostPackages),
    hostImplementations: Object.freeze(hostImplementations),
    components: Object.freeze(components),
    unsupportedRuntimeTypes,
  });
};

const descriptorEntriesFromManifest = (
  manifest,
  normalizedManifestPath,
  resourcesByPath
) =>
  (manifest.contributes ?? []).map((declaration) => {
    if (declaration?.source?.kind !== 'resource') {
      throw new Error(
        `Official contribution ${declaration?.id ?? '<unknown>'} must use a resource source.`
      );
    }
    const descriptorPath = resolveManifestResourcePath(
      normalizedManifestPath,
      declaration.source.path
    );
    const descriptor = readJsonResourceValue(
      resourcesByPath,
      descriptorPath,
      `Contribution ${declaration.id}`
    );
    const validator = descriptorValidators[declaration.point];
    if (!validator || declaration.contractVersion !== '1.0') {
      throw new Error(
        `Contribution ${declaration.id} uses an unsupported exact contract.`
      );
    }
    const validation = validator(descriptor);
    if (!validation.ok) {
      throw new Error(
        `Contribution ${declaration.id} is invalid: ${validation.diagnostics
          .map((item) => item.message)
          .join(' ')}`
      );
    }
    return Object.freeze({ declaration, descriptor: validation.descriptor });
  });

const exactlyOne = (entries, point) => {
  const matches = entries.filter((entry) => entry.declaration.point === point);
  if (matches.length !== 1) {
    throw new Error(`Official component plugin requires exactly one ${point} contribution.`);
  }
  return matches[0];
};

const optionalOne = (entries, point) => {
  const matches = entries.filter((entry) => entry.declaration.point === point);
  if (matches.length > 1) {
    throw new Error(`Official component plugin allows at most one ${point} contribution.`);
  }
  return matches[0];
};

const assertExactSet = (actual, expected, label) => {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const extra = [...actualSet].filter((item) => !expectedSet.has(item));
  if (actualSet.size !== actual.length || missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} does not match the support matrix` +
        `${missing.length > 0 ? `; missing ${missing.join(', ')}` : ''}` +
        `${extra.length > 0 ? `; extra ${extra.join(', ')}` : ''}.`
    );
  }
};

const validateOfficialComponentClosure = ({
  manifest,
  packageJson,
  matrix,
  entries,
}) => {
  if (packageJson.name !== manifest.id || packageJson.version !== manifest.version) {
    throw new Error('Package name/version must match the official Plugin Manifest.');
  }
  if (matrix.catalog.scope !== 'component') {
    throw new Error('Official component plugin catalog scope must be "component".');
  }
  const dependencyVersions = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  };
  matrix.hostPackages.forEach((coordinate) => {
    if (dependencyVersions[coordinate.name] !== coordinate.version) {
      throw new Error(
        `Package dependency ${coordinate.name} must use exact version ${coordinate.version}.`
      );
    }
  });

  const external = exactlyOne(entries, 'externalLibrary');
  const palette = exactlyOne(entries, 'paletteContribution');
  const render = exactlyOne(entries, 'renderPolicy');
  const codegen = exactlyOne(entries, 'codegenPolicy');
  const templates = optionalOne(entries, 'blueprintTemplate');
  const icons = optionalOne(entries, 'iconProvider');
  if (
    external.descriptor.libraryId !== matrix.library.id ||
    external.descriptor.displayName !== matrix.library.displayName ||
    external.descriptor.package.name !== matrix.library.package.name ||
    external.descriptor.package.version !== matrix.library.package.version ||
    external.descriptor.package.license !== matrix.library.package.license
  ) {
    throw new Error('External Library identity does not match the support matrix.');
  }
  const externalDependencies = new Map(
    external.descriptor.dependencies.map((dependency) => [
      dependency.name,
      dependency,
    ])
  );
  codegen.descriptor.dependencies.forEach((dependency) => {
    if (dependencyVersions[dependency.name] !== dependency.version) {
      throw new Error(
        `Codegen dependency ${dependency.name} must use exact package version ${dependency.version}.`
      );
    }
    if (dependency.name === external.descriptor.package.name) {
      if (
        dependency.version !== external.descriptor.package.version ||
        dependency.license !== external.descriptor.package.license
      ) {
        throw new Error(
          `Codegen root dependency ${dependency.name} does not match the External Library coordinate.`
        );
      }
      return;
    }
    const externalDependency = externalDependencies.get(dependency.name);
    if (
      !externalDependency ||
      externalDependency.version !== dependency.version ||
      externalDependency.license !== dependency.license
    ) {
      throw new Error(
        `Codegen dependency ${dependency.name} is not declared with the same coordinate by External Library.`
      );
    }
  });

  const componentsByRuntimeType = new Map(
    matrix.components.map((component) => [component.runtimeType, component])
  );
  assertExactSet(
    external.descriptor.components.map((component) => component.runtimeType),
    matrix.components.map((component) => component.runtimeType),
    'External Library runtime types'
  );
  external.descriptor.components.forEach((component) => {
    const expected = componentsByRuntimeType.get(component.runtimeType);
    if (!expected || component.exportName !== expected.exportName) {
      throw new Error(
        `External component ${component.runtimeType} does not match its support-matrix export.`
      );
    }
  });

  const paletteItems = palette.descriptor.groups.flatMap((group) => group.items);
  assertExactSet(
    paletteItems.map((item) => item.id),
    matrix.components.flatMap((component) =>
      component.paletteItemId ? [component.paletteItemId] : []
    ),
    'Palette items'
  );
  const templateBindings = new Set(
    (templates?.descriptor.templates ?? []).map((template) =>
      JSON.stringify([
        template.palette.contributionId,
        template.palette.itemId,
      ])
    )
  );
  const templateRuntimeTypes = new Set(
    (templates?.descriptor.templates ?? []).flatMap((template) =>
      Object.values(template.fragment.nodesByLocalId).map((node) => node.type)
    )
  );
  matrix.components.forEach((component) => {
    if (component.creation === 'template-only') {
      if (!templateRuntimeTypes.has(component.runtimeType)) {
        throw new Error(
          `Template-only runtime ${component.runtimeType} is not referenced by any template fragment.`
        );
      }
      return;
    }
    const item = paletteItems.find(
      (candidate) => candidate.id === component.paletteItemId
    );
    const bindingKey = JSON.stringify([
      palette.declaration.id,
      component.paletteItemId,
    ]);
    if (component.creation === 'template') {
      if (item?.runtimeType !== undefined || !templateBindings.has(bindingKey)) {
        throw new Error(
          `Palette item ${component.paletteItemId} must use one template recipe.`
        );
      }
    } else if (
      item?.runtimeType !== component.runtimeType ||
      templateBindings.has(bindingKey)
    ) {
      throw new Error(
        `Palette item ${component.paletteItemId} must use one direct recipe.`
      );
    }
  });

  for (const [point, rules] of [
    ['Render Policy', render.descriptor.rules],
    ['Codegen Policy', codegen.descriptor.rules],
  ]) {
    assertExactSet(
      rules.map((rule) => rule.runtimeType),
      matrix.components.map((component) => component.runtimeType),
      `${point} runtime types`
    );
  }

  const referencedImplementations = [];
  if (external.descriptor.hostImplementationId) {
    referencedImplementations.push({
      id: external.descriptor.hostImplementationId,
      kind: 'component-library',
    });
  }
  referencedImplementations.push({
    id: palette.declaration.id,
    kind: 'palette-projection',
  });
  render.descriptor.rules.forEach((rule) => {
    if (rule.hostImplementationId) {
      referencedImplementations.push({
        id: rule.hostImplementationId,
        kind: 'render-policy',
      });
    }
  });
  if (icons) {
    referencedImplementations.push({
      id: icons.descriptor.hostImplementationId,
      kind: 'icon-provider',
    });
  }
  const uniqueReferences = [
    ...new Map(
      referencedImplementations.map((item) => [item.id, item])
    ).values(),
  ];
  assertExactSet(
    uniqueReferences.map((item) => `${item.id}:${item.kind}`),
    matrix.hostImplementations.map((item) => `${item.id}:${item.kind}`),
    'Host implementation declarations'
  );
};

const createGeneratedCatalog = (manifest, matrix) => {
  const counts = { supported: 0, template: 0, degraded: 0 };
  matrix.components.forEach((component) => {
    counts[component.support] += 1;
  });
  return Object.freeze({
    schemaVersion: '1.0',
    catalogId: matrix.catalog.catalogId,
    pluginId: manifest.id,
    displayName: matrix.library.displayName,
    description: matrix.catalog.description,
    libraryId: matrix.library.id,
    scope: 'component',
    package: matrix.library.package,
    support: Object.freeze({
      total: matrix.components.length,
      ...counts,
    }),
    components: matrix.components,
    ...(matrix.unsupportedRuntimeTypes.length > 0
      ? { unsupportedRuntimeTypes: matrix.unsupportedRuntimeTypes }
      : {}),
    hostImplementations: matrix.hostImplementations,
  });
};

export const generateBundledPluginArtifact = async ({
  packageRoot,
  resourceDirectory = 'plugin',
  manifestPath = 'plugin/manifest.json',
  outputFile = 'src/artifact.generated.ts',
  supportMatrixPath = 'plugin/support-matrix.json',
  catalogOutputFile = 'src/catalog.generated.ts',
  check = false,
}) => {
  const absolutePackageRoot = path.resolve(packageRoot);
  const absoluteResourceDirectory = path.resolve(
    absolutePackageRoot,
    resourceDirectory
  );
  const normalizedManifestPath = normalizeBundledPluginResourcePath(
    manifestPath
  );
  const files = await collectJsonFiles(absoluteResourceDirectory);
  const resourcesByPath = new Map();
  for (const file of files) {
    const sourceBytes = new Uint8Array(await readFile(file));
    const relativePath = normalizeBundledPluginResourcePath(
      path.relative(absolutePackageRoot, file)
    );
    const parsed = parseStrictJsonDocument(sourceBytes, {
      documentKind:
        relativePath === normalizedManifestPath ? 'manifest' : 'contribution',
      diagnosticMeta: { resourcePath: relativePath },
    });
    if (!parsed.ok) {
      throw new Error(
        `${relativePath}: ${parsed.diagnostics.map((item) => item.message).join(' ')}`
      );
    }
    resourcesByPath.set(relativePath, {
      path: relativePath,
      bytes: canonicalJsonBytes(parsed.value),
      value: parsed.value,
    });
  }
  const manifestResource = resourcesByPath.get(normalizedManifestPath);
  if (!manifestResource) {
    throw new Error(`Manifest resource ${normalizedManifestPath} does not exist.`);
  }
  const manifest = structuredClone(manifestResource.value);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Plugin Manifest must be a JSON object.');
  }
  const referencedContributionResources = new Set();
  for (const contribution of manifest.contributes ?? []) {
    if (contribution?.source?.kind !== 'resource') continue;
    const resourcePath = resolveManifestResourcePath(
      normalizedManifestPath,
      contribution.source.path
    );
    const resource = resourcesByPath.get(resourcePath);
    if (!resource) {
      throw new Error(
        `Contribution ${contribution.id ?? '<unknown>'} references missing resource ${resourcePath}.`
      );
    }
    if (referencedContributionResources.has(resourcePath)) {
      throw new Error(`Contribution resource ${resourcePath} is referenced more than once.`);
    }
    referencedContributionResources.add(resourcePath);
    const integrity = await digestService.digestSha256(
      resource.bytes,
      new AbortController().signal
    );
    if (check && contribution.source.integrity !== integrity) {
      throw new Error(
        `Contribution resource ${resourcePath} integrity is stale. Regenerate the bundled plugin artifact.`
      );
    }
    contribution.source.integrity = integrity;
  }
  const contributionDirectory = `${dirname(normalizedManifestPath)}/contributions/`;
  const unreferenced = [...resourcesByPath.keys()].filter(
    (resourcePath) =>
      resourcePath.startsWith(contributionDirectory) &&
      !referencedContributionResources.has(resourcePath)
  );
  if (unreferenced.length > 0) {
    throw new Error(
      `Contribution resource ${unreferenced[0]} is not declared by the Manifest.`
    );
  }
  const validation = validatePluginManifest(manifest);
  if (!validation.ok) {
    throw new Error(
      `Plugin Manifest is invalid: ${validation.diagnostics
        .map((item) => item.message)
        .join(' ')}`
    );
  }
  const normalizedSupportMatrixPath = normalizeBundledPluginResourcePath(
    supportMatrixPath
  );
  const supportMatrixResource = resourcesByPath.get(
    normalizedSupportMatrixPath
  );
  let catalog;
  if (supportMatrixResource) {
    const packageJson = JSON.parse(
      await readFile(path.join(absolutePackageRoot, 'package.json'), 'utf8')
    );
    const matrix = validateOfficialSupportMatrixShape(
      supportMatrixResource.value
    );
    const descriptorEntries = descriptorEntriesFromManifest(
      manifest,
      normalizedManifestPath,
      resourcesByPath
    );
    validateOfficialComponentClosure({
      manifest,
      packageJson,
      matrix,
      entries: descriptorEntries,
    });
    catalog = createGeneratedCatalog(manifest, matrix);
  }
  const canonicalManifestBytes = canonicalJsonBytes(manifest);
  manifestResource.bytes = canonicalManifestBytes;
  manifestResource.value = manifest;
  if (!check) {
    const manifestSource = await formatGeneratedSource(
      decoder.decode(canonicalManifestBytes),
      'json',
      absolutePackageRoot
    );
    await writeFile(
      path.join(absolutePackageRoot, normalizedManifestPath),
      manifestSource,
      'utf8'
    );
  }
  const resources = [...resourcesByPath.values()];
  resources.sort((left, right) => left.path.localeCompare(right.path));
  const packageDigest = await computeBundledPluginPackageDigest(resources);
  const artifact = {
    schemaVersion: '1.0',
    manifestPath: normalizedManifestPath,
    packageDigest,
    resources: resources.map((resource) => ({
      path: resource.path,
      bytes: [...resource.bytes],
    })),
  };
  const output = await formatGeneratedSource(
    toTypeScript(artifact),
    'typescript',
    absolutePackageRoot
  );
  const absoluteOutput = path.resolve(absolutePackageRoot, outputFile);
  if (check) {
    const current = await readFile(absoluteOutput, 'utf8').catch(() => undefined);
    if (current !== output) {
      throw new Error(
        `${path.relative(process.cwd(), absoluteOutput)} is stale. Regenerate the bundled plugin artifact.`
      );
    }
  } else {
    await writeFile(absoluteOutput, output, 'utf8');
  }
  let absoluteCatalogOutput;
  if (catalog) {
    const catalogOutput = await formatGeneratedSource(
      toCatalogTypeScript(catalog),
      'typescript',
      absolutePackageRoot
    );
    absoluteCatalogOutput = path.resolve(
      absolutePackageRoot,
      catalogOutputFile
    );
    if (check) {
      const current = await readFile(absoluteCatalogOutput, 'utf8').catch(
        () => undefined
      );
      if (current !== catalogOutput) {
        throw new Error(
          `${path.relative(process.cwd(), absoluteCatalogOutput)} is stale. Regenerate the bundled plugin catalog.`
        );
      }
    } else {
      await writeFile(absoluteCatalogOutput, catalogOutput, 'utf8');
    }
  }
  return Object.freeze({
    artifact,
    outputFile: absoluteOutput,
    ...(absoluteCatalogOutput
      ? { catalog, catalogOutputFile: absoluteCatalogOutput }
      : {}),
  });
};

const parseArguments = (arguments_) => {
  const options = { check: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--check') {
      options.check = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    if (argument === '--package-root') options.packageRoot = value;
    else if (argument === '--resource-directory') options.resourceDirectory = value;
    else if (argument === '--manifest-path') options.manifestPath = value;
    else if (argument === '--output') options.outputFile = value;
    else if (argument === '--support-matrix') options.supportMatrixPath = value;
    else if (argument === '--catalog-output') options.catalogOutputFile = value;
    else throw new Error(`Unknown argument ${argument}.`);
    index += 1;
  }
  if (!options.packageRoot) throw new Error('--package-root is required.');
  return options;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await generateBundledPluginArtifact(
    parseArguments(process.argv.slice(2))
  );
  process.stdout.write(
    `${result.artifact.packageDigest} ${path.relative(process.cwd(), result.outputFile)}` +
      `${result.catalogOutputFile ? ` ${path.relative(process.cwd(), result.catalogOutputFile)}` : ''}\n`
  );
}
