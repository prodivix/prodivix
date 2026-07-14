import { createDiagnostic } from '@prodivix/diagnostics';
import { describe, expect, it } from 'vitest';
import {
  COD_DIAGNOSTIC_DEFINITIONS,
  createAuthoringDiagnosticProviderRegistry,
  createCodeArtifactProviderRegistry,
  createCodeSlotRegistry,
  createSemanticContributionProviderRegistry,
} from '.';
import type {
  AuthoringContext,
  AuthoringDiagnosticProvider,
  CodeArtifact,
  CodeArtifactProvider,
  CodeReference,
  CodeSlotContract,
  CodeSlotProvider,
  SemanticContributionProvider,
} from '.';

describe('authoring registries', () => {
  it('registers code artifacts by stable artifact identity', () => {
    const context: AuthoringContext = {
      surface: 'code-editor',
      artifactId: 'artifact-1',
    };
    const artifact: CodeArtifact = {
      id: 'artifact-1',
      path: '/src/actions/onClick.ts',
      language: 'ts',
      owner: { kind: 'workspace-module', documentId: 'artifact-1' },
      source: 'export const onClick = () => true;',
      revision: '7',
    };
    const provider: CodeArtifactProvider = {
      id: 'workspace-code',
      source: { kind: 'workspace' },
      listArtifacts: (input) =>
        input.artifactId === artifact.id ? [artifact] : [],
      getArtifact: (id) => (id === artifact.id ? artifact : null),
    };
    const registry = createCodeArtifactProviderRegistry();

    registry.register(provider);
    expect(registry.listArtifacts(context)).toEqual([artifact]);
    expect(registry.getArtifact(artifact.id)).toBe(artifact);

    registry.unregister(provider.id);
    expect(registry.listArtifacts(context)).toEqual([]);
  });

  it('keeps language diagnostics independent from presentation state', () => {
    const diagnostic = createDiagnostic({
      ...COD_DIAGNOSTIC_DEFINITIONS.COD_1001,
      message: 'Code parse failed.',
      sourceSpan: {
        artifactId: 'artifact-1',
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 4,
      },
    });
    const provider: AuthoringDiagnosticProvider = {
      id: 'typescript',
      source: { kind: 'code', artifactId: 'artifact-1' },
      getDiagnostics: (context) =>
        context.artifactId === 'artifact-1' ? [diagnostic] : [],
    };
    const registry = createAuthoringDiagnosticProviderRegistry();

    registry.register(provider);
    expect(
      registry.getDiagnostics({
        surface: 'code-editor',
        artifactId: 'artifact-1',
      })
    ).toEqual([diagnostic]);
    expect(registry.getDiagnostics({ surface: 'code-editor' })).toEqual([]);
  });

  it('queries code slots by stable owner reference', () => {
    const ownerRef = {
      kind: 'pir-node' as const,
      documentId: 'doc-1',
      nodeId: 'button-1',
    };
    const slot: CodeSlotContract = {
      id: 'blueprint.button-1.onClick',
      ownerRef,
      kind: 'event-handler',
      inputTypeRef: 'MouseEvent',
      outputTypeRef: 'void',
      capabilityIds: ['browser-event'],
      defaultPlacement: ['inspector', 'code-editor', 'issues-panel'],
    };
    const bindingProjection = {
      binding: {
        slotId: slot.id,
        reference: { artifactId: 'artifact-handler' },
      },
      ownerRef,
      semanticReferenceId: 'reference-handler',
    };
    const provider: CodeSlotProvider = {
      id: 'blueprint-slots',
      source: { kind: 'pir', documentId: 'doc-1' },
      listSlots: ({ targetRef }) =>
        targetRef?.kind === 'pir-node' ? [slot] : [],
      getSlot: (id) => (id === slot.id ? slot : null),
      listBindingProjections: ({ artifactId }) =>
        !artifactId || artifactId === 'artifact-handler'
          ? [bindingProjection]
          : [],
      getBindingProjection: (id) => (id === slot.id ? bindingProjection : null),
    };
    const registry = createCodeSlotRegistry();

    registry.register(provider);
    expect(registry.listSlotsByOwner(ownerRef)).toEqual([slot]);
    expect(registry.getSlot(slot.id)).toBe(slot);
    expect(registry.getBindingProjection(slot.id)).toBe(bindingProjection);
    expect(
      registry.listBindingProjectionsByArtifact('artifact-handler')
    ).toEqual([bindingProjection]);
  });

  it('uses artifact identity instead of a path in persisted code references', () => {
    const reference: CodeReference = {
      artifactId: 'code-open-dialog',
      exportName: 'openDialog',
      symbolId: 'export-open-dialog',
    };

    expect(reference).toEqual({
      artifactId: 'code-open-dialog',
      exportName: 'openDialog',
      symbolId: 'export-open-dialog',
    });
    expect('path' in reference).toBe(false);
  });

  it('composes semantic providers in stable descriptor order', () => {
    const registry = createSemanticContributionProviderRegistry();
    const createProvider = (id: string): SemanticContributionProvider => ({
      descriptor: { id, semanticVersion: '1' },
      contribute: () => ({}),
    });
    const providerB = createProvider('provider-b');
    const providerA = createProvider('provider-a');

    registry.register(providerB);
    registry.register(providerA);

    expect(
      registry.listProviders().map(({ descriptor }) => descriptor.id)
    ).toEqual(['provider-a', 'provider-b']);
    expect(
      registry.createIndex({
        workspaceRevisions: {
          workspaceId: 'workspace-1',
          workspaceRev: 1,
          routeRev: 1,
          opSeq: 1,
          documentRevs: {},
        },
        schemaVersion: 'semantic-v1',
      }).ok
    ).toBe(true);
    expect(() => registry.register(providerA)).toThrow(
      'Semantic provider "provider-a" is already registered.'
    );
  });
});
