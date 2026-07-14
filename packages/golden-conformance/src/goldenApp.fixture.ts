import {
  createEmptyPirComponentContract,
  type PIRDocument,
} from '@prodivix/pir';
import { BUNDLED_PLUGIN_ARTIFACT } from '@prodivix/plugin-antd';
import type {
  CodegenLibraryPolicy,
  CodegenPolicySnapshot,
} from '@prodivix/prodivix-compiler';
import {
  createWorkspaceProjectConfigDocumentContent,
  decodeWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import baseWorkspaceFixture from '../fixtures/golden-app.base.workspace.json';

export const GOLDEN_IDS = Object.freeze({
  workspace: 'golden-workspace',
  homePage: 'page-home',
  checkoutPage: 'page-checkout',
  checkoutRoute: 'route-checkout',
  orderSummaryComponent: 'component-order-summary',
  orderSummaryRoute: 'route-order-summary',
  orderSummaryPreviewRoute: 'route-order-summary-preview',
  checkoutHandler: 'code-checkout-handler',
  checkoutCss: 'code-checkout-css',
  logoAsset: 'asset-golden-logo',
  projectConfig: 'config-golden-project',
});

export const GOLDEN_INITIAL_HANDLER_SOURCE = `export const submitCheckout = (input: unknown) => ({
  ok: true,
  input,
});
`;

export const GOLDEN_EDITED_HANDLER_SOURCE = `export const submitCheckout = (input: unknown) => {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'invalid-input' } as const;
  }
  return { ok: true, input } as const;
};
`;

export const GOLDEN_LOCAL_CONFLICT_SOURCE = `export const submitCheckout = (input: unknown) => ({
  ok: true,
  input,
  source: 'local',
});
`;

export const GOLDEN_REMOTE_CONFLICT_SOURCE = `export const submitCheckout = (input: unknown) => ({
  ok: true,
  input,
  source: 'remote',
});
`;

type OfficialCodegenPolicyResource = Omit<
  CodegenLibraryPolicy,
  'source' | 'runtimeTypes'
> & {
  schemaVersion: '1.0';
  targetPreset: 'react-vite';
};

type OfficialExternalLibraryResource = Readonly<{
  libraryId: string;
  components: readonly Readonly<{ runtimeType: string }>[];
}>;

const readOfficialPluginResource = <T>(path: string): T => {
  const resource = BUNDLED_PLUGIN_ARTIFACT.resources.find(
    (candidate) => candidate.path === path
  );
  if (!resource)
    throw new Error(`Official plugin resource is missing: ${path}`);
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(resource.bytes))
  ) as T;
};

const ANTD_CODEGEN_POLICY =
  readOfficialPluginResource<OfficialCodegenPolicyResource>(
    'plugin/contributions/codegen-policy.json'
  );
const ANTD_EXTERNAL_LIBRARY =
  readOfficialPluginResource<OfficialExternalLibraryResource>(
    'plugin/contributions/external-library.json'
  );

export const GOLDEN_OFFICIAL_PLUGIN_EVIDENCE = Object.freeze({
  packageDigest: BUNDLED_PLUGIN_ARTIFACT.packageDigest,
  contributionId: 'antd.react-codegen',
  resourcePath: 'plugin/contributions/codegen-policy.json',
});

export const GOLDEN_CODEGEN_POLICY = Object.freeze({
  schemaVersion: '1.0',
  registryRevision: 1,
  targetPreset: 'react-vite',
  libraries: [
    {
      source: {
        pluginId: '@prodivix/plugin-antd',
        contributionId: GOLDEN_OFFICIAL_PLUGIN_EVIDENCE.contributionId,
        generation: 1,
      },
      libraryId: ANTD_CODEGEN_POLICY.libraryId,
      runtimeTypes: ANTD_EXTERNAL_LIBRARY.components.map(
        (component) => component.runtimeType
      ),
      dependencies: ANTD_CODEGEN_POLICY.dependencies,
      rules: ANTD_CODEGEN_POLICY.rules,
      unsupported: ANTD_CODEGEN_POLICY.unsupported,
    },
  ],
  iconProviders: [],
} satisfies CodegenPolicySnapshot);

export const createGoldenBaseWorkspace = (): WorkspaceSnapshot =>
  structuredClone(decodeWorkspaceSnapshot(baseWorkspaceFixture).workspace);

