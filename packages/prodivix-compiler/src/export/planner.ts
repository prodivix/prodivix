import { mergeExportDependencies } from '#src/export/dependencyPlanner';
import { exportArtifactsToProgramContribution } from '#src/export/artifactPlanner';
import {
  collectReferencedExportAssets,
  planExportAssetContributions,
} from '#src/export/assetPlanner';
import { planExportFileContributions } from '#src/export/filePlanner';
import {
  dedupeExportImportIntents,
  renderExportImportIntent,
} from '#src/export/importPlanner';
import { validateExportOriginPolicy } from '#src/export/originPolicy';
import {
  createUniqueExportPath,
  ensureFileExtension,
  getRelativeImportPath,
  joinExportPath,
  normalizeExportPath,
} from '#src/export/pathPlanner';
import { createReactViteExportPreset } from '#src/export/presets/reactVite';
import {
  createStyleImportIntents,
  planExportStyleSheets,
} from '#src/export/stylePlanner';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type {
  ExportBundle,
  ExportDeploymentSummary,
  ExportDependencySummary,
  ExportDiagnosticSummary,
  ExportFile,
  ExportFileKind,
  ExportLicenseSummary,
  ExportModule,
  ExportModuleKind,
  ExportOriginSummary,
  ExportPathRewrite,
  ExportPlannerPreset,
  ExportProgram,
  ExportReferencedAsset,
  ExportRuntimeRequirement,
  ExportImportIntent,
  ExportSourceOrigin,
  ExportSourceSummary,
  ExportSourceTraceSummary,
  PlannedExportModule,
  PlannedRuntimeModule,
  PlannedStyleSheet,
  ReserveExportPath,
} from '#src/export/types';

const languageExtensionByModuleLanguage: Record<
  ExportModule['language'],
  string
> = {
  ts: '.ts',
  tsx: '.tsx',
  js: '.js',
  jsx: '.jsx',
};

const mimeTypeByModuleLanguage: Record<ExportModule['language'], string> = {
  ts: 'text/typescript',
  tsx: 'text/typescript',
  js: 'text/javascript',
  jsx: 'text/javascript',
};

const fileKindByModuleKind: Record<ExportModule['kind'], ExportFileKind> = {
  'react-component': 'source-module',
  'react-entry': 'source-module',
  'nodegraph-runtime': 'domain-module',
  'animation-runtime': 'domain-module',
  'event-handler': 'source-module',
  adapter: 'source-module',
  'workspace-module': 'source-module',
  'runtime-helper': 'runtime-module',
  'domain-module': 'domain-module',
};

const toSafeName = (name: string) => {
  const safe = name.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  return safe || 'module';
};

const getModuleDirectory = (
  module: ExportModule,
  preset: ExportPlannerPreset
) => {
  if (module.kind === 'runtime-helper')
    return joinExportPath(preset.sourceRoot, 'runtime');
  if (module.kind === 'nodegraph-runtime') {
    return joinExportPath(preset.sourceRoot, 'logic', 'nodegraphs');
  }
  if (module.kind === 'animation-runtime') {
    return joinExportPath(preset.sourceRoot, 'animations');
  }
  if (module.kind === 'react-entry') return preset.sourceRoot;
  if (module.ownerRootId) {
    return joinExportPath(
      preset.sourceRoot,
      'components',
      toSafeName(module.ownerRootId)
    );
  }
  return preset.sourceRoot;
};

const getModuleDesiredPath = (
  module: ExportModule,
  preset: ExportPlannerPreset
) => {
  const extension = languageExtensionByModuleLanguage[module.language];
  return ensureFileExtension(
    joinExportPath(
      getModuleDirectory(module, preset),
      toSafeName(module.suggestedName)
    ),
    extension
  );
};

