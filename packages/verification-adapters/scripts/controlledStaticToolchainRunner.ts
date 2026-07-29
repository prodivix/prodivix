import {
  encodeControlledStaticToolchainResult,
  projectControlledStaticToolchainResult,
} from './controlledStaticToolchainArtifacts';
import { withControlledStaticToolchainExecution } from './controlledStaticToolchainProcess';
import {
  decodeControlledStaticToolchainRequest,
  type ControlledStaticToolchainResult,
} from './controlledStaticToolchainProtocol';

export { encodeControlledStaticToolchainResult };

export const runControlledStaticToolchain = async (
  source: string | Uint8Array
): Promise<ControlledStaticToolchainResult> => {
  const { requestDigest, snapshot } =
    decodeControlledStaticToolchainRequest(source);
  return withControlledStaticToolchainExecution(
    requestDigest,
    snapshot,
    (execution) => projectControlledStaticToolchainResult(snapshot, execution)
  );
};
