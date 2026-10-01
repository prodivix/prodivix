import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { compile } from 'json-schema-to-typescript';
import { format, resolveConfig } from 'prettier';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryRoot = path.resolve(packageRoot, '../..');
const schemaRoot = path.join(repositoryRoot, 'specs/plugins/runtime');
const checkOnly = process.argv.includes('--check');

const contracts = [
  {
    schemaFile: 'runtime-envelope-v1.schema.json',
    rootType: 'RuntimeEnvelopeV1',
    typesFile: 'runtimeEnvelope.generated.ts',
    schemaModuleFile: 'runtimeEnvelopeSchema.generated.ts',
    schemaConstant: 'RUNTIME_ENVELOPE_V1_SCHEMA',
  },
  {
    schemaFile: 'runtime-control-v1.schema.json',
    rootType: 'RuntimeControlMessageV1',
    typesFile: 'runtimeControl.generated.ts',
    schemaModuleFile: 'runtimeControlSchema.generated.ts',
    schemaConstant: 'RUNTIME_CONTROL_V1_SCHEMA',
  },
  {
    schemaFile: 'runtime-implementation-v1.schema.json',
    rootType: 'RuntimeImplementationMessageV1',
    typesFile: 'runtimeImplementation.generated.ts',
    schemaModuleFile: 'runtimeImplementationSchema.generated.ts',
    schemaConstant: 'RUNTIME_IMPLEMENTATION_V1_SCHEMA',
  },
  {
    schemaFile: 'gateway-envelope-v1.schema.json',
    rootType: 'GatewayContractMessageV1',
    typesFile: 'gatewayEnvelope.generated.ts',
    schemaModuleFile: 'gatewayEnvelopeSchema.generated.ts',
    schemaConstant: 'GATEWAY_ENVELOPE_V1_SCHEMA',
  },
];

const outputs = [];
const schemas = [];

function schemaForTypeGeneration(schema) {
  const clone = structuredClone(schema);
  if (clone.$defs?.jsonValue) {
    clone.$defs.jsonValue = {
      tsType: "import('@prodivix/plugin-contracts').JsonValue",
    };
  }
  const replaceExternalJsonValue = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (
        key === '$ref' &&
        child === 'runtime-envelope-v1.schema.json#/$defs/jsonValue'
      ) {
        delete value.$ref;
        value.tsType = "import('@prodivix/plugin-contracts').JsonValue";
        continue;
      }
      replaceExternalJsonValue(child);
    }
  };
  replaceExternalJsonValue(clone);
  return clone;
}

for (const contract of contracts) {
  const schemaPath = path.join(schemaRoot, contract.schemaFile);
  const prettierConfig = (await resolveConfig(schemaPath)) ?? {};
  const sourceLabel = path
    .relative(repositoryRoot, schemaPath)
    .replaceAll(path.sep, '/');
  const notice = `/**
 * Generated from ${sourceLabel}.
 * DO NOT EDIT. Run \`pnpm --filter @prodivix/plugin-protocol generate\`.
 */`;
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const contractVersion = schema['x-prodivix-contract-version'];
  if (typeof contractVersion !== 'string' || contractVersion.length === 0) {
    throw new Error(
      `${contract.schemaFile} must define x-prodivix-contract-version.`
    );
  }

  const generatedTypes = await compile(
    schemaForTypeGeneration(schema),
    contract.rootType,
    {
      bannerComment: `/* eslint-disable */\n${notice}`,
      format: false,
      ignoreMinAndMaxItems: true,
      style: {
        singleQuote: true,
        semi: true,
        tabWidth: 2,
      },
    }
  );
  const generatedSchemaModule = `${notice}

export const ${contract.schemaConstant}_ID = ${JSON.stringify(schema.$id)};
export const ${contract.schemaConstant}_VERSION = ${JSON.stringify(contractVersion)};
export const ${contract.schemaConstant}: object = ${JSON.stringify(schema)};
`;
  schemas.push(schema);

  outputs.push(
    {
      path: path.join(packageRoot, 'src/generated', contract.typesFile),
      content: await format(generatedTypes, {
        ...prettierConfig,
        parser: 'typescript',
      }),
    },
    {
      path: path.join(packageRoot, 'src/generated', contract.schemaModuleFile),
      content: await format(generatedSchemaModule, {
        ...prettierConfig,
        parser: 'typescript',
      }),
    }
  );
}

const ajv = new Ajv2020({
  allErrors: true,
  code: {
    esm: true,
    source: true,
  },
  strict: true,
  strictTypes: false,
  validateFormats: false,
});
ajv.addKeyword({ keyword: 'x-prodivix-contract-version' });
for (const schema of schemas) ajv.addSchema(schema);

const validatorExports = Object.fromEntries(
  [
    ['validateRuntimeEnvelopeSchema', contracts[0]],
    ['validateRuntimeControlSchema', contracts[1]],
    ['validateRuntimeImplementationSchema', contracts[2]],
    ['validateGatewayEnvelopeSchema', contracts[3]],
  ].map(([exportName, contract]) => {
    const schema = schemas.find((candidate) =>
      candidate.$id.endsWith(contract.schemaFile)
    );
    if (!schema) {
      throw new Error(`Missing loaded schema for ${contract.schemaFile}.`);
    }
    return [exportName, schema.$id];
  })
);
const standaloneValidators = standaloneCode(ajv, validatorExports).replace(
  /const (func\d+) = require\(["']ajv\/dist\/runtime\/ucs2length["']\)\.default;/g,
  `const $1 = function unicodeCodePointLength(value) {
  let length = 0;
  for (const _codePoint of value) length += 1;
  return length;
};`
);
for (const forbiddenSource of ['require(', 'new Function', 'eval(']) {
  if (standaloneValidators.includes(forbiddenSource)) {
    throw new Error(
      `Standalone protocol validators contain forbidden runtime source ${JSON.stringify(forbiddenSource)}.`
    );
  }
}
const validatorsPath = path.join(
  packageRoot,
  'src/generated/schemaValidators.generated.ts'
);
outputs.push({
  path: validatorsPath,
  content: await format(
    `/* eslint-disable */
// @ts-nocheck -- Ajv emits JavaScript source; this file is generated and checked at runtime boundaries.
/**
 * Generated from specs/plugins/runtime/*.schema.json.
 * DO NOT EDIT. Run \`pnpm --filter @prodivix/plugin-protocol generate\`.
 */
${standaloneValidators}`,
    {
      ...((await resolveConfig(validatorsPath)) ?? {}),
      parser: 'typescript',
    }
  ),
});

for (const output of outputs) {
  if (checkOnly) {
    const current = await readFile(output.path, 'utf8').catch(() => undefined);
    if (current !== output.content) {
      throw new Error(
        `${path.relative(repositoryRoot, output.path)} is stale. Run the generate script.`
      );
    }
  } else {
    await mkdir(path.dirname(output.path), { recursive: true });
    await writeFile(output.path, output.content, 'utf8');
  }
}

console.log(
  checkOnly
    ? 'Plugin protocol generated files are current.'
    : 'Plugin protocol generated files updated.'
);
