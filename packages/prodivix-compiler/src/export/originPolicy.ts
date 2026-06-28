import type { CompileDiagnostic } from '#src/core/diagnostics';
import type {
  ExportAssetContribution,
  ExportDependency,
  ExportFileContribution,
  ExportModule,
  ExportProgram,
  ExportSourceOrigin,
  ExportStyleContribution,
} from '#src/export/types';

type OriginPolicySubject = {
  id: string;
  path: string;
  origin?: ExportSourceOrigin;
  canReceivePlannerHash?: boolean;
};

const createOriginDiagnostic = (
  subject: OriginPolicySubject,
  code: string,
  message: string,
  suggestion: string
): CompileDiagnostic => ({
  code,
  severity: 'warning',
  source: 'export',
  message,
  path: subject.path,
  suggestion,
});

const hasThirdPartyIdentity = (origin: ExportSourceOrigin) =>
  Boolean(origin.packageName || origin.url || origin.label);

const validateOrigin = (subject: OriginPolicySubject): CompileDiagnostic[] => {
  const origin = subject.origin;
  if (!origin) {
    return [
      createOriginDiagnostic(
        subject,
        'export.origin.missing',
        `Export contribution "${subject.id}" is missing origin metadata.`,
        'Attach an ExportSourceOrigin so the exported project can be audited.'
      ),
    ];
  }

  const diagnostics: CompileDiagnostic[] = [];
  if (origin.kind !== 'generated' && !origin.owner) {
    diagnostics.push(
      createOriginDiagnostic(
        subject,
        'export.origin.owner-missing',
        `Export contribution "${subject.id}" does not declare an origin owner.`,
        'Set owner to workspace, plugin, third-party, or prodivix.'
      )
    );
  }

  if (!origin.writePolicy) {
    diagnostics.push(
      createOriginDiagnostic(
        subject,
        'export.origin.write-policy-missing',
        `Export contribution "${subject.id}" does not declare a write policy.`,
        'Set writePolicy to generated, preserve-user-edits, copy, or reference-only.'
      )
    );
  }

  if (!origin.updatePolicy) {
    diagnostics.push(
      createOriginDiagnostic(
        subject,
        'export.origin.update-policy-missing',
        `Export contribution "${subject.id}" does not declare an update policy.`,
        'Set updatePolicy to regenerate, pin, manual, or follow-package.'
      )
    );
  }

  if (
    (origin.kind === 'external-package' || origin.kind === 'remote-url') &&
    !hasThirdPartyIdentity(origin)
  ) {
    diagnostics.push(
      createOriginDiagnostic(
        subject,
        'export.origin.identity-missing',
        `Third-party export contribution "${subject.id}" does not declare a package, URL, or label.`,
        'Record packageName, url, or label for third-party origin tracking.'
      )
    );
  }

  if (
    (origin.kind === 'external-package' ||
      origin.kind === 'remote-url' ||
      origin.kind === 'vendored') &&
    !origin.license
  ) {
    diagnostics.push(
      createOriginDiagnostic(
        subject,
        'export.origin.license-missing',
        `Third-party export contribution "${subject.id}" does not declare a license.`,
        'Record the known license or explicitly surface it as UNSPECIFIED in review UI.'
      )
    );
  }

  if (
    origin.kind === 'vendored' &&
    !subject.canReceivePlannerHash &&
    !origin.contentHash
  ) {
    diagnostics.push(
      createOriginDiagnostic(
        subject,
        'export.origin.hash-missing',
        `Vendored export contribution "${subject.id}" does not declare a content hash.`,
        'Provide contentHash for vendored sources that are referenced instead of emitted as files.'
      )
    );
  }

  return diagnostics;
};

const fileContributionToSubject = (
  file: ExportFileContribution
): OriginPolicySubject => ({
  id: file.id,
  path: file.desiredPath,
  origin: file.origin,
  canReceivePlannerHash: true,
});

const assetContributionToSubject = (
  asset: ExportAssetContribution
): OriginPolicySubject => ({
  id: asset.id,
  path: asset.publicPath ?? asset.sourcePath ?? asset.suggestedName,
  origin: asset.origin,
  canReceivePlannerHash: asset.contents !== undefined,
});

const moduleToSubject = (module: ExportModule): OriginPolicySubject => ({
  id: module.id,
  path: module.suggestedName,
  origin: module.origin,
  canReceivePlannerHash: true,
});

const styleContributionToSubject = (
  style: ExportStyleContribution
): OriginPolicySubject => ({
  id: style.id,
  path: style.suggestedName ?? style.id,
  origin: style.origin,
  canReceivePlannerHash: true,
});

const dependencyToSubject = (
  dependency: ExportDependency
): OriginPolicySubject => ({
  id: `dependency:${dependency.name}`,
  path: `package:${dependency.name}`,
  origin: dependency.origin,
});

export const validateExportOriginPolicy = (
  program: ExportProgram
): CompileDiagnostic[] => [
  ...program.modules.flatMap(moduleToSubject).flatMap(validateOrigin),
  ...program.styles.flatMap(styleContributionToSubject).flatMap(validateOrigin),
  ...program.files.flatMap(fileContributionToSubject).flatMap(validateOrigin),
  ...program.deployments
    .flatMap((deployment) => deployment.files)
    .flatMap(fileContributionToSubject)
    .flatMap(validateOrigin),
  ...program.assets.flatMap(assetContributionToSubject).flatMap(validateOrigin),
  ...program.dependencies.flatMap(dependencyToSubject).flatMap(validateOrigin),
  ...program.deployments
    .flatMap((deployment) => deployment.dependencies ?? [])
    .flatMap(dependencyToSubject)
    .flatMap(validateOrigin),
];