export const createGoldenCheckoutPir = (): PIRDocument => ({
  metadata: {
    name: 'GoldenCheckout',
    description: 'Multi-surface Golden checkout form.',
  },
  ui: {
    graph: {
      rootId: 'checkout-root',
      nodesById: {
        'checkout-root': {
          id: 'checkout-root',
          kind: 'element',
          type: 'main',
          props: {
            className: { kind: 'literal', value: 'golden-checkout' },
          },
        },
        'checkout-title': {
          id: 'checkout-title',
          kind: 'element',
          type: 'h1',
          text: { kind: 'literal', value: 'Checkout' },
        },
        'checkout-form': {
          id: 'checkout-form',
          kind: 'element',
          type: 'form',
          props: {
            method: { kind: 'literal', value: 'post' },
            action: { kind: 'literal', value: '/checkout' },
          },
        },
        'email-label': {
          id: 'email-label',
          kind: 'element',
          type: 'label',
          text: { kind: 'literal', value: 'Email' },
          props: {
            htmlFor: { kind: 'literal', value: 'checkout-email' },
          },
        },
        'email-input': {
          id: 'email-input',
          kind: 'element',
          type: 'input',
          props: {
            id: { kind: 'literal', value: 'checkout-email' },
            name: { kind: 'literal', value: 'email' },
            type: { kind: 'literal', value: 'email' },
            required: { kind: 'literal', value: true },
          },
        },
        'submit-primary': {
          id: 'submit-primary',
          kind: 'element',
          type: 'AntdButton',
          text: { kind: 'literal', value: 'Pay now' },
          props: { type: { kind: 'literal', value: 'primary' } },
          events: {
            click: {
              kind: 'call-code',
              slotId: 'blueprint.node.submit-primary.event.click',
              reference: {
                artifactId: GOLDEN_IDS.checkoutHandler,
                exportName: 'submitCheckout',
              },
            },
          },
        },
        'submit-secondary': {
          id: 'submit-secondary',
          kind: 'element',
          type: 'AntdButton',
          text: { kind: 'literal', value: 'Save for later' },
        },
      },
      childIdsById: {
        'checkout-root': ['checkout-title', 'checkout-form'],
        'checkout-title': [],
        'checkout-form': [
          'email-label',
          'email-input',
          'submit-primary',
          'submit-secondary',
        ],
        'email-label': [],
        'email-input': [],
        'submit-primary': [],
        'submit-secondary': [],
      },
      order: { strategy: 'childIdsById' },
    },
  },
  logic: {
    state: {
      status: { typeRef: 'string', initial: 'idle' },
    },
  },
});

export const createGoldenOrderSummaryPir = (): PIRDocument => ({
  metadata: {
    name: 'GoldenOrderSummary',
    description: 'Reusable Golden component document.',
  },
  componentContract: createEmptyPirComponentContract(),
  ui: {
    graph: {
      rootId: 'summary-root',
      nodesById: {
        'summary-root': {
          id: 'summary-root',
          kind: 'element',
          type: 'aside',
          props: {
            className: { kind: 'literal', value: 'order-summary' },
          },
        },
        'summary-title': {
          id: 'summary-title',
          kind: 'element',
          type: 'h2',
          text: { kind: 'literal', value: 'Order summary' },
        },
      },
      childIdsById: {
        'summary-root': ['summary-title'],
        'summary-title': [],
      },
      order: { strategy: 'childIdsById' },
    },
  },
});

export const createGoldenDocuments = (): WorkspaceDocument[] => [
  {
    id: GOLDEN_IDS.orderSummaryComponent,
    type: 'pir-component',
    name: 'Order Summary',
    path: '/components/order-summary.pir.json',
    contentRev: 1,
    metaRev: 1,
    content: createGoldenOrderSummaryPir(),
  },
  {
    id: GOLDEN_IDS.checkoutHandler,
    type: 'code',
    name: 'checkout.ts',
    path: '/src/actions/checkout.ts',
    contentRev: 1,
    metaRev: 1,
    content: {
      language: 'ts',
      source: GOLDEN_INITIAL_HANDLER_SOURCE,
    },
  },
  {
    id: GOLDEN_IDS.checkoutCss,
    type: 'code',
    name: 'checkout.css',
    path: '/styles/checkout.css',
    contentRev: 1,
    metaRev: 1,
    content: {
      language: 'css',
      source:
        '.golden-checkout { display: grid; gap: 1rem; max-width: 42rem; }',
    },
  },
  {
    id: GOLDEN_IDS.logoAsset,
    type: 'asset',
    name: 'logo.svg',
    path: '/public/logo.svg',
    contentRev: 1,
    metaRev: 1,
    content: {
      kind: 'asset',
      mime: 'image/svg+xml',
      category: 'image',
      text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#111"/></svg>',
    },
  },
  {
    id: GOLDEN_IDS.projectConfig,
    type: 'project-config',
    name: 'golden.json',
    path: '/config/golden.json',
    contentRev: 1,
    metaRev: 1,
    content: createWorkspaceProjectConfigDocumentContent({
      target: 'react-vite',
      features: ['routes', 'forms', 'plugins', 'resources'],
    }),
  },
];