const summarizeSourceTraces = (
  files: ExportFile[]
): ExportSourceTraceSummary[] => {
  const byDomain = new Map<string, { count: number; files: Set<string> }>();
  files.forEach((file) => {
    file.sourceTrace.forEach((trace) => {
      const domain = trace.sourceRef.domain;
      const summary = byDomain.get(domain) ?? {
        count: 0,
        files: new Set<string>(),
      };
      summary.count += 1;
      summary.files.add(file.path);
      byDomain.set(domain, summary);
    });
  });
  return Array.from(byDomain.entries())
    .map(([domain, summary]) => ({
      domain,
      count: summary.count,
      files: Array.from(summary.files).sort((left, right) =>
        left.localeCompare(right)
      ),
    }))
    .sort((left, right) => left.domain.localeCompare(right.domain));
};

const diagnosticSeverityRank: Record<CompileDiagnostic['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const summarizeDiagnostics = (
  diagnostics: CompileDiagnostic[]
): CompileDiagnostic[] =>
  [...diagnostics].sort(
    (left, right) =>
      diagnosticSeverityRank[left.severity] -
        diagnosticSeverityRank[right.severity] ||
      left.source.localeCompare(right.source) ||
      left.code.localeCompare(right.code) ||
      left.path.localeCompare(right.path)
  );

const summarizeDiagnosticCounts = (
  diagnostics: CompileDiagnostic[]
): ExportDiagnosticSummary[] => {
  const bySeverity = new Map<CompileDiagnostic['severity'], number>();
  diagnostics.forEach((diagnostic) => {
    bySeverity.set(
      diagnostic.severity,
      (bySeverity.get(diagnostic.severity) ?? 0) + 1
    );
  });
  return Array.from(bySeverity.entries())
    .map(([severity, count]) => ({ severity, count }))
    .sort(
      (left, right) =>
        diagnosticSeverityRank[left.severity] -
        diagnosticSeverityRank[right.severity]
    );
};

const summarizeDependencies = (
  dependencies: ExportProgram['dependencies']
): ExportDependencySummary[] =>
  mergeExportDependencies(dependencies).map((dependency) => ({
    name: dependency.name,
    kind: dependency.kind ?? 'dependency',
    version: dependency.version,
    origin: dependency.origin,
  }));

const getOriginSummaryId = (origin: ExportSourceOrigin) =>
  [
    origin.kind,
    origin.owner ?? '',
    origin.packageName ?? '',
    origin.packageVersion ?? '',
    origin.url ?? '',
    origin.label ?? '',
    origin.contentHash ?? '',
  ].join(':');

