import type { PackageSizeThresholds } from './types';

type PackageSizeLevel = 'healthy' | 'caution' | 'warning' | 'critical';

type PackageSizeMeta = {
  level: PackageSizeLevel;
  label: string;
  hint: string;
  badgeClassName: string;
  bannerClassName: string;
};

const asPositiveInteger = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value <= 0) return fallback;
  return Math.floor(value);
};

export const DEFAULT_PACKAGE_SIZE_THRESHOLDS: PackageSizeThresholds = {
  cautionKb: 500,
  warningKb: 800,
  criticalKb: 1200,
};

export const normalizePackageSizeThresholds = (
  thresholds: Partial<PackageSizeThresholds>
): PackageSizeThresholds => {
  const cautionKb = asPositiveInteger(
    thresholds.cautionKb,
    DEFAULT_PACKAGE_SIZE_THRESHOLDS.cautionKb
  );
  const warningRaw = asPositiveInteger(
    thresholds.warningKb,
    DEFAULT_PACKAGE_SIZE_THRESHOLDS.warningKb
  );
  const criticalRaw = asPositiveInteger(
    thresholds.criticalKb,
    DEFAULT_PACKAGE_SIZE_THRESHOLDS.criticalKb
  );
  const warningKb = Math.max(cautionKb + 1, warningRaw);
  const criticalKb = Math.max(warningKb + 1, criticalRaw);
  return { cautionKb, warningKb, criticalKb };
};

export const formatPackageSize = (sizeKb: number) => {
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(2)} MB`;
  return `${sizeKb} KB`;
};

export const getPackageSizeMeta = (
  sizeKb: number,
  thresholds: PackageSizeThresholds = DEFAULT_PACKAGE_SIZE_THRESHOLDS
): PackageSizeMeta => {
  const normalizedThresholds = normalizePackageSizeThresholds(thresholds);
  if (sizeKb > normalizedThresholds.criticalKb) {
    return {
      level: 'critical',
      label: 'L3 Critical',
      hint: 'Very large package, prefer lazy loading or lighter alternatives.',
      badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
      bannerClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  if (sizeKb > normalizedThresholds.warningKb) {
    return {
      level: 'warning',
      label: 'L2 Warning',
      hint: 'Large package, consider tree-shaking and route-level splitting.',
      badgeClassName: 'border-orange-200 bg-orange-50 text-orange-700',
      bannerClassName: 'border-orange-200 bg-orange-50 text-orange-700',
    };
  }
  if (sizeKb > normalizedThresholds.cautionKb) {
    return {
      level: 'caution',
      label: 'L1 Caution',
      hint: 'Slightly above 500 KB, monitor bundle impact.',
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      bannerClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    level: 'healthy',
    label: 'Healthy',
    hint: 'Within recommended size threshold.',
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bannerClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
};
