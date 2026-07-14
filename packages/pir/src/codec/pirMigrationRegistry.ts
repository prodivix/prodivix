import { CURRENT_PIR_WIRE_VERSION } from './pirWire.generated';
import { PIR_WIRE_MIGRATION_V13_TO_V14 } from './pirWireMigrationV13ToV14';

export { CURRENT_PIR_WIRE_VERSION } from './pirWire.generated';

export type PIRWireSchemaVersion = string;

export type PIRWireMigration = Readonly<{
  fromVersion: PIRWireSchemaVersion;
  toVersion: PIRWireSchemaVersion;
  migrate: (wireDocument: unknown) => unknown;
}>;

export type PIRWireMigrationIssueCode =
  | 'PIR_WIRE_SCHEMA_VERSION_MISSING'
  | 'PIR_WIRE_SCHEMA_VERSION_UNSUPPORTED'
  | 'PIR_WIRE_MIGRATION_CYCLE'
  | 'PIR_WIRE_MIGRATION_FAILED'
  | 'PIR_WIRE_MIGRATION_VERSION_MISMATCH';

export type PIRWireMigrationIssue = Readonly<{
  code: PIRWireMigrationIssueCode;
  path: '$.version';
  message: string;
  schemaVersion?: string;
  cause?: unknown;
}>;

export type PIRWireUpgradeResult =
  | Readonly<{
      ok: true;
      value: unknown;
      sourceVersion: PIRWireSchemaVersion;
      targetVersion: PIRWireSchemaVersion;
      appliedMigrations: readonly Readonly<{
        fromVersion: PIRWireSchemaVersion;
        toVersion: PIRWireSchemaVersion;
      }>[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly PIRWireMigrationIssue[];
    }>;

export type PIRMigrationRegistry = Readonly<{
  currentVersion: PIRWireSchemaVersion;
  upgrade: (wireDocument: unknown) => PIRWireUpgradeResult;
}>;

export type CreatePIRMigrationRegistryInput = Readonly<{
  currentVersion: PIRWireSchemaVersion;
  migrations?: readonly PIRWireMigration[];
}>;

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readWireVersion = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  return typeof value.version === 'string' && value.version.trim()
    ? value.version
    : null;
};

const reject = (issue: PIRWireMigrationIssue): PIRWireUpgradeResult =>
  Object.freeze({ ok: false, issues: Object.freeze([issue]) });

/**
 * Creates an immutable schema-upgrade pipeline. Domain code never registers
 * migrations and only receives the current decoded PIR model.
 */
export const createPirMigrationRegistry = (
  input: CreatePIRMigrationRegistryInput
): PIRMigrationRegistry => {
  const currentVersion = input.currentVersion.trim();
  if (!currentVersion) {
    throw new TypeError('Current PIR wire schema version must be non-empty.');
  }

  const migrationsBySource = new Map<string, PIRWireMigration>();
  for (const migration of input.migrations ?? []) {
    const fromVersion = migration.fromVersion.trim();
    const toVersion = migration.toVersion.trim();
    if (!fromVersion || !toVersion || fromVersion === toVersion) {
      throw new TypeError(
        'PIR wire migration versions must be non-empty and distinct.'
      );
    }
    if (migrationsBySource.has(fromVersion)) {
      throw new TypeError(
        `Duplicate PIR wire migration source version "${fromVersion}".`
      );
    }
    migrationsBySource.set(
      fromVersion,
      Object.freeze({ ...migration, fromVersion, toVersion })
    );
  }

  return Object.freeze({
    currentVersion,
    upgrade(wireDocument) {
      const sourceVersion = readWireVersion(wireDocument);
      if (!sourceVersion) {
        return reject({
          code: 'PIR_WIRE_SCHEMA_VERSION_MISSING',
          path: '$.version',
          message: 'PIR wire document must declare a string schema version.',
        });
      }

      let value = wireDocument;
      let version = sourceVersion;
      const visited = new Set<string>();
      const appliedMigrations: Array<{
        fromVersion: string;
        toVersion: string;
      }> = [];

      while (version !== currentVersion) {
        if (visited.has(version)) {
          return reject({
            code: 'PIR_WIRE_MIGRATION_CYCLE',
            path: '$.version',
            message: `PIR wire migration cycle detected at schema "${version}".`,
            schemaVersion: version,
          });
        }
        visited.add(version);
        const migration = migrationsBySource.get(version);
        if (!migration) {
          return reject({
            code: 'PIR_WIRE_SCHEMA_VERSION_UNSUPPORTED',
            path: '$.version',
            message: `PIR wire schema "${version}" has no migration path to "${currentVersion}".`,
            schemaVersion: version,
          });
        }
        try {
          value = migration.migrate(value);
        } catch (cause) {
          const causeMessage =
            cause instanceof Error && cause.message.length > 0
              ? `: ${cause.message}`
              : '.';
          return reject({
            code: 'PIR_WIRE_MIGRATION_FAILED',
            path: '$.version',
            message: `PIR wire migration from "${version}" to "${migration.toVersion}" failed${causeMessage}`,
            schemaVersion: version,
            cause,
          });
        }
        const migratedVersion = readWireVersion(value);
        if (migratedVersion !== migration.toVersion) {
          return reject({
            code: 'PIR_WIRE_MIGRATION_VERSION_MISMATCH',
            path: '$.version',
            message: `PIR wire migration must emit schema "${migration.toVersion}".`,
            ...(migratedVersion ? { schemaVersion: migratedVersion } : {}),
          });
        }
        appliedMigrations.push({
          fromVersion: version,
          toVersion: migration.toVersion,
        });
        version = migration.toVersion;
      }

      return Object.freeze({
        ok: true,
        value,
        sourceVersion,
        targetVersion: currentVersion,
        appliedMigrations: Object.freeze(
          appliedMigrations.map((migration) => Object.freeze(migration))
        ),
      });
    },
  });
};

export const PIR_MIGRATION_REGISTRY = createPirMigrationRegistry({
  currentVersion: CURRENT_PIR_WIRE_VERSION,
  migrations: [PIR_WIRE_MIGRATION_V13_TO_V14],
});

export const upgradePirWireDocument = (
  wireDocument: unknown
): PIRWireUpgradeResult => PIR_MIGRATION_REGISTRY.upgrade(wireDocument);
