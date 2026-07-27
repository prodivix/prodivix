import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type JsonValue,
} from '@prodivix/plugin-contracts';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  protocolContractKey,
  type ProtocolContractIdentity,
  type ProtocolPayloadContract,
} from '#protocol/contracts/protocolContract';
import {
  protocolFailure,
  protocolSuccess,
  type ProtocolResult,
} from '#protocol/result';

export type ProtocolContractRegistry = Readonly<{
  get(identity: ProtocolContractIdentity): ProtocolPayloadContract | undefined;
  require(
    identity: ProtocolContractIdentity
  ): ProtocolResult<ProtocolPayloadContract>;
  list(): readonly ProtocolPayloadContract[];
}>;

export const createProtocolContractRegistry = (
  contracts: readonly ProtocolPayloadContract[]
): ProtocolResult<ProtocolContractRegistry> => {
  const byKey = new Map<string, ProtocolPayloadContract>();
  for (const contract of contracts) {
    const key = protocolContractKey(contract);
    if (byKey.has(key)) {
      return protocolFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.UNKNOWN_PROTOCOL_CONTRACT,
          `Protocol contract ${JSON.stringify(contract.channel)} ${JSON.stringify(contract.method)} ${JSON.stringify(contract.contractVersion)} ${JSON.stringify(contract.kind)} is registered more than once.`,
          {
            contractVersion: contract.contractVersion,
            protocolChannel: contract.channel,
            protocolMethod: contract.method,
            protocolKind: contract.kind,
          }
        ),
      ]);
    }
    byKey.set(key, Object.freeze({ ...contract }));
  }
  const ordered = Object.freeze(
    [...byKey.values()].sort((left, right) =>
      compareUnicodeCodePoints(
        protocolContractKey(left),
        protocolContractKey(right)
      )
    )
  );
  const get = (identity: ProtocolContractIdentity) =>
    byKey.get(protocolContractKey(identity));

  return protocolSuccess(
    Object.freeze({
      get,
      require: (identity: ProtocolContractIdentity) => {
        const contract = get(identity);
        if (contract) return protocolSuccess(contract);
        return protocolFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.UNKNOWN_PROTOCOL_CONTRACT,
            `Protocol contract ${JSON.stringify(identity.channel)} ${JSON.stringify(identity.method)} ${JSON.stringify(identity.contractVersion)} ${JSON.stringify(identity.kind)} is not registered.`,
            {
              contractVersion: identity.contractVersion,
              protocolChannel: identity.channel,
              protocolMethod: identity.method,
              protocolKind: identity.kind,
            }
          ),
        ]);
      },
      list: (): readonly ProtocolPayloadContract<JsonValue>[] => ordered,
    })
  );
};
