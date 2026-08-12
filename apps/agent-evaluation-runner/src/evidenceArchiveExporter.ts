import {
  createAgentModelEvaluationEvidenceArchiveAttestation,
  createAgentModelEvaluationEvidenceArchiveAttestationPayload,
  createAgentModelEvaluationEvidenceArchivePhysicalBudget,
  createAgentModelEvaluationEvidenceRoot,
  digestAgentCanonicalBytes,
  isAgentEvaluationProductionRunConfigArtifactBinding,
  isAgentCanonicalDigest,
  isAgentModelEvaluationEvidenceRoot,
  verifyAgentModelEvaluationEvidenceArchiveAttestation,
  type AgentModelEvaluationEvidenceArchiveAttestation,
  type AgentModelEvaluationEvidenceArchiveAttestationPayload,
  type AgentEvaluationProductionRunConfigArtifactBinding,
  type AgentModelEvaluationEvidenceIndex,
  type AgentModelEvaluationEvidenceArchiveSource,
  type AgentModelEvaluationEvidenceRoot,
  type AgentModelEvaluationManifest,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { AgentEvaluationEvidenceArchiveAssembler } from './evidenceArchive';

export interface AgentEvaluationEvidenceArchiveSourceFactory {
  open(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      manifest: AgentModelEvaluationManifest;
      runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
      sourceConfigDigest: string;
      frozenRunDigest: string;
    }>
  ): Promise<AgentModelEvaluationEvidenceArchiveSource>;
}

export type AgentEvaluationEvidenceArchiveSourceConfigBinding = Readonly<{
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: string;
  frozenRunDigest: string;
}>;

export interface AgentEvaluationEvidenceArchiveSourceConfigBindingSource {
  load(
    input: Readonly<{ plan: AgentModelEvaluationPlan }>
  ): Promise<AgentEvaluationEvidenceArchiveSourceConfigBinding>;
}

export type AgentEvaluationEvidenceArchiveSignerIdentity = Readonly<{
  authorityId: string;
  keyId: string;
  publicKeyBase64Url: string;
}>;

export interface AgentEvaluationEvidenceArchiveSigner {
  identity():
    | AgentEvaluationEvidenceArchiveSignerIdentity
    | Promise<AgentEvaluationEvidenceArchiveSignerIdentity>;
  signArchive(
    input: Readonly<{
      payload: AgentModelEvaluationEvidenceArchiveAttestationPayload;
      message: Uint8Array;
    }>
  ): Promise<string>;
  verify(
    input: Readonly<{
      publicKeyBase64Url: string;
      signatureBase64Url: string;
      message: Uint8Array;
    }>
  ): boolean | Promise<boolean>;
}

export interface AgentEvaluationEvidenceArchiveSignerFactory {
  create(
    input: Readonly<{ plan: AgentModelEvaluationPlan }>
  ):
    | AgentEvaluationEvidenceArchiveSigner
    | Promise<AgentEvaluationEvidenceArchiveSigner>;
}

/** Backend must persist both facts atomically with exact replay semantics. */
export interface AgentEvaluationEvidenceArchiveClosureRepository {
  putArchiveClosure(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      evidenceIndex: AgentModelEvaluationEvidenceIndex;
      archiveAttestation: AgentModelEvaluationEvidenceArchiveAttestation;
      root: AgentModelEvaluationEvidenceRoot;
    }>
  ): Promise<void>;
}

export interface AgentEvaluationEvidenceArchiveRootFiles {
  createCanonicalJson(path: string, value: unknown): Promise<void>;
}

export type AgentEvaluationEvidenceArchiveExportInput = Readonly<{
  plan: AgentModelEvaluationPlan;
  manifest: AgentModelEvaluationManifest;
  archiveOutputPath: string;
  rootOutputPath: string;
}>;

export interface AgentEvaluationEvidenceArchiveExporter {
  export(
    input: AgentEvaluationEvidenceArchiveExportInput
  ): Promise<AgentModelEvaluationEvidenceRoot>;
}

const assertSourceBindings = (
  input: AgentEvaluationEvidenceArchiveExportInput,
  binding: AgentEvaluationEvidenceArchiveSourceConfigBinding,
  source: AgentModelEvaluationEvidenceArchiveSource
): void => {
  if (
    !isAgentEvaluationProductionRunConfigArtifactBinding(
      binding.runConfigArtifactBinding
    ) ||
    !isAgentCanonicalDigest(binding.sourceConfigDigest) ||
    !isAgentCanonicalDigest(binding.frozenRunDigest) ||
    !sameCanonicalJson(
      source.commitments.runConfigArtifactBinding,
      binding.runConfigArtifactBinding
    ) ||
    source.commitments.sourceConfigDigest !== binding.sourceConfigDigest ||
    source.commitments.frozenRunDigest !== binding.frozenRunDigest ||
    source.commitments.planDigest !== input.plan.planDigest ||
    source.commitments.repositoryCommit !== input.plan.repositoryCommit ||
    source.commitments.evaluationManifestDigest !==
      input.manifest.manifestDigest ||
    binding.runConfigArtifactBinding.sourceConfigDigest !==
      binding.sourceConfigDigest ||
    binding.runConfigArtifactBinding.frozenRunDigest !==
      binding.frozenRunDigest ||
    binding.runConfigArtifactBinding.planDigest !== input.plan.planDigest ||
    binding.runConfigArtifactBinding.repositoryCommit !==
      input.plan.repositoryCommit
  ) {
    throw new TypeError(
      'Evidence archive source partition binding is invalid.'
    );
  }
};

