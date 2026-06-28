import {
  ProductionExportPlanner,
  createExportProgramBuilder,
  createReactViteExportPreset,
  mergeExportDependencies,
  REACT_VITE_DEPENDENCIES,
  REACT_VITE_DEV_DEPENDENCIES,
  REACT_VITE_PACKAGE_MANAGER,
  createExportPackageOrigin,
  type ExportDependency,
  type ExportModule,
  type ExportPlannerPreset,
  type ExportProgram,
  type ExportProgramContribution,
  type ExportRootKind,
} from '#src/export';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type {
  ReactComponentCompileResult,
  ReactExportBundle,
} from '#src/react/types';

export const REACT_PROJECT_SCAFFOLD_PRESET = {
  packageManager: REACT_VITE_PACKAGE_MANAGER,
  dependencies: REACT_VITE_DEPENDENCIES,
  devDependencies: REACT_VITE_DEV_DEPENDENCIES,
} as const;

export const REACT_PRODIVIX_PACKAGE_VERSIONS = {
  '@prodivix/shared': '0.1.2',
  '@prodivix/themes': '0.0.3',
  '@prodivix/ui': '0.1.2',
} as const;

const recordToDependencies = (
  dependencies: Record<string, string>,
  origins: ReactComponentCompileResult['dependencyOrigins'] = {}
): ExportDependency[] =>
  Object.entries(dependencies).map(([name, version]) => ({
    name,
    version,
    kind: 'dependency',
    origin:
      origins[name] ??
      createExportPackageOrigin(name, version, {
        updatePolicy: 'pin',
      }),
  }));

const createReactProgram = (
  compiled: ReactComponentCompileResult,
  module: ExportModule,
  dependencies: ExportDependency[],
  preset: ExportPlannerPreset,
  options: {
    includeScaffold: boolean;
    rootKind: ExportRootKind;
    rootId?: string;
  }
): ExportProgram => {
  const rootId = options.rootId ?? 'app';
  const contributionDependencies = compiled.exportContributions.flatMap(
    (contribution) => contribution.dependencies ?? []
  );
  const programDependencies = mergeExportDependencies([
    ...dependencies,
    ...contributionDependencies,
  ]);
  const scaffoldContributions = options.includeScaffold
    ? (preset.createScaffoldContributions?.({
        projectName: compiled.componentName,
        packageManager: REACT_PROJECT_SCAFFOLD_PRESET.packageManager,
        dependencies: programDependencies,
        entryModuleId: module.id,
      }) ?? [])
    : [];
  return [
    ...scaffoldContributions,
    ...compiled.exportContributions,
    {
      entryModuleId: module.id,
      roots: [
        {
          id: rootId,
          kind: options.rootKind,
          displayName: compiled.componentName,
          sourceRef: compiled.sourceTrace[0].sourceRef,
        },
      ],
      modules: [module],
      styles: compiled.styles,
      artifacts: compiled.artifacts,
      runtimeRequirements: compiled.runtimeRequirements,
      dependencies: programDependencies,
      diagnostics: compiled.diagnostics,
    },
  ]
    .reduce(
      (builder, contribution) => builder.addContribution(contribution),
      createExportProgramBuilder(preset.target)
    )
    .build();
};

const createProjectDependencies = (
  compiled: ReactComponentCompileResult
): ExportDependency[] =>
  mergeExportDependencies([
    ...recordToDependencies(compiled.dependencies, compiled.dependencyOrigins),
    ...recordToDependencies(REACT_PROJECT_SCAFFOLD_PRESET.dependencies),
    ...Object.entries(REACT_PROJECT_SCAFFOLD_PRESET.devDependencies).map(
      ([name, version]) => ({
        name,
        version,
        kind: 'devDependency' as const,
        origin: createExportPackageOrigin(name, version, {
          updatePolicy: 'pin',
        }),
      })
    ),
  ]);

export const createProjectReactBundle = (
  compiled: ReactComponentCompileResult
): ReactExportBundle => {
  const preset = createReactViteExportPreset();
  const dependencies = createProjectDependencies(compiled);
  const appModule: ExportModule = {
    ...compiled.module,
    kind: 'react-entry',
    ownerRootId: 'app',
    suggestedName: 'App',
  };
  const planned = new ProductionExportPlanner(preset).plan(
    createReactProgram(compiled, appModule, dependencies, preset, {
      includeScaffold: true,
      rootKind: 'app',
    })
  );

  return {
    type: 'project',
    target: planned.target,
    entryFilePath: planned.entryFilePath ?? 'src/App.tsx',
    files: planned.files,
    dependencies: planned.dependencies,
    diagnostics: planned.diagnostics,
    metadata: planned.metadata,
  };
};

export const createSingleFileBundle = (
  compiled: ReactComponentCompileResult,
  type: Exclude<ReactExportBundle['type'], 'project'>
): ReactExportBundle => {
  const preset: ExportPlannerPreset = {
    ...createReactViteExportPreset(),
    id: `react-${type}`,
    sourceRoot: '',
  };
  const dependencies = mergeExportDependencies(
    recordToDependencies(compiled.dependencies)
  );
  const module: ExportModule = {
    ...compiled.module,
    ownerRootId: type,
    suggestedName: compiled.componentName,
  };
  const styles = compiled.styles.map((style) => ({
    ...style,
    ownerRootId: type,
    suggestedName: compiled.componentName,
  }));
  const planned = new ProductionExportPlanner(preset).plan({
    ...createReactProgram(compiled, module, dependencies, preset, {
      includeScaffold: false,
      rootKind: type,
      rootId: type,
    }),
    styles,
  });

  return {
    type,
    target: planned.target,
    entryFilePath: planned.entryFilePath ?? `${compiled.componentName}.tsx`,
    files: planned.files,
    dependencies: planned.dependencies,
    diagnostics: planned.diagnostics,
    metadata: planned.metadata,
  };
};

export const createContributionBundle = (
  contributions: ExportProgramContribution[],
  type: Exclude<
    ReactExportBundle['type'],
    'project' | 'component' | 'page' | 'route'
  >,
  fallbackEntryFilePath: string
): ReactExportBundle => {
  const preset: ExportPlannerPreset = {
    ...createReactViteExportPreset(),
    id: `react-${type}`,
    sourceRoot: '',
  };
  const hasDomainOutput = contributions.some(
    (contribution) =>
      Boolean(contribution.modules?.length) ||
      Boolean(contribution.files?.length) ||
      Boolean(contribution.artifacts?.length) ||
      Boolean(
        contribution.assets?.some((asset) => asset.contents !== undefined)
      )
  );
  const emptyDiagnostics: CompileDiagnostic[] = hasDomainOutput
    ? []
    : [
        {
          code: `export.${type}.empty`,
          severity: 'warning',
          source: 'codegen',
          message: `No ${type} resources are available for export.`,
          path: `/${type}`,
        },
      ];
  const program = contributions
    .reduce(
      (builder, contribution) => builder.addContribution(contribution),
      createExportProgramBuilder(preset.target)
    )
    .addContribution({
      diagnostics: emptyDiagnostics,
      metadata: {
        exportRootKind: type,
      },
    })
    .build();
  const planned = new ProductionExportPlanner(preset).plan(program);

  return {
    type,
    target: planned.target,
    entryFilePath: planned.entryFilePath ?? fallbackEntryFilePath,
    files: planned.files,
    dependencies: planned.dependencies,
    diagnostics: planned.diagnostics,
    metadata: planned.metadata,
  };
};
