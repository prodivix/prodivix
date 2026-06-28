import { mergeExportDependencies } from '#src/export/dependencyPlanner';
import type {
  ExportProgram,
  ExportProgramContribution,
  ExportProgramMetadata,
  ExportRuntimeRequirement,
  ExportTarget,
} from '#src/export/types';

const mergeMetadata = (
  left: ExportProgramMetadata | undefined,
  right: ExportProgramMetadata | undefined
): ExportProgramMetadata | undefined => {
  if (!left) return right;
  if (!right) return left;
  return {
    ...left,
    ...right,
  };
};

const mergeById = <T extends { id: string }>(items: T[]): T[] =>
  Array.from(new Map(items.map((item) => [item.id, item])).values());

const mergeRuntimeRequirementsById = (
  requirements: ExportRuntimeRequirement[]
): ExportRuntimeRequirement[] => {
  const byId = new Map<string, ExportRuntimeRequirement>();
  requirements.forEach((requirement) => {
    const existing = byId.get(requirement.id);
    if (!existing) {
      byId.set(requirement.id, requirement);
      return;
    }
    byId.set(requirement.id, {
      ...existing,
      ...requirement,
      sourceTrace: [...existing.sourceTrace, ...requirement.sourceTrace],
    });
  });
  return Array.from(byId.values());
};

export class ExportProgramBuilder {
  private readonly target: ExportTarget;
  private program: ExportProgram;

  constructor(target: ExportTarget) {
    this.target = target;
    this.program = {
      target,
      entryModuleId: undefined,
      entryFilePath: undefined,
      roots: [],
      modules: [],
      styles: [],
      assets: [],
      artifacts: [],
      files: [],
      sources: [],
      deployments: [],
      runtimeRequirements: [],
      dependencies: [],
      diagnostics: [],
    };
  }

  addContribution(contribution: ExportProgramContribution): this {
    this.program = {
      target: this.target,
      entryModuleId: contribution.entryModuleId ?? this.program.entryModuleId,
      entryFilePath: contribution.entryFilePath ?? this.program.entryFilePath,
      roots: mergeById([...this.program.roots, ...(contribution.roots ?? [])]),
      modules: [...this.program.modules, ...(contribution.modules ?? [])],
      styles: [...this.program.styles, ...(contribution.styles ?? [])],
      assets: [...this.program.assets, ...(contribution.assets ?? [])],
      artifacts: [...this.program.artifacts, ...(contribution.artifacts ?? [])],
      files: [...this.program.files, ...(contribution.files ?? [])],
      sources: [...this.program.sources, ...(contribution.sources ?? [])],
      deployments: [
        ...this.program.deployments,
        ...(contribution.deployments ?? []),
      ],
      runtimeRequirements: mergeRuntimeRequirementsById([
        ...this.program.runtimeRequirements,
        ...(contribution.runtimeRequirements ?? []),
      ]),
      dependencies: mergeExportDependencies([
        ...this.program.dependencies,
        ...(contribution.dependencies ?? []),
      ]),
      diagnostics: [
        ...this.program.diagnostics,
        ...(contribution.diagnostics ?? []),
      ],
      metadata: mergeMetadata(this.program.metadata, contribution.metadata),
    };
    return this;
  }

  build(): ExportProgram {
    return {
      ...this.program,
      roots: [...this.program.roots],
      modules: [...this.program.modules],
      styles: [...this.program.styles],
      assets: [...this.program.assets],
      artifacts: [...this.program.artifacts],
      files: [...this.program.files],
      sources: [...this.program.sources],
      deployments: [...this.program.deployments],
      runtimeRequirements: [...this.program.runtimeRequirements],
      dependencies: [...this.program.dependencies],
      diagnostics: [...this.program.diagnostics],
      metadata: this.program.metadata
        ? { ...this.program.metadata }
        : undefined,
    };
  }
}

export const createExportProgramBuilder = (target: ExportTarget) =>
  new ExportProgramBuilder(target);
