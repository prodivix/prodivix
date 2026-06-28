import { joinExportPath } from '#src/export/pathPlanner';
import type {
  ExportAssetDeliveryPolicy,
  ExportAssetContribution,
  ExportFile,
  ExportPlannerPreset,
  ExportReferencedAsset,
  ReserveExportPath,
} from '#src/export/types';

const getAssetDeliveryPolicy = (
  asset: ExportAssetContribution
): ExportAssetDeliveryPolicy =>
  asset.deliveryPolicy ?? (asset.publicPath ? 'public' : 'copy');

const getAssetDesiredPath = (
  asset: ExportAssetContribution,
  preset: ExportPlannerPreset
) => {
  const deliveryPolicy = getAssetDeliveryPolicy(asset);
  if (deliveryPolicy === 'public') {
    return asset.publicPath ?? joinExportPath('public', asset.suggestedName);
  }
  if (deliveryPolicy === 'vendor') {
    return joinExportPath(
      preset.sourceRoot,
      'vendor',
      'assets',
      asset.suggestedName
    );
  }
  return (
    asset.sourcePath ??
    joinExportPath(preset.sourceRoot, 'assets', asset.suggestedName)
  );
};

export const planExportAssetContributions = (
  assets: ExportAssetContribution[],
  preset: ExportPlannerPreset,
  reservePath: ReserveExportPath
): ExportFile[] =>
  assets
    .filter(
      (asset) =>
        asset.contents !== undefined &&
        getAssetDeliveryPolicy(asset) !== 'reference'
    )
    .map((asset) => {
      const path = reservePath(getAssetDesiredPath(asset, preset), {
        id: asset.id,
        kind: 'asset',
      });
      return {
        id: asset.id,
        path,
        kind: 'asset',
        language: undefined,
        mimeType: asset.mediaType,
        importMode: 'copy-only',
        contents: asset.contents ?? new Uint8Array(),
        sourceTrace: asset.sourceTrace,
        origin: asset.origin,
      };
    });

export const collectReferencedExportAssets = (
  assets: ExportAssetContribution[],
  emittedAssets: ExportFile[] = []
): ExportReferencedAsset[] =>
  assets.map((asset) => {
    const emittedPath = emittedAssets.find(
      (file) => file.id === asset.id
    )?.path;
    return {
      id: asset.id,
      suggestedName: asset.suggestedName,
      deliveryPolicy: getAssetDeliveryPolicy(asset),
      publicPath: asset.publicPath,
      sourcePath: asset.sourcePath,
      emittedPath,
      url: asset.origin?.url,
      mediaType: asset.mediaType,
      origin: asset.origin,
    };
  });
