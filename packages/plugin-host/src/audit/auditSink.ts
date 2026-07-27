import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import type {
  PluginAuditEvent,
  PluginAuditEventInput,
  PluginAuditSink,
} from '#host/audit/audit.types';
import type { PluginClock, PluginIdFactory } from '#host/host.types';

export type PluginAuditDispatcher = Readonly<{
  append(
    inputs: readonly PluginAuditEventInput[]
  ): Promise<readonly PluginDiagnostic[]>;
}>;

const createEvent = (
  input: PluginAuditEventInput,
  clock: PluginClock,
  idFactory: PluginIdFactory
): PluginAuditEvent =>
  Object.freeze({
    eventId: idFactory.createId('audit-event'),
    occurredAt: clock.now(),
    operationId: input.operationId,
    pluginId: input.owner.pluginId,
    pluginVersion: input.pluginVersion,
    installationId: input.owner.installationId,
    generation: input.owner.generation,
    permissionRevision: input.permissionRevision,
    registryRevision: input.registryRevision,
    category: input.category,
    action: input.action,
    outcome: input.outcome,
    capability: input.capability
      ? Object.freeze({ ...input.capability })
      : undefined,
    contribution: input.contribution
      ? Object.freeze({ ...input.contribution })
      : undefined,
    diagnosticCodes: input.diagnostics
      ? Object.freeze(input.diagnostics.map((diagnostic) => diagnostic.code))
      : undefined,
    durationMs: input.durationMs,
    packageDigest: input.packageDigest,
    runtimeArtifactPath: input.runtimeArtifactPath,
    runtimeArtifactDigest: input.runtimeArtifactDigest,
  });

export const createPluginAuditDispatcher = (
  sink: PluginAuditSink,
  clock: PluginClock,
  idFactory: PluginIdFactory
): PluginAuditDispatcher =>
  Object.freeze({
    append: async (inputs) => {
      if (inputs.length === 0) return [];
      let events: readonly PluginAuditEvent[];
      try {
        events = Object.freeze(
          inputs.map((input) => createEvent(input, clock, idFactory))
        );
      } catch {
        const first = inputs[0]!;
        return [
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.AUDIT_SINK_FAILED,
            'Plugin audit metadata could not be created.',
            {
              pluginId: first.owner.pluginId,
              pluginVersion: first.pluginVersion,
              installationId: first.owner.installationId,
              generation: first.owner.generation,
              operationId: first.operationId,
            }
          ),
        ];
      }

      try {
        const result = await sink.append(events);
        if (result.ok) return result.diagnostics;
      } catch {
        // A throwing sink is the same failure as a rejecting one: fall through to
        // the AUDIT_SINK_FAILED diagnostic below.
      }
      const first = inputs[0]!;
      return [
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.AUDIT_SINK_FAILED,
          'Plugin audit sink did not accept the lifecycle event batch.',
          {
            pluginId: first.owner.pluginId,
            pluginVersion: first.pluginVersion,
            installationId: first.owner.installationId,
            generation: first.owner.generation,
            operationId: first.operationId,
          }
        ),
      ];
    },
  });
