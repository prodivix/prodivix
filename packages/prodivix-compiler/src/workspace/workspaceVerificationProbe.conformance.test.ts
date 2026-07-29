import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
} from '#src/index';
import {
  compileWorkspaceToExportProgram,
  generateWorkspaceReactViteBundle,
} from '#src/react/workspaceProject';
import {
  compileWorkspaceToVueViteExportProgram,
  generateWorkspaceVueViteBundle,
} from '#src/vue/workspaceProject';
import {
  ProductionVerificationProbeScanInputError,
  ProductionVerificationProbeLeakError,
  WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
  assertProductionBundleHasNoVerificationProbe,
  scanProductionBundleForVerificationProbe,
} from '#src/workspace/productionVerificationProbeScanner';
import {
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  WorkspaceVerificationCompileProfileError,
  createWorkspaceVerificationProbeContribution,
  type WorkspaceVerificationCompileProfile,
} from '#src/workspace/workspaceVerificationProbe';

const digest = (character: string): string => `sha256-${character.repeat(64)}`;

const workspace: WorkspaceSnapshot = {
  id: 'verification-probe-workspace',
  name: 'Verification Probe Workspace',
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 11,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'catalog.pir.json',
      parentId: 'root',
      docId: 'page-catalog',
    },
  },
  docsById: {
    'page-catalog': {
      id: 'page-catalog',
      type: 'pir-page',
      path: '/catalog.pir.json',
      contentRev: 4,
      metaRev: 2,
      content: createEmptyPirDocument({
        rootId: 'catalog-root',
        rootType: 'main',
      }),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-catalog' },
  },
};

const verificationProfile: WorkspaceVerificationCompileProfile = {
  kind: 'verification',
  workspaceRevision: workspace.workspaceRev,
  profileDigest: digest('a'),
  scenarioProgramDigest: digest('b'),
  semanticSnapshotDigest: digest('c'),
  targets: [
    {
      targetId: 'target-catalog-root',
      readiness: ['visible', 'mounted', 'enabled', 'document-ready'],
      sourceRef: {
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/catalog-root',
      },
    },
  ],
};

const markerValues = [
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
] as const;

const textFromFiles = (
  files: readonly Readonly<{ contents: string | Uint8Array }>[]
): string =>
  files
    .map(({ contents }) =>
      typeof contents === 'string'
        ? contents
        : new TextDecoder().decode(contents)
    )
    .join('\n');

const runtimeFiles = (
  snapshot: ExecutableProjectSnapshot
): readonly Readonly<{ path: string; contents: string | Uint8Array }>[] =>
  projectExecutableProjectRuntimeFiles(snapshot, 'build').map(
    ({ path, contents }) => Object.freeze({ path, contents })
  );

const exactProductionScanFiles = (
  files: readonly Readonly<{
    path: string;
    contents: string | Uint8Array;
  }>[]
): readonly Readonly<{ path: string; contents: string | Uint8Array }>[] =>
  files.map(({ path, contents }) => Object.freeze({ path, contents }));

const scanUnknownProductionFiles = (files: unknown, options: unknown = {}) =>
  scanProductionBundleForVerificationProbe(
    files as Parameters<typeof scanProductionBundleForVerificationProbe>[0],
    options as Parameters<typeof scanProductionBundleForVerificationProbe>[1]
  );

const typeCheckGeneratedProbeSource = (
  source: string
): readonly ts.Diagnostic[] => {
  const fileName = 'generated-workspace-verification-probe.ts';
  const compilerOptions: ts.CompilerOptions = {
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const defaultHost = ts.createCompilerHost(compilerOptions);
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    compilerOptions.target!,
    true,
    ts.ScriptKind.TS
  );
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (candidate) =>
      candidate === fileName || defaultHost.fileExists(candidate),
    getSourceFile: (
      candidate,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    ) =>
      candidate === fileName
        ? sourceFile
        : defaultHost.getSourceFile(
            candidate,
            languageVersion,
            onError,
            shouldCreateNewSourceFile
          ),
    readFile: (candidate) =>
      candidate === fileName ? source : defaultHost.readFile(candidate),
  };
  return ts.getPreEmitDiagnostics(
    ts.createProgram([fileName], compilerOptions, host)
  );
};

