import { createHash } from 'node:crypto';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetScannerChain,
} from '@prodivix/assets';
import {
  createAssetDeliveryScannerSnapshot,
  type AssetDeliveryScannerRuntime,
  type AssetDeliveryScannerSnapshot,
} from './assetDeliveryScannerRuntime';

type ObservedChild = Readonly<{
  generation: number;
  policyVersion: string;
}>;

const assertMonotonicChild = (
  previous: ObservedChild | undefined,
  current: AssetDeliveryScannerSnapshot
): void => {
  if (
    previous &&
    (current.generation < previous.generation ||
      (current.generation === previous.generation &&
        current.policyVersion !== previous.policyVersion) ||
      (current.generation !== previous.generation &&
        current.policyVersion === previous.policyVersion))
  ) {
    throw new BinaryAssetScannerUnavailableError('policy-drift');
  }
};

/**
 * Composes one coverage-owning runtime with required independent engines.
 * Every primary media partition must be covered by exactly one scanner from
 * every required runtime; a missing or unhealthy engine fails the whole Gate.
 */
export const createRequiredAssetDeliveryScannerRuntime = (input: {
  primary: AssetDeliveryScannerRuntime;
  required: readonly AssetDeliveryScannerRuntime[];
}): AssetDeliveryScannerRuntime => {
  if (
    typeof input.primary?.acquire !== 'function' ||
    !Array.isArray(input.required) ||
    input.required.length < 1 ||
    input.required.length > 7 ||
    input.required.some((runtime) => typeof runtime?.acquire !== 'function')
  ) {
    throw new TypeError('Required asset scanner composition is invalid.');
  }
  let current: AssetDeliveryScannerSnapshot | undefined;
  let observedChildren: readonly ObservedChild[] | undefined;
  let pending: Promise<AssetDeliveryScannerSnapshot> | undefined;

  const acquire = async (): Promise<AssetDeliveryScannerSnapshot> => {
    const children = await Promise.all([
      input.primary.acquire(),
      ...input.required.map((runtime) => runtime.acquire()),
    ]);
    children.forEach((child, index) =>
      assertMonotonicChild(observedChildren?.[index], child)
    );
    const primary = children[0];
    if (!primary) {
      throw new BinaryAssetScannerUnavailableError('configuration');
    }
    const policyVersion = `required-scanners-${createHash('sha256')
      .update(
        JSON.stringify(
          children.map((child) => ({
            generation: child.generation,
            policyVersion: child.policyVersion,
            scanners: child.scanners.map((scanner) => scanner.descriptor),
          }))
        )
      )
      .digest('hex')
      .slice(0, 32)}`;
    const scanners = primary.scanners.map((primaryScanner) => {
      const requiredScanners = children.slice(1).map((child) => {
        const matches = child.scanners.filter((scanner) =>
          primaryScanner.descriptor.supportedMediaTypes.every((mediaType) =>
            scanner.descriptor.supportedMediaTypes.includes(mediaType)
          )
        );
        if (matches.length !== 1) {
          throw new BinaryAssetScannerUnavailableError('configuration');
        }
        return matches[0] as (typeof matches)[number];
      });
      return createBinaryAssetScannerChain({
        id: primaryScanner.descriptor.id,
        version: policyVersion,
        supportedMediaTypes: primaryScanner.descriptor.supportedMediaTypes,
        scanners: [primaryScanner, ...requiredScanners],
      });
    });
    const generation =
      current?.policyVersion === policyVersion
        ? current.generation
        : (current?.generation ?? 0) + 1;
    current = createAssetDeliveryScannerSnapshot({
      generation,
      policyVersion,
      scanners,
    });
    observedChildren = Object.freeze(
      children.map((child) =>
        Object.freeze({
          generation: child.generation,
          policyVersion: child.policyVersion,
        })
      )
    );
    return current;
  };

  return Object.freeze({
    async acquire() {
      if (pending) return pending;
      pending = acquire().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  });
};
