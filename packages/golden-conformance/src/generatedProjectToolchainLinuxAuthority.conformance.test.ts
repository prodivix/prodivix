import { describe, expect, it } from 'vitest';
import { decodeGoldenControlledStaticRootlessAuthority } from './generatedProjectToolchainLinuxAuthority';
import {
  createFixture,
  digest,
  goldenRootlessToolchain,
  requestDigest,
  snapshotDigest,
  withAuthorityDigest,
} from './generatedProjectToolchainLinuxAuthority.testSupport';

type RootlessFixture = ReturnType<typeof createFixture>;
type MutableAuthority = Record<string, unknown>;

const authorityRecord = (value: unknown): MutableAuthority =>
  value as MutableAuthority;

const authorityList = (value: unknown): readonly unknown[] =>
  value as readonly unknown[];

const rehashAuthority = (value: unknown): Readonly<MutableAuthority> => {
  const base = { ...authorityRecord(value) };
  delete base.authorityDigest;
  return withAuthorityDigest(Object.freeze(base));
};

const decodeFixture = (fixture: RootlessFixture) =>
  decodeGoldenControlledStaticRootlessAuthority({
    isolationAuthority: fixture.isolationAuthority,
    processTree: fixture.processTree,
    commands: fixture.commands,
    requestDigest,
    snapshotDigest,
    toolchain: goldenRootlessToolchain,
  });

const replaceStage = (
  fixture: RootlessFixture,
  ordinal: number,
  replace: (
    stage: Readonly<MutableAuthority>,
    fixture: RootlessFixture
  ) => Readonly<MutableAuthority>
): RootlessFixture => {
  const isolation = authorityRecord(fixture.isolationAuthority);
  const provider = authorityRecord(isolation.providerProcess);
  const stages = [...authorityList(provider.stages)];
  stages[ordinal] = replace(authorityRecord(stages[ordinal]), fixture);

  const replacementStage = authorityRecord(stages[ordinal]);
  const replacementCleanup = authorityRecord(replacementStage.cleanup);
  const aggregate = authorityRecord(provider.aggregateStageAuthority);
  const aggregateStages = authorityList(aggregate.stages).map((stage, index) =>
    index === ordinal
      ? Object.freeze({
          ...authorityRecord(stage),
          stageAuthorityDigest: replacementStage.authorityDigest,
          cleanupAuthorityDigest: replacementCleanup.authorityDigest,
        })
      : stage
  );
  const normalizedAggregate = rehashAuthority({
    ...aggregate,
    stages: Object.freeze(aggregateStages),
  });
  const normalizedProvider = rehashAuthority({
    ...provider,
    stages: Object.freeze(stages),
    aggregateStageAuthority: normalizedAggregate,
  });
  const processTree = authorityRecord(fixture.processTree);
  const normalizedTree = rehashAuthority({
    ...processTree,
    stages: Object.freeze(
      stages.map((stage) => authorityRecord(stage).cleanup)
    ),
  });

  return Object.freeze({
    ...fixture,
    isolationAuthority: Object.freeze({
      ...isolation,
      providerProcess: normalizedProvider,
    }),
    processTree: normalizedTree,
  }) as RootlessFixture;
};

describe('Golden controlled static rootless authority', () => {
  it('independently rebuilds the package, six stages, aggregate, and cleanup chain', () => {
    const decoded = decodeFixture(createFixture());
    const provider = authorityRecord(
      authorityRecord(decoded.isolationAuthority).providerProcess
    );

    expect(provider).toMatchObject({
      format: 'prodivix.controlled-static-rootless-provider-stage-authority.v1',
      stageOrder: [
        'version',
        'install',
        'isolation',
        'typecheck',
        'build',
        'test',
      ],
    });
    expect(decoded.processTree).toMatchObject({
      directCommandCount: 6,
      activeContainerCount: 0,
      activeProcessCount: 0,
      activeWorkspaceCount: 0,
      cleanupVerified: true,
    });
  });

  it('rejects a full-rehash package import producer forgery', () => {
    const fixture = createFixture();
    const isolation = authorityRecord(fixture.isolationAuthority);
    const provider = authorityRecord(isolation.providerProcess);
    const packageImport = rehashAuthority({
      ...authorityRecord(provider.packageImportAuthority),
      producerStage: 'build',
    });
    const forgedProvider = rehashAuthority({
      ...provider,
      packageImportAuthority: packageImport,
    });
    const forged = Object.freeze({
      ...fixture,
      isolationAuthority: Object.freeze({
        ...isolation,
        providerProcess: forgedProvider,
      }),
    }) as RootlessFixture;

    expect(() => decodeFixture(forged)).toThrow(/package|producer/u);
  });

  it('rejects stage reordering even when the provider envelope is rehashed', () => {
    const fixture = createFixture();
    const isolation = authorityRecord(fixture.isolationAuthority);
    const provider = authorityRecord(isolation.providerProcess);
    const stages = [...authorityList(provider.stages)];
    [stages[4], stages[5]] = [stages[5], stages[4]];
    const forgedProvider = rehashAuthority({
      ...provider,
      stages: Object.freeze(stages),
    });
    const forged = Object.freeze({
      ...fixture,
      isolationAuthority: Object.freeze({
        ...isolation,
        providerProcess: forgedProvider,
      }),
    }) as RootlessFixture;

    expect(() => decodeFixture(forged)).toThrow(/build|stage|ordinal/u);
  });

  it('rejects package authority before the install handoff', () => {
    const fixture = replaceStage(createFixture(), 0, (stage, original) => {
      const provider = authorityRecord(
        authorityRecord(original.isolationAuthority).providerProcess
      );
      const packageImport = authorityRecord(provider.packageImportAuthority);
      return rehashAuthority({
        ...stage,
        packageImportDigest: packageImport.authorityDigest,
      });
    });

    expect(() => decodeFixture(fixture)).toThrow(/version|package|stage/u);
  });

  it('rejects a full-rehash stage result allowlist escape', () => {
    const fixture = replaceStage(createFixture(), 3, (stage) =>
      rehashAuthority({
        ...stage,
        resultAllowlist: Object.freeze(['escaped-result']),
      })
    );

    expect(() => decodeFixture(fixture)).toThrow(/allowlist|stage/u);
  });

  it('rejects a forged outer cleanup despite an inner clean self-report', () => {
    const fixture = replaceStage(createFixture(), 3, (stage) => {
      const cleanup = rehashAuthority({
        ...authorityRecord(stage.cleanup),
        residualProcessCount: 1,
      });
      return rehashAuthority({ ...stage, cleanup });
    });

    expect(() => decodeFixture(fixture)).toThrow(/cleanup|residual/u);
  });

  it('rejects an aggregate provider file-set drift', () => {
    const fixture = createFixture();
    const forged = Object.freeze({
      ...fixture,
      isolationAuthority: Object.freeze({
        ...fixture.isolationAuthority,
        providerFileSetDigest: digest('forged-provider-file-set'),
      }),
    }) as RootlessFixture;

    expect(() => decodeFixture(forged)).toThrow(/file-set/u);
  });
});