/**
 * Streams into exclusive staging, signs and durably commits its exact raw
 * index binding, then atomically publishes the archive and standalone root.
 */
export const createAgentEvaluationEvidenceArchiveExporter = (
  input: Readonly<{
    sourceFactory: AgentEvaluationEvidenceArchiveSourceFactory;
    sourceConfigBindingSource: AgentEvaluationEvidenceArchiveSourceConfigBindingSource;
    assembler: AgentEvaluationEvidenceArchiveAssembler;
    signerFactory: AgentEvaluationEvidenceArchiveSignerFactory;
    repository: AgentEvaluationEvidenceArchiveClosureRepository;
    rootFiles: AgentEvaluationEvidenceArchiveRootFiles;
    now: () => string;
  }>
): AgentEvaluationEvidenceArchiveExporter =>
  Object.freeze({
    export: async (command: AgentEvaluationEvidenceArchiveExportInput) => {
      const sourceConfigBinding = await input.sourceConfigBindingSource.load({
        plan: command.plan,
      });
      const source = await input.sourceFactory.open({
        plan: command.plan,
        manifest: command.manifest,
        ...sourceConfigBinding,
      });
      assertSourceBindings(command, sourceConfigBinding, source);
      const signer = await input.signerFactory.create({ plan: command.plan });
      const identity = await signer.identity();
      const assembly = await input.assembler.assemble({
        source,
        archiveOutputPath: command.archiveOutputPath,
        beforePublish: async (staged) => {
          const index = staged.index;
          if (
            !sameCanonicalJson(
              index.runConfigArtifactBinding,
              sourceConfigBinding.runConfigArtifactBinding
            ) ||
            index.sourceConfigDigest !==
              sourceConfigBinding.sourceConfigDigest ||
            index.frozenRunDigest !== sourceConfigBinding.frozenRunDigest ||
            index.planDigest !== command.plan.planDigest ||
            index.repositoryCommit !== command.plan.repositoryCommit ||
            index.evaluationManifestDigest !== command.manifest.manifestDigest
          ) {
            throw new TypeError(
              'Evidence archive index partition binding is invalid.'
            );
          }
          const payload =
            createAgentModelEvaluationEvidenceArchiveAttestationPayload({
              authorityId: identity.authorityId,
              keyId: identity.keyId,
              exportLeaseId: index.exportLeaseId,
              exportLeaseDigest: index.exportLeaseDigest,
              runConfigArtifactBinding: index.runConfigArtifactBinding,
              sourceConfigDigest: index.sourceConfigDigest,
              frozenRunDigest: index.frozenRunDigest,
              planDigest: index.planDigest,
              repositoryCommit: index.repositoryCommit,
              evidenceSetDigest: index.evidenceSetDigest,
              bundleDigest: index.bundleDigest,
              authorityPayloadDigest: index.authorityPayloadDigest,
              authorityAttestationDigest: index.authorityAttestationDigest,
              authorityRoots: index.authorityRoots,
              ...(index.reviewLeaseDigest === undefined
                ? {}
                : { reviewLeaseDigest: index.reviewLeaseDigest }),
              evaluationManifestDigest: index.evaluationManifestDigest,
              indexDigest: index.indexDigest,
              evidenceIndexArtifactDigest: digestAgentCanonicalBytes(
                staged.indexBytes
              ),
              evidenceIndexArtifactSize: staged.indexBytes.byteLength,
              shardSetDigest: index.shardSetDigest,
              totalShardBytes: index.totalShardBytes,
              totalRecordCount: index.totalRecordCount,
              issuedAt: input.now(),
            });
          const message = new TextEncoder().encode(canonicalJsonText(payload));
          const signature = await signer.signArchive({ payload, message });
          const archiveAttestation =
            createAgentModelEvaluationEvidenceArchiveAttestation({
              ...payload,
              signature,
            });
          const verified =
            await verifyAgentModelEvaluationEvidenceArchiveAttestation(
              archiveAttestation,
              {
                trustedPublicKeys: Object.freeze([
                  Object.freeze({
                    keyId: identity.keyId,
                    publicKeyBase64Url: identity.publicKeyBase64Url,
                  }),
                ]),
                verifyEd25519: ({
                  publicKeyBase64Url,
                  signatureBase64Url,
                  message: signedMessage,
                }) =>
                  signer.verify({
                    publicKeyBase64Url,
                    signatureBase64Url,
                    message: signedMessage,
                  }),
              }
            );
          if (!verified) {
            throw new TypeError(
              'Evidence archive attestation signature is invalid.'
            );
          }
          const root = createAgentModelEvaluationEvidenceRoot({
            index,
            evidenceIndexArtifactBytes: staged.indexBytes,
            archiveAttestation,
          });
          if (!isAgentModelEvaluationEvidenceRoot(root)) {
            throw new TypeError('Evidence archive root is invalid.');
          }
          createAgentModelEvaluationEvidenceArchivePhysicalBudget({
            familyUsages: staged.physicalFamilyUsages,
            indexBytes: staged.indexBytes.byteLength,
            rootBytes: new TextEncoder().encode(canonicalJsonText(root))
              .byteLength,
          });
          await input.repository.putArchiveClosure({
            plan: command.plan,
            evidenceIndex: index,
            archiveAttestation,
            root,
          });
          return root;
        },
      });
      const root = assembly.publicationValue;
      await input.rootFiles.createCanonicalJson(command.rootOutputPath, root);
      return root;
    },
  });
