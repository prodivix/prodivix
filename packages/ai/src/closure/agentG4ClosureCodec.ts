import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import { agentG4ClosureManifestWireSchema } from '../wire/agentG4ClosureWire';
import type { AgentG4GoldenClosureManifest } from './agentG4Closure.types';
import { isAgentG4GoldenClosureManifest } from './agentG4Closure';

export type AgentG4ClosureManifestWire = Readonly<{
  wireVersion: 1;
  factType: 'g4-golden-closure-manifest';
  value: AgentG4GoldenClosureManifest;
}>;

export type AgentG4ClosureManifestDecodeResult =
  | Readonly<{ ok: true; value: AgentG4GoldenClosureManifest }>
  | Readonly<{ ok: false; message: string }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(
  agentG4ClosureManifestWireSchema
);

export const encodeAgentG4ClosureManifest = (
  manifest: AgentG4GoldenClosureManifest
): AgentG4ClosureManifestWire => {
  if (!isAgentG4GoldenClosureManifest(manifest)) {
    throw new TypeError('Agent G4 Closure manifest failed current validation.');
  }
  return Object.freeze({
    wireVersion: 1,
    factType: 'g4-golden-closure-manifest',
    value: cloneAgentControlJson(manifest),
  }) as AgentG4ClosureManifestWire;
};

export const decodeAgentG4ClosureManifest = (
  input: unknown
): AgentG4ClosureManifestDecodeResult => {
  const inspection = inspectAgentControlJson(input, 8_388_608);
  if (inspection.length > 0) {
    return Object.freeze({
      ok: false,
      message: inspection.map(({ message }) => message).join('; '),
    });
  }
  if (
    !validateWire(input) ||
    !hasExactAgentControlKeys(input, ['wireVersion', 'factType', 'value']) ||
    input.wireVersion !== 1 ||
    input.factType !== 'g4-golden-closure-manifest'
  ) {
    return Object.freeze({
      ok: false,
      message: 'Agent G4 Closure wire envelope is unsupported or malformed.',
    });
  }
  const cloned = cloneAgentControlJson(input) as AgentG4ClosureManifestWire;
  if (!isAgentG4GoldenClosureManifest(cloned.value)) {
    return Object.freeze({
      ok: false,
      message: 'Agent G4 Closure manifest failed strict semantic validation.',
    });
  }
  const canonical = encodeAgentG4ClosureManifest(cloned.value);
  if (!sameCanonicalJson(canonical, cloned)) {
    return Object.freeze({
      ok: false,
      message: 'Agent G4 Closure manifest is not canonical.',
    });
  }
  return Object.freeze({ ok: true, value: cloned.value });
};

export const serializeAgentG4ClosureManifest = (
  manifest: AgentG4GoldenClosureManifest
): string => canonicalJsonText(encodeAgentG4ClosureManifest(manifest));