describe('Workspace verification probe compile profile', () => {
  it('emits one shared, digest-bound React/Vue ExportProgram probe contract', () => {
    const react = compileWorkspaceToExportProgram(workspace, {
      verificationProfile,
    });
    const vue = compileWorkspaceToVueViteExportProgram(workspace, {
      verificationProfile,
    });
    const reactProbe = react.modules.find(
      ({ id }) => id === WORKSPACE_VERIFICATION_PROBE_MODULE_ID
    );
    const vueProbe = vue.modules.find(
      ({ id }) => id === WORKSPACE_VERIFICATION_PROBE_MODULE_ID
    );

    expect(reactProbe).toBeDefined();
    expect(vueProbe).toBeDefined();
    expect(vueProbe).toEqual(reactProbe);
    expect(reactProbe?.desiredPath).toBe(
      WORKSPACE_VERIFICATION_PROBE_MODULE_PATH
    );
    expect(reactProbe?.sourceTrace).toEqual([
      {
        sourceRef: {
          domain: 'workspace-document',
          id: 'page-catalog',
          path: '/nodesById/catalog-root',
        },
        ownerRootId: 'app',
      },
    ]);

    for (const program of [react, vue]) {
      const entry = program.modules.find(({ imports }) =>
        imports.some(
          ({ targetModuleId }) =>
            targetModuleId === WORKSPACE_VERIFICATION_PROBE_MODULE_ID
        )
      );
      expect(entry).toBeDefined();
      expect(entry!.imports).toContainEqual({
        kind: 'side-effect',
        source: WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
        targetModuleId: WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
      });
      expect(program.metadata?.workspaceVerificationProbe).toEqual({
        format: 'prodivix.workspace-verification-probe.v1',
        workspaceRevision: workspace.workspaceRev,
        profileDigest: digest('a'),
        scenarioProgramDigest: digest('b'),
        semanticSnapshotDigest: digest('c'),
        manifestDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
        targetCount: 1,
      });
    }
  });

  it('exposes only frozen semantic identity, normalized state, readiness, and SourceTrace', () => {
    const contribution = createWorkspaceVerificationProbeContribution(
      workspace,
      verificationProfile
    );
    const source = contribution.modules?.[0]?.body;
    expect(source).toBeDefined();
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/u
    );
    expect(source).not.toContain('innerHTML');

    const transpiled = ts.transpileModule(source!, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    expect(transpiled.diagnostics ?? []).toEqual([]);

    const element = {
      getAttribute: (name: string) =>
        name === 'data-pir-document-id'
          ? 'page-catalog'
          : name === 'data-pir-node-id'
            ? 'catalog-root'
            : null,
      getClientRects: () => [{ width: 100, height: 40 }],
      hasAttribute: () => false,
      parentElement: null,
    };
    const context: Record<string, unknown> = {
      document: {
        readyState: 'complete',
        getElementsByTagName: () => [element],
      },
      exports: {},
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'visible',
      }),
    };
    vm.runInNewContext(transpiled.outputText, context);
    const probe = context[WORKSPACE_VERIFICATION_PROBE_ENDPOINT] as {
      canary: string;
      profile: Readonly<Record<string, unknown>>;
      listTargets(): readonly Readonly<Record<string, unknown>>[];
      readTarget(targetId: string): Readonly<Record<string, unknown>>;
    };

    expect(probe.canary).toBe(WORKSPACE_VERIFICATION_PROBE_CANARY);
    expect(probe.profile).toEqual({
      workspaceRevision: workspace.workspaceRev,
      profileDigest: digest('a'),
      scenarioProgramDigest: digest('b'),
      semanticSnapshotDigest: digest('c'),
      manifestDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
    });
    expect(probe.profile.manifestDigest).toBe(
      (
        contribution.metadata?.workspaceVerificationProbe as Readonly<
          Record<string, unknown>
        >
      ).manifestDigest
    );
    expect(probe.listTargets()).toEqual([
      {
        targetId: 'target-catalog-root',
        readiness: ['document-ready', 'enabled', 'mounted', 'visible'],
        sourceTrace: {
          workspaceDocumentId: 'page-catalog',
          path: '/nodesById/catalog-root',
        },
      },
    ]);
    expect(probe.readTarget('target-catalog-root')).toEqual({
      targetId: 'target-catalog-root',
      ready: true,
      readiness: ['document-ready', 'enabled', 'mounted', 'visible'],
      state: {
        documentReady: true,
        match: 'single',
        mounted: true,
        visible: true,
        enabled: true,
      },
      sourceTrace: {
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/catalog-root',
      },
    });
    expect(JSON.stringify(probe)).not.toContain('getElementsByTagName');
    expect(JSON.stringify(probe.readTarget('target-catalog-root'))).not.toMatch(
      /(?:outerHTML|innerHTML|selector|xpath)/iu
    );

    const tamper = vm.runInNewContext(
      `(() => {
        const endpoint = ${JSON.stringify(WORKSPACE_VERIFICATION_PROBE_ENDPOINT)};
        const original = globalThis[endpoint];
        const deleted = Reflect.deleteProperty(globalThis, endpoint);
        const replaced = Reflect.set(globalThis, endpoint, Object.freeze({}));
        let redefineRejected = false;
        try {
          Object.defineProperty(globalThis, endpoint, {
            configurable: true,
            value: Object.freeze({}),
          });
        } catch {
          redefineRejected = true;
        }
        const descriptor = Object.getOwnPropertyDescriptor(
          globalThis,
          endpoint
        );
        return {
          deleted,
          replaced,
          redefineRejected,
          retained: globalThis[endpoint] === original,
          configurable: descriptor?.configurable,
          enumerable: descriptor?.enumerable,
          writable: descriptor?.writable,
        };
      })()`,
      context
    ) as Readonly<Record<string, unknown>>;
    expect(tamper).toEqual({
      deleted: false,
      replaced: false,
      redefineRejected: true,
      retained: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    expect(() =>
      vm.runInNewContext(transpiled.outputText, {
        exports: {},
        [WORKSPACE_VERIFICATION_PROBE_ENDPOINT]: Object.freeze({}),
      })
    ).toThrow('VERIFICATION_PROBE_ENDPOINT_OCCUPIED');
  });

  it('binds a collection-item scope and resolves exactly one repeated PIR instance', () => {
    const scopedProfile: WorkspaceVerificationCompileProfile = {
      ...verificationProfile,
      targets: [
        {
          ...verificationProfile.targets[0]!,
          readiness: ['document-ready', 'mounted'],
          instanceScope: {
            kind: 'collection-item',
            id: 'p2',
          },
        },
      ],
    };
    const contribution = createWorkspaceVerificationProbeContribution(
      workspace,
      scopedProfile
    );
    const source = contribution.modules?.[0]?.body;
    expect(source).toBeDefined();
    const transpiled = ts.transpileModule(source!, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    expect(transpiled.diagnostics ?? []).toEqual([]);

    const instancePathSuffix = (id: string): string => {
      const keyIdentity = `key/${'string'.length}:string/${id.length}:${id}`;
      return `/${keyIdentity.length}:${keyIdentity}`;
    };
    const element = (id: string) => ({
      getAttribute: (name: string) =>
        name === 'data-pir-document-id'
          ? 'page-catalog'
          : name === 'data-pir-node-id'
            ? 'catalog-root'
            : name === 'data-pir-instance-path'
              ? `/root/collection${instancePathSuffix(id)}`
              : null,
      getClientRects: () => [{ width: 100, height: 40 }],
      hasAttribute: () => false,
      parentElement: null,
    });
    const context: Record<string, unknown> = {
      document: {
        readyState: 'complete',
        getElementsByTagName: () => [element('p1'), element('p2')],
      },
      exports: {},
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'visible',
      }),
    };
    vm.runInNewContext(transpiled.outputText, context);
    const probe = context[WORKSPACE_VERIFICATION_PROBE_ENDPOINT] as {
      listTargets(): readonly Readonly<Record<string, unknown>>[];
      readTarget(targetId: string): Readonly<Record<string, unknown>>;
    };

    expect(probe.listTargets()).toEqual([
      {
        targetId: 'target-catalog-root',
        readiness: ['document-ready', 'mounted'],
        sourceTrace: {
          workspaceDocumentId: 'page-catalog',
          path: '/nodesById/catalog-root',
        },
        instanceScope: {
          kind: 'collection-item',
          id: 'p2',
        },
      },
    ]);
    expect(probe.readTarget('target-catalog-root')).toMatchObject({
      targetId: 'target-catalog-root',
      ready: true,
      state: {
        match: 'single',
        mounted: true,
      },
      instanceScope: {
        kind: 'collection-item',
        id: 'p2',
      },
    });

    expect(() =>
      createWorkspaceVerificationProbeContribution(workspace, {
        ...verificationProfile,
        targets: [
          {
            ...verificationProfile.targets[0]!,
            instanceScope: {
              kind: 'component-instance',
              id: 'component-1',
            },
          },
        ],
      } as WorkspaceVerificationCompileProfile)
    ).toThrow(/Only collection-item/u);
  });

  it('type-checks and preserves mixed scoped and unscoped semantic targets', () => {
    const mixedProfile: WorkspaceVerificationCompileProfile = {
      ...verificationProfile,
      targets: [
        {
          ...verificationProfile.targets[0]!,
          targetId: 'target-catalog-all-items',
          readiness: ['document-ready', 'mounted'],
        },
        {
          ...verificationProfile.targets[0]!,
          targetId: 'target-catalog-item-p2',
          readiness: ['document-ready', 'mounted'],
          instanceScope: {
            kind: 'collection-item',
            id: 'p2',
          },
        },
      ],
    };
    const contribution = createWorkspaceVerificationProbeContribution(
      workspace,
      mixedProfile
    );
    const source = contribution.modules?.[0]?.body;
    expect(source).toBeDefined();
    expect(typeCheckGeneratedProbeSource(source!)).toEqual([]);

    const instancePathSuffix = (id: string): string => {
      const keyIdentity = `key/${'string'.length}:string/${id.length}:${id}`;
      return `/${keyIdentity.length}:${keyIdentity}`;
    };
    const element = (id: string) => ({
      getAttribute: (name: string) =>
        name === 'data-pir-document-id'
          ? 'page-catalog'
          : name === 'data-pir-node-id'
            ? 'catalog-root'
            : name === 'data-pir-instance-path'
              ? `/root/collection${instancePathSuffix(id)}`
              : null,
      getClientRects: () => [{ width: 100, height: 40 }],
      hasAttribute: () => false,
      parentElement: null,
    });
    const context: Record<string, unknown> = {
      document: {
        readyState: 'complete',
        getElementsByTagName: () => [element('p1'), element('p2')],
      },
      exports: {},
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'visible',
      }),
    };
    const transpiled = ts.transpileModule(source!, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    vm.runInNewContext(transpiled.outputText, context);
    const probe = context[WORKSPACE_VERIFICATION_PROBE_ENDPOINT] as {
      listTargets(): readonly Readonly<Record<string, unknown>>[];
      readTarget(targetId: string): Readonly<Record<string, unknown>>;
    };

    expect(probe.listTargets()).toEqual([
      {
        targetId: 'target-catalog-all-items',
        readiness: ['document-ready', 'mounted'],
        sourceTrace: {
          workspaceDocumentId: 'page-catalog',
          path: '/nodesById/catalog-root',
        },
      },
      {
        targetId: 'target-catalog-item-p2',
        readiness: ['document-ready', 'mounted'],
        sourceTrace: {
          workspaceDocumentId: 'page-catalog',
          path: '/nodesById/catalog-root',
        },
        instanceScope: {
          kind: 'collection-item',
          id: 'p2',
        },
      },
    ]);
    expect(probe.readTarget('target-catalog-all-items')).toMatchObject({
      ready: true,
      state: {
        match: 'multiple',
        mounted: true,
      },
    });
    expect(probe.readTarget('target-catalog-item-p2')).toMatchObject({
      ready: true,
      state: {
        match: 'single',
        mounted: true,
      },
      instanceScope: {
        kind: 'collection-item',
        id: 'p2',
      },
    });
  });

  it('keeps default and explicit production programs and artifacts probe-free', () => {
    const bundles = [
      generateWorkspaceReactViteBundle(workspace),
      generateWorkspaceReactViteBundle(workspace, {
        verificationProfile: { kind: 'production' },
      }),
      generateWorkspaceVueViteBundle(workspace),
      generateWorkspaceVueViteBundle(workspace, {
        verificationProfile: { kind: 'production' },
      }),
    ];
    bundles.forEach((bundle) => {
      expect(
        bundle.diagnostics.filter(({ severity }) => severity === 'error')
      ).toEqual([]);
      expect(
        scanProductionBundleForVerificationProbe(
          exactProductionScanFiles(bundle.files)
        )
      ).toEqual({
        status: 'clean',
        findings: [],
      });
      const bytes = textFromFiles(bundle.files);
      markerValues.forEach((marker) => expect(bytes).not.toContain(marker));
    });

    const programs = [
      compileWorkspaceToExportProgram(workspace),
      compileWorkspaceToVueViteExportProgram(workspace),
    ];
    programs.forEach((program) => {
      const bytes = JSON.stringify(program);
      markerValues.forEach((marker) => expect(bytes).not.toContain(marker));
      expect(program.metadata?.workspaceVerificationProbe).toBeUndefined();
    });
  });

  it('materializes both black-box build snapshots without any probe bytes', () => {
    const results = [
      generateWorkspaceReactViteExecutableProject(workspace),
      generateWorkspaceVueViteExecutableProject(workspace),
    ];
    results.forEach((result) => {
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      const files = runtimeFiles(result.snapshot);
      expect(scanProductionBundleForVerificationProbe(files)).toEqual({
        status: 'clean',
        findings: [],
      });
      expect(result.snapshot.entrypoints).toContainEqual({
        kind: 'build',
        path: 'index.html',
      });
    });
  });

  it('blocks real verification-profile bundles at the production promotion boundary', () => {
    const bundles = [
      generateWorkspaceReactViteBundle(workspace, { verificationProfile }),
      generateWorkspaceVueViteBundle(workspace, { verificationProfile }),
    ];
    bundles.forEach((bundle) => {
      expect(
        bundle.diagnostics.filter(({ severity }) => severity === 'error')
      ).toEqual([]);
      const files = exactProductionScanFiles(bundle.files);
      const result = scanProductionBundleForVerificationProbe(files);
      expect(result.status).toBe('blocked');
      if (result.status !== 'blocked') return;
      expect(result.findings.map(({ marker }) => marker)).toEqual(
        expect.arrayContaining(['probe-canary', 'probe-endpoint'])
      );
      expect(() => assertProductionBundleHasNoVerificationProbe(files)).toThrow(
        ProductionVerificationProbeLeakError
      );
    });
  });

  it('finds intentional text, binary, module, and credential leaks byte-for-byte', () => {
    const binaryCredentialLeak = new TextEncoder().encode(
      `prefix:${WORKSPACE_VERIFICATION_CREDENTIAL_CANARY}:suffix`
    );
    const result = scanProductionBundleForVerificationProbe([
      {
        path: 'assets/index.js',
        contents: `globalThis[${JSON.stringify(WORKSPACE_VERIFICATION_PROBE_ENDPOINT)}] = {};`,
      },
      {
        path: 'assets/vendor.bin',
        contents: binaryCredentialLeak,
      },
      {
        path: 'assets/module.js',
        contents: WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
      },
      {
        path: 'assets/canary.js',
        contents: WORKSPACE_VERIFICATION_PROBE_CANARY,
      },
      {
        path: 'assets/path.js',
        contents: WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
      },
    ]);
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.findings.map(({ marker }) => marker)).toEqual([
      'probe-canary',
      'probe-endpoint',
      'probe-module-id',
      'probe-module-path',
      'credential-canary',
    ]);
    expect(() =>
      assertProductionBundleHasNoVerificationProbe([
        {
          path: 'assets/index.js',
          contents: WORKSPACE_VERIFICATION_PROBE_CANARY,
        },
      ])
    ).toThrow(ProductionVerificationProbeLeakError);
  });

  it('makes the computed manifest digest order-independent and semantic-sensitive', () => {
    const targets = [
      verificationProfile.targets[0]!,
      {
        targetId: 'target-catalog-secondary',
        readiness: ['mounted', 'document-ready'] as const,
        sourceRef: {
          workspaceDocumentId: 'page-catalog',
          path: '/ui/graph/nodesById/catalog-root',
        },
      },
    ];
    const metadataFor = (
      profile: WorkspaceVerificationCompileProfile
    ): Readonly<Record<string, unknown>> =>
      createWorkspaceVerificationProbeContribution(workspace, profile).metadata
        ?.workspaceVerificationProbe as Readonly<Record<string, unknown>>;
    const first = metadataFor({
      ...verificationProfile,
      targets,
    });
    const reordered = metadataFor({
      ...verificationProfile,
      targets: [
        {
          ...targets[1]!,
          readiness: ['document-ready', 'mounted'],
        },
        {
          ...targets[0]!,
          readiness: ['enabled', 'visible', 'document-ready', 'mounted'],
        },
      ],
    });
    const changed = metadataFor({
      ...verificationProfile,
      targets: [
        targets[0]!,
        {
          ...targets[1]!,
          readiness: ['document-ready'],
        },
      ],
    });

    expect(first.manifestDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(reordered.manifestDigest).toBe(first.manifestDigest);
    expect(changed.manifestDigest).not.toBe(first.manifestDigest);
  });

  it('rejects unsafe, duplicate, and over-budget scanner inputs before reading bytes', () => {
    expect(() =>
      scanProductionBundleForVerificationProbe([
        { path: '../escape.js', contents: 'clean' },
      ])
    ).toThrow(ProductionVerificationProbeScanInputError);
    expect(() =>
      scanProductionBundleForVerificationProbe([
        { path: 'assets/index.js', contents: 'first' },
        { path: 'assets/index.js', contents: 'second' },
      ])
    ).toThrow(
      expect.objectContaining({
        code: 'duplicate-path',
        fileIndex: 1,
        duplicateOfIndex: 0,
      })
    );
    expect(() =>
      scanProductionBundleForVerificationProbe(
        [{ path: 'assets/index.js', contents: '12345' }],
        { maximumFileBytes: 4 }
      )
    ).toThrow(expect.objectContaining({ code: 'file-too-large' }));
    expect(() =>
      scanProductionBundleForVerificationProbe(
        [
          { path: 'assets/one.js', contents: '123' },
          { path: 'assets/two.js', contents: '456' },
        ],
        { maximumTotalBytes: 5 }
      )
    ).toThrow(expect.objectContaining({ code: 'bundle-too-large' }));
    expect(() =>
      scanProductionBundleForVerificationProbe(
        [{ path: 'assets/index.bin', contents: new Uint8Array(5) }],
        { maximumFileBytes: 4 }
      )
    ).toThrow(expect.objectContaining({ code: 'file-too-large' }));
    expect(() =>
      scanProductionBundleForVerificationProbe(
        [{ path: 'assets/one.js', contents: 'clean' }],
        { maximumFiles: 1, maximumFileBytes: 1, maximumTotalBytes: 1 }
      )
    ).toThrow(expect.objectContaining({ code: 'file-too-large' }));
  });

  it('accepts only exact plain data records and exact dense file arrays', () => {
    let fileGetterRead = false;
    const accessorFile = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(accessorFile, {
      path: {
        enumerable: true,
        get: () => {
          fileGetterRead = true;
          return 'assets/accessor.js';
        },
      },
      contents: { enumerable: true, value: 'clean' },
    });
    expect(() => scanUnknownProductionFiles([accessorFile])).toThrow(
      expect.objectContaining({ code: 'invalid-input', fileIndex: 0 })
    );
    expect(fileGetterRead).toBe(false);

    let optionGetterRead = false;
    const accessorOptions = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessorOptions, 'maximumFiles', {
      enumerable: true,
      get: () => {
        optionGetterRead = true;
        return 1;
      },
    });
    expect(() => scanUnknownProductionFiles([], accessorOptions)).toThrow(
      expect.objectContaining({ code: 'invalid-input' })
    );
    expect(optionGetterRead).toBe(false);

    let arrayGetterRead = false;
    const accessorFiles = [{ path: 'assets/index.js', contents: 'clean' }];
    Object.defineProperty(accessorFiles, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        arrayGetterRead = true;
        return { path: 'assets/index.js', contents: 'clean' };
      },
    });
    expect(() => scanUnknownProductionFiles(accessorFiles)).toThrow(
      expect.objectContaining({ code: 'invalid-input', fileIndex: 0 })
    );
    expect(arrayGetterRead).toBe(false);

    const symbol = Symbol('scanner-extra');
    const symbolFile = { path: 'assets/index.js', contents: 'clean' } as Record<
      PropertyKey,
      unknown
    >;
    symbolFile[symbol] = 'extra';
    const extraFiles = [{ path: 'assets/index.js', contents: 'clean' }];
    Object.defineProperty(extraFiles, 'extra', { value: true });
    const nonPlainFile = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    nonPlainFile.path = 'assets/index.js';
    nonPlainFile.contents = 'clean';
    for (const files of [
      [{ path: 'assets/index.js', contents: 'clean', extra: true }],
      [symbolFile],
      [nonPlainFile],
      extraFiles,
      new Proxy([], {
        ownKeys: () => {
          throw new Error('proxy-own-keys');
        },
      }),
    ]) {
      expect(() => scanUnknownProductionFiles(files)).toThrow(
        expect.objectContaining({ code: 'invalid-input' })
      );
    }

    const nullPrototypeFile = Object.assign(Object.create(null), {
      path: 'assets/null-prototype.js',
      contents: 'clean',
    });
    const nullPrototypeOptions = Object.assign(Object.create(null), {
      maximumFiles: 1,
    });
    expect(
      scanUnknownProductionFiles([nullPrototypeFile], nullPrototypeOptions)
    ).toEqual({ status: 'clean', findings: [] });
  });

  it('clones binary inputs before later traps can mutate them and rejects shared memory', () => {
    const markerBytes = new TextEncoder().encode(
      WORKSPACE_VERIFICATION_PROBE_CANARY
    );
    const mutableBytes = new Uint8Array(markerBytes.byteLength);
    const files = [
      { path: 'assets/mutable.bin', contents: mutableBytes },
      { path: 'assets/clean.js', contents: 'clean' },
    ];
    const racingFiles = new Proxy(files, {
      getOwnPropertyDescriptor: (target, property) => {
        if (property === '1') mutableBytes.set(markerBytes);
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    expect(scanUnknownProductionFiles(racingFiles)).toEqual({
      status: 'clean',
      findings: [],
    });
    expect(mutableBytes).toEqual(markerBytes);

    if (typeof SharedArrayBuffer !== 'undefined') {
      const sharedBytes = new Uint8Array(
        new SharedArrayBuffer(markerBytes.byteLength)
      );
      expect(() =>
        scanUnknownProductionFiles([
          { path: 'assets/shared.bin', contents: sharedBytes },
        ])
      ).toThrow(
        expect.objectContaining({ code: 'invalid-input', fileIndex: 0 })
      );
    }
  });

  it('rejects digest/revision drift and all credential or Secret-shaped input', () => {
    expect(() =>
      createWorkspaceVerificationProbeContribution(workspace, {
        ...verificationProfile,
        workspaceRevision: workspace.workspaceRev + 1,
      } as WorkspaceVerificationCompileProfile)
    ).toThrow(/exact Workspace revision/u);
    expect(() =>
      createWorkspaceVerificationProbeContribution(workspace, {
        ...verificationProfile,
        scenarioProgramDigest: 'sha256-not-canonical',
      } as WorkspaceVerificationCompileProfile)
    ).toThrow(/canonical sha256 digest/u);
    expect(() =>
      createWorkspaceVerificationProbeContribution(workspace, {
        ...verificationProfile,
        secret: 'must-not-be-read',
      } as WorkspaceVerificationCompileProfile)
    ).toThrow(WorkspaceVerificationCompileProfileError);

    let credentialGetterRead = false;
    const accessorProfile = { ...verificationProfile } as Record<
      string,
      unknown
    >;
    Object.defineProperty(accessorProfile, 'profileDigest', {
      enumerable: true,
      get: () => {
        credentialGetterRead = true;
        return digest('a');
      },
    });
    expect(() =>
      createWorkspaceVerificationProbeContribution(
        workspace,
        accessorProfile as WorkspaceVerificationCompileProfile
      )
    ).toThrow(/Accessor properties are not allowed/u);
    expect(credentialGetterRead).toBe(false);
  });

  it('rejects selector/source expansion and missing semantic sources', () => {
    expect(() =>
      createWorkspaceVerificationProbeContribution(workspace, {
        ...verificationProfile,
        targets: [
          {
            ...verificationProfile.targets[0]!,
            selector: '[data-testid="catalog"]',
          },
        ],
      } as WorkspaceVerificationCompileProfile)
    ).toThrow(/unknown or missing fields/u);
    expect(() =>
      createWorkspaceVerificationProbeContribution(workspace, {
        ...verificationProfile,
        targets: [
          {
            targetId: 'missing-target',
            readiness: ['mounted'],
            sourceRef: {
              workspaceDocumentId: 'page-catalog',
              path: '/nodesById/missing',
            },
          },
        ],
      })
    ).toThrow(/existing PIR nodesById/u);
  });
});