const summarizeOrigins = (input: {
  files: ExportFile[];
  dependencies: ExportProgram['dependencies'];
  referencedAssets: ExportReferencedAsset[];
  sources: ExportProgram['sources'];
}): ExportOriginSummary[] => {
  const byId = new Map<string, ExportOriginSummary>();
  const ensureOrigin = (origin: ExportSourceOrigin, filePath?: string) => {
    const id = getOriginSummaryId(origin);
    const current = byId.get(id) ?? {
      id,
      kind: origin.kind,
      owner: origin.owner,
      label: origin.label,
      packageName: origin.packageName,
      packageVersion: origin.packageVersion,
      url: origin.url,
      license: origin.license,
      contentHash: origin.contentHash,
      writePolicy: origin.writePolicy,
      updatePolicy: origin.updatePolicy,
      files: [],
    };
    if (filePath && !current.files.includes(filePath)) {
      current.files.push(filePath);
    }
    byId.set(id, current);
  };

  input.files.forEach((file) => {
    if (file.origin) ensureOrigin(file.origin, file.path);
  });
  input.dependencies.forEach((dependency) => {
    if (dependency.origin) ensureOrigin(dependency.origin);
  });
  input.sources.forEach((origin) => {
    ensureOrigin(origin, origin.url ?? origin.packageName ?? origin.label);
  });
  input.referencedAssets.forEach((asset) => {
    if (asset.origin) {
      ensureOrigin(
        asset.origin,
        asset.emittedPath ??
          asset.publicPath ??
          asset.sourcePath ??
          asset.url ??
          `asset:${asset.id}`
      );
    }
  });

  return Array.from(byId.values())
    .map((origin) => ({
      ...origin,
      files: [...origin.files].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
};

const summarizeDeployments = (input: {
  deployments: ExportProgram['deployments'];
  files: ExportFile[];
}): ExportDeploymentSummary[] => {
  const emittedPathById = new Map(
    input.files
      .filter((file) => file.id)
      .map((file) => [file.id as string, file.path])
  );
  return input.deployments
    .map((deployment) => ({
      id: deployment.id,
      target: deployment.target,
      files: deployment.files
        .map((file) => emittedPathById.get(file.id) ?? file.desiredPath)
        .sort((left, right) => left.localeCompare(right)),
      dependencies: summarizeDependencies(deployment.dependencies ?? []),
      metadata: deployment.metadata,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
};

const summarizeLicenses = (
  origins: ExportOriginSummary[]
): ExportLicenseSummary[] => {
  const byLicense = new Map<string, ExportOriginSummary[]>();
  origins.forEach((origin) => {
    const license = origin.license?.trim() || 'UNSPECIFIED';
    byLicense.set(license, [...(byLicense.get(license) ?? []), origin]);
  });
  return Array.from(byLicense.entries())
    .map(([license, licenseOrigins]) => ({
      license,
      origins: licenseOrigins.sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
    }))
    .sort((left, right) => left.license.localeCompare(right.license));
};

const getSourceSummaryId = (origin: ExportOriginSummary) =>
  [
    origin.kind,
    origin.owner ?? '',
    origin.packageName ?? '',
    origin.packageVersion ?? '',
    origin.url ?? '',
    origin.license ?? '',
  ].join(':');

const summarizeSources = (
  origins: ExportOriginSummary[]
): ExportSourceSummary[] => {
  const byId = new Map<string, ExportSourceSummary>();
  origins.forEach((origin) => {
    const id = getSourceSummaryId(origin);
    const current = byId.get(id) ?? {
      kind: origin.kind,
      owner: origin.owner,
      packageName: origin.packageName,
      packageVersion: origin.packageVersion,
      url: origin.url,
      license: origin.license,
      count: 0,
      files: [],
    };
    current.count += 1;
    origin.files.forEach((file) => {
      if (!current.files.includes(file)) current.files.push(file);
    });
    byId.set(id, current);
  });
  return Array.from(byId.values())
    .map((source) => ({
      ...source,
      files: source.files.sort((left, right) => left.localeCompare(right)),
    }))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        (left.packageName ?? '').localeCompare(right.packageName ?? '') ||
        (left.url ?? '').localeCompare(right.url ?? '') ||
        (left.owner ?? '').localeCompare(right.owner ?? '')
    );
};

const encodeUtf8 = (value: string): number[] => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      index + 1 < value.length
    ) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
};

const hashExportFileContents = (contents: ExportFile['contents']) => {
  const bytes = typeof contents === 'string' ? encodeUtf8(contents) : contents;
  let hash = 0x811c9dc5;
  bytes.forEach((byte) => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  });
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const withContentHash = (file: ExportFile): ExportFile => {
  const contentHash = hashExportFileContents(file.contents);
  return {
    ...file,
    contentHash,
    origin: file.origin
      ? {
          ...file.origin,
          contentHash: file.origin.contentHash ?? contentHash,
        }
      : file.origin,
  };
};

const createExportManifestFile = (input: {
  program: ExportProgram;
  entryFilePath?: string;
  files: ExportFile[];
  dependencies: ExportProgram['dependencies'];
  pathRewrites: ExportPathRewrite[];
  origins: ExportOriginSummary[];
  licenses: ExportLicenseSummary[];
  sources: ExportSourceSummary[];
  deployments: ExportDeploymentSummary[];
  referencedAssets: ExportReferencedAsset[];
  diagnostics: CompileDiagnostic[];
  reservePath: ReserveExportPath;
}): ExportFile => {
  const path = input.reservePath(
    joinExportPath('.prodivix', 'export-manifest.json'),
    {
      id: 'export-manifest:prodivix',
      kind: 'metadata',
    }
  );
  return {
    id: 'export-manifest:prodivix',
    path,
    kind: 'metadata',
    language: 'json',
    mimeType: 'application/json',
    importMode: 'copy-only',
    contents: `${JSON.stringify(
      {
        target: input.program.target,
        entryFilePath: input.entryFilePath,
        roots: input.program.roots,
        files: input.files.map((file) => ({
          id: file.id,
          path: file.path,
          kind: file.kind,
          language: file.language,
          mimeType: file.mimeType,
          importMode: file.importMode,
          contentHash: file.contentHash,
          origin: file.origin,
          sourceTrace: file.sourceTrace,
        })),
        dependencies: summarizeDependencies(input.dependencies),
        pathRewrites: input.pathRewrites,
        referencedAssets: input.referencedAssets,
        origins: input.origins,
        sources: input.sources,
        licenses: input.licenses,
        deployments: input.deployments,
        diagnostics: summarizeDiagnostics(input.diagnostics),
      },
      null,
      2
    )}\n`,
    sourceTrace: [
      {
        sourceRef: {
          domain: 'export',
          id: 'export-manifest',
          path,
        },
      },
    ],
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
};

const createPolicyMetadataFile = (input: {
  id: string;
  path: string;
  contents: unknown;
  reservePath: ReserveExportPath;
}): ExportFile => {
  const path = input.reservePath(input.path, {
    id: input.id,
    kind: 'metadata',
  });
  return {
    id: input.id,
    path,
    kind: 'metadata',
    language: 'json',
    mimeType: 'application/json',
    importMode: 'copy-only',
    contents: `${JSON.stringify(input.contents, null, 2)}\n`,
    sourceTrace: [
      {
        sourceRef: {
          domain: 'export',
          id: input.id,
          path,
        },
      },
    ],
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
};

export class ProductionExportPlanner {
  readonly preset: ExportPlannerPreset;

  constructor(preset: ExportPlannerPreset = createReactViteExportPreset()) {
    this.preset = preset;
  }

  plan(program: ExportProgram): ExportBundle {
    const usedPaths = new Set<string>();
    const pathRewrites: ExportPathRewrite[] = [];
    const reservePath: ReserveExportPath = (desiredPath, source) =>
      this.reservePath(desiredPath, usedPaths, pathRewrites, source);
    const artifactContribution = exportArtifactsToProgramContribution(
      program.artifacts
    );
    const programStyles = [
      ...program.styles,
      ...(artifactContribution.styles ?? []),
    ];
    const programAssets = [
      ...program.assets,
      ...(artifactContribution.assets ?? []),
    ];
    const programFiles = [
      ...program.files,
      ...(artifactContribution.files ?? []),
    ];
    const runtimeModules = this.resolveRuntimeModules(
      program.runtimeRequirements
    );
    const plannedDomainModules = program.modules.map((module) =>
      this.planModule(module, reservePath)
    );
    const plannedRuntimeModules = runtimeModules.map((item) => ({
      ...this.planModule(
        {
          ...item.module,
          sourceTrace: item.requirements.flatMap(
            (requirement) => requirement.sourceTrace
          ),
        },
        reservePath
      ),
      requirements: item.requirements,
    }));
    const plannedModules = this.attachRuntimeImports(
      plannedDomainModules,
      plannedRuntimeModules
    );
    const allPlannedModules = [...plannedModules, ...plannedRuntimeModules];
    const plannedStyleSheets = planExportStyleSheets(
      programStyles,
      allPlannedModules,
      this.preset,
      reservePath
    );
    const modulesWithStyleImports = this.attachStyleImports(
      allPlannedModules,
      plannedStyleSheets
    );
    const deploymentFiles = program.deployments.flatMap(
      (deployment) => deployment.files
    );
    const deploymentDependencies = program.deployments.flatMap(
      (deployment) => deployment.dependencies ?? []
    );
    const allDependencies = mergeExportDependencies([
      ...program.dependencies,
      ...deploymentDependencies,
    ]);
    const originPolicyDiagnostics = validateExportOriginPolicy({
      ...program,
      styles: programStyles,
      assets: programAssets,
      files: programFiles,
    });
    const diagnostics = [
      ...program.diagnostics,
      ...originPolicyDiagnostics,
      ...program.deployments.flatMap(
        (deployment) => deployment.diagnostics ?? []
      ),
    ];
    const plannedAssets = planExportAssetContributions(
      programAssets,
      this.preset,
      reservePath
    );
    const referencedAssets = collectReferencedExportAssets(
      programAssets,
      plannedAssets
    );
    const filesWithoutPolicyMetadata = [
      ...planExportFileContributions(
        [...programFiles, ...deploymentFiles],
        this.preset,
        reservePath
      ),
      ...modulesWithStyleImports.map((module) => this.moduleToFile(module)),
      ...plannedStyleSheets.map((styleSheet) =>
        this.styleSheetToFile(styleSheet)
      ),
      ...plannedAssets,
    ].map(withContentHash);
    const deploymentSummary = summarizeDeployments({
      deployments: program.deployments,
      files: filesWithoutPolicyMetadata,
    });
    const origins = summarizeOrigins({
      files: filesWithoutPolicyMetadata,
      dependencies: allDependencies,
      referencedAssets,
      sources: program.sources,
    });
    const sources = summarizeSources(origins);
    const licenses = summarizeLicenses(origins);
    const entryModuleFilePath = modulesWithStyleImports.find(
      (module) => module.id === program.entryModuleId
    )?.filePath;
    const entryFilePath =
      program.entryFilePath ??
      entryModuleFilePath ??
      modulesWithStyleImports[0]?.filePath;
    const originsFile = createPolicyMetadataFile({
      id: 'export-origins:prodivix',
      path: joinExportPath('.prodivix', 'origins.json'),
      contents: origins,
      reservePath,
    });
    const licensesFile = createPolicyMetadataFile({
      id: 'export-licenses:prodivix',
      path: joinExportPath('.prodivix', 'licenses.json'),
      contents: licenses,
      reservePath,
    });
    const manifestFile = createExportManifestFile({
      program,
      entryFilePath,
      files: filesWithoutPolicyMetadata,
      dependencies: allDependencies,
      pathRewrites,
      origins,
      sources,
      licenses,
      deployments: deploymentSummary,
      referencedAssets,
      diagnostics,
      reservePath,
    });
    const files = [
      ...filesWithoutPolicyMetadata,
      withContentHash(originsFile),
      withContentHash(licensesFile),
      withContentHash(manifestFile),
    ];

    return {
      target: program.target,
      entryFilePath,
      files,
      dependencies: allDependencies,
      diagnostics,
      metadata: {
        ...program.metadata,
        fileCount: files.length,
        sourceTraceCount: files.reduce(
          (count, file) => count + file.sourceTrace.length,
          0
        ),
        sourceTraceSummary: summarizeSourceTraces(files),
        sourceSummary: sources,
        dependencySummary: summarizeDependencies(allDependencies),
        diagnosticSummary: summarizeDiagnosticCounts(
          diagnostics.filter((diagnostic) => diagnostic.source !== 'export')
        ),
        originSummary: origins,
        licenseSummary: licenses,
        deploymentSummary,
        pathRewrites,
        referencedAssets,
      },
    };
  }

  private planModule(
    module: ExportModule,
    reservePath: ReserveExportPath
  ): PlannedExportModule {
    const filePath = reservePath(getModuleDesiredPath(module, this.preset), {
      id: module.id,
      kind: module.kind,
    });
    const renderedImports = dedupeExportImportIntents(module.imports).map(
      renderExportImportIntent
    );
    return {
      ...module,
      filePath,
      renderedImports,
    };
  }

  private reservePath(
    desiredPath: string,
    usedPaths: Set<string>,
    pathRewrites: ExportPathRewrite[],
    source?: {
      id?: string;
      kind?: ExportFileKind | ExportModuleKind | 'style' | 'asset';
    }
  ) {
    const normalizedPath = normalizeExportPath(desiredPath);
    const emittedPath = createUniqueExportPath(desiredPath, usedPaths);
    if (emittedPath !== desiredPath) {
      pathRewrites.push({
        requestedPath: desiredPath,
        emittedPath,
        reason: emittedPath === normalizedPath ? 'normalization' : 'conflict',
        sourceId: source?.id,
        sourceKind: source?.kind,
      });
    }
    return emittedPath;
  }

  private resolveRuntimeModules(
    requirements: ExportRuntimeRequirement[]
  ): Array<{ requirements: ExportRuntimeRequirement[]; module: ExportModule }> {
    const modulesById = new Map<
      string,
      { requirements: ExportRuntimeRequirement[]; module: ExportModule }
    >();
    requirements.forEach((requirement) => {
      const factory = this.preset.runtimeModuleFactories?.[requirement.kind];
      const module = factory?.(requirement);
      if (module) {
        const existing = modulesById.get(module.id);
        if (existing) {
          existing.requirements.push(requirement);
          return;
        }
        modulesById.set(module.id, { requirements: [requirement], module });
      }
    });
    return Array.from(modulesById.values());
  }

  private attachRuntimeImports(
    modules: PlannedExportModule[],
    runtimeModules: PlannedRuntimeModule[]
  ): PlannedExportModule[] {
    if (runtimeModules.length === 0) return modules;
    return modules.map((module) => {
      const runtimeImports = runtimeModules
        .flatMap((runtimeModule) =>
          runtimeModule.requirements.map((requirement) => ({
            requirement,
            runtimeModule,
          }))
        )
        .map(({ requirement, runtimeModule }): ExportImportIntent | null => {
          const importName = requirement.importName;
          if (requirement.ownerModuleId !== module.id || !importName) {
            return null;
          }
          return {
            kind: requirement.importKind ?? 'named',
            imported: importName,
            local: importName,
            source: getRelativeImportPath(
              module.filePath,
              runtimeModule.filePath
            ),
          };
        })
        .filter(
          (runtimeImport): runtimeImport is ExportImportIntent =>
            runtimeImport !== null
        );
      if (runtimeImports.length === 0) return module;
      return {
        ...module,
        imports: dedupeExportImportIntents([
          ...module.imports,
          ...runtimeImports,
        ]),
        renderedImports: dedupeExportImportIntents([
          ...module.imports,
          ...runtimeImports,
        ]).map(renderExportImportIntent),
      };
    });
  }

  private attachStyleImports(
    modules: PlannedExportModule[],
    styleSheets: PlannedStyleSheet[]
  ): PlannedExportModule[] {
    if (styleSheets.length === 0) return modules;
    const firstModuleId = modules[0]?.id;
    return modules.map((module) => {
      const styleImports = createStyleImportIntents(
        module,
        styleSheets,
        firstModuleId
      );
      if (styleImports.length === 0) return module;
      return {
        ...module,
        renderedImports: dedupeExportImportIntents([
          ...module.imports,
          ...styleImports,
        ]).map(renderExportImportIntent),
      };
    });
  }

  private moduleToFile(module: PlannedExportModule): ExportFile {
    const imports = module.renderedImports.join('\n');
    const contents = imports ? `${imports}\n\n${module.body}` : module.body;
    return {
      id: module.id,
      path: module.filePath,
      kind: fileKindByModuleKind[module.kind],
      language: module.language,
      mimeType: mimeTypeByModuleLanguage[module.language],
      importMode: 'module',
      contents,
      sourceTrace: module.sourceTrace,
      origin: module.origin,
    };
  }

  private styleSheetToFile(styleSheet: PlannedStyleSheet): ExportFile {
    return {
      id: styleSheet.id,
      path: styleSheet.path,
      kind: 'stylesheet',
      language: 'css',
      mimeType: 'text/css',
      importMode: 'side-effect',
      contents: styleSheet.cssText,
      sourceTrace: styleSheet.sourceTrace,
      origin: styleSheet.origin,
    };
  }
}
