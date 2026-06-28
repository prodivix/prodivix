import type {
  ExportAssetDeliveryPolicy,
  ExportSourceOrigin,
  ExportSourceOwner,
  ExportUpdatePolicy,
  ExportWritePolicy,
} from '#src/export/types';

export type ExportSourceResolverKind =
  | 'package'
  | 'esm-sh'
  | 'remote-url'
  | 'vendored'
  | 'plugin'
  | 'workspace-document'
  | 'generated';

export type ExportSourceResolverInput = {
  kind: ExportSourceResolverKind;
  label?: string;
  packageName?: string;
  packageVersion?: string;
  url?: string;
  license?: string;
  contentHash?: string;
  owner?: ExportSourceOwner;
  writePolicy?: ExportWritePolicy;
  updatePolicy?: ExportUpdatePolicy;
  deliveryPolicy?: ExportAssetDeliveryPolicy;
};

export type ExportResolvedSource = {
  origin: ExportSourceOrigin;
  deliveryPolicy?: ExportAssetDeliveryPolicy;
};

const getDefaultOwner = (
  kind: ExportSourceResolverKind,
  packageName?: string
): ExportSourceOwner => {
  if (kind === 'generated') return 'prodivix';
  if (kind === 'workspace-document') return 'workspace';
  if (kind === 'plugin') return 'plugin';
  if (packageName?.startsWith('@prodivix/')) return 'prodivix';
  return 'third-party';
};

const getDefaultWritePolicy = (
  kind: ExportSourceResolverKind
): ExportWritePolicy => {
  if (kind === 'generated') return 'generated';
  if (kind === 'workspace-document') return 'preserve-user-edits';
  if (kind === 'remote-url' || kind === 'package' || kind === 'esm-sh') {
    return 'reference-only';
  }
  if (kind === 'vendored') return 'copy';
  return 'copy';
};

const getDefaultUpdatePolicy = (
  kind: ExportSourceResolverKind
): ExportUpdatePolicy => {
  if (kind === 'generated') return 'regenerate';
  if (kind === 'workspace-document') return 'manual';
  if (kind === 'remote-url' || kind === 'vendored') return 'pin';
  if (kind === 'plugin') return 'manual';
  return 'follow-package';
};

const getOriginKind = (
  kind: ExportSourceResolverKind
): ExportSourceOrigin['kind'] => {
  if (kind === 'generated') return 'generated';
  if (kind === 'workspace-document') return 'workspace-document';
  if (kind === 'plugin') return 'plugin';
  if (kind === 'vendored') return 'vendored';
  if (kind === 'remote-url' || kind === 'esm-sh') return 'remote-url';
  return 'external-package';
};

export const resolveExportSource = (
  input: ExportSourceResolverInput
): ExportResolvedSource => {
  const owner = input.owner ?? getDefaultOwner(input.kind, input.packageName);
  const writePolicy = input.writePolicy ?? getDefaultWritePolicy(input.kind);
  const updatePolicy = input.updatePolicy ?? getDefaultUpdatePolicy(input.kind);

  return {
    origin: {
      kind: getOriginKind(input.kind),
      owner,
      label: input.label,
      packageName: input.packageName,
      packageVersion: input.packageVersion,
      url: input.url,
      license: input.license,
      contentHash: input.contentHash,
      writePolicy,
      updatePolicy,
    },
    deliveryPolicy: input.deliveryPolicy,
  };
};

export const resolvePackageExportSource = (input: {
  packageName: string;
  packageVersion: string;
  license?: string;
  owner?: ExportSourceOwner;
  updatePolicy?: ExportUpdatePolicy;
}) =>
  resolveExportSource({
    kind: 'package',
    packageName: input.packageName,
    packageVersion: input.packageVersion,
    license: input.license,
    owner: input.owner,
    writePolicy: 'reference-only',
    updatePolicy: input.updatePolicy ?? 'pin',
  });

export const resolveRemoteExportSource = (input: {
  url: string;
  label?: string;
  license?: string;
  contentHash?: string;
  deliveryPolicy?: ExportAssetDeliveryPolicy;
  updatePolicy?: ExportUpdatePolicy;
}) =>
  resolveExportSource({
    kind: 'remote-url',
    url: input.url,
    label: input.label,
    license: input.license,
    contentHash: input.contentHash,
    writePolicy: 'reference-only',
    updatePolicy: input.updatePolicy ?? 'pin',
    deliveryPolicy: input.deliveryPolicy ?? 'reference',
  });

export const resolveVendoredExportSource = (input: {
  label: string;
  license?: string;
  contentHash?: string;
  packageName?: string;
  packageVersion?: string;
  deliveryPolicy?: ExportAssetDeliveryPolicy;
}) =>
  resolveExportSource({
    kind: 'vendored',
    label: input.label,
    license: input.license,
    contentHash: input.contentHash,
    packageName: input.packageName,
    packageVersion: input.packageVersion,
    writePolicy: 'copy',
    updatePolicy: 'pin',
    deliveryPolicy: input.deliveryPolicy ?? 'vendor',
  });

export const resolvePluginExportSource = (input: {
  label: string;
  license?: string;
  contentHash?: string;
}) =>
  resolveExportSource({
    kind: 'plugin',
    label: input.label,
    license: input.license,
    contentHash: input.contentHash,
    writePolicy: 'copy',
    updatePolicy: 'manual',
  });

export const resolveWorkspaceDocumentExportSource = (input: {
  label?: string;
}) =>
  resolveExportSource({
    kind: 'workspace-document',
    label: input.label,
    writePolicy: 'preserve-user-edits',
    updatePolicy: 'manual',
  });
