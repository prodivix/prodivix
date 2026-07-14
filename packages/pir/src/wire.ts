export {
  CURRENT_PIR_WIRE_VERSION,
  PIR_MIGRATION_REGISTRY,
  createPirMigrationRegistry,
  upgradePirWireDocument,
  type CreatePIRMigrationRegistryInput,
  type PIRMigrationRegistry,
  type PIRWireMigration,
  type PIRWireMigrationIssue,
  type PIRWireMigrationIssueCode,
  type PIRWireSchemaVersion,
  type PIRWireUpgradeResult,
} from './codec/pirMigrationRegistry';
export type * from './codec/pirWire.generated';
export { projectPirPatchValueToWire } from './codec/pirCodec';
