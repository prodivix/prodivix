import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import type {
  AnimationCompositionProgram,
  AnimationCompositionProgramBundle,
} from './animationCompositionCompiler';
import {
  executeAnimationCompositionProgram,
  type AnimationCompositionCancellationSignal,
  type AnimationCompositionExecutionResult,
  type AnimationCompositionRuntimePort,
} from './animationCompositionRuntime';
import type { AnimationMotionMode } from './animation.types';

export type AnimationExecutionSurface = 'preview' | 'export' | 'ci';

export type AnimationCompositionArtifact = Readonly<{
  mediaType: 'application/vnd.prodivix.animation-composition+json';
  text: string;
  digest: string;
}>;

export type AnimationSurfaceRuntimeAdapter = Readonly<{
  surface: AnimationExecutionSurface;
  adapterId: string;
  materialize(
    bundle: AnimationCompositionProgramBundle
  ): AnimationCompositionArtifact;
  invoke(
    input: Readonly<{
      bundle: AnimationCompositionProgramBundle;
      motionMode: AnimationMotionMode;
      runtime: AnimationCompositionRuntimePort;
      signal: AnimationCompositionCancellationSignal;
      instanceId: string;
      generation: string;
      animationDocumentId: string;
      targetDocumentId: string;
    }>
  ): Promise<
    Readonly<{
      surface: AnimationExecutionSurface;
      adapterId: string;
      artifactDigest: string;
      programDigest: string;
      result: AnimationCompositionExecutionResult;
    }>
  >;
}>;

const digest = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

const verifyProgram = (program: AnimationCompositionProgram): void => {
  const { programDigest: _programDigest, ...unsigned } = program;
  if (digest(unsigned) !== program.programDigest) {
    throw new TypeError(
      'Animation surface adapter rejected a Program digest mismatch.'
    );
  }
};

const verifyBundle = (bundle: AnimationCompositionProgramBundle): void => {
  if (
    bundle.compositionId !== bundle.full.compositionId ||
    bundle.compositionId !== bundle.reduced.compositionId
  ) {
    throw new TypeError(
      'Animation surface adapter rejected a composition identity mismatch.'
    );
  }
  verifyProgram(bundle.full);
  verifyProgram(bundle.reduced);
};

export const createAnimationSurfaceRuntimeAdapter = (
  surface: AnimationExecutionSurface
): AnimationSurfaceRuntimeAdapter => {
  const adapterId =
    surface === 'preview'
      ? 'animation.preview.browser'
      : surface === 'export'
        ? 'animation.export.snapshot'
        : 'animation.ci.verification';
  const materialize = (
    bundle: AnimationCompositionProgramBundle
  ): AnimationCompositionArtifact => {
    verifyBundle(bundle);
    const text = canonicalJsonText(bundle);
    return Object.freeze({
      mediaType: 'application/vnd.prodivix.animation-composition+json' as const,
      text,
      digest: digest(bundle),
    });
  };
  return Object.freeze({
    surface,
    adapterId,
    materialize,
    async invoke(input) {
      const artifact = materialize(input.bundle);
      const bundle =
        surface === 'preview'
          ? input.bundle
          : (JSON.parse(artifact.text) as AnimationCompositionProgramBundle);
      verifyBundle(bundle);
      const program = bundle[input.motionMode];
      return Object.freeze({
        surface,
        adapterId,
        artifactDigest: artifact.digest,
        programDigest: program.programDigest,
        result: await executeAnimationCompositionProgram({
          program,
          runtime: input.runtime,
          signal: input.signal,
          instanceId: input.instanceId,
          generation: input.generation,
          animationDocumentId: input.animationDocumentId,
          targetDocumentId: input.targetDocumentId,
        }),
      });
    },
  });
};
