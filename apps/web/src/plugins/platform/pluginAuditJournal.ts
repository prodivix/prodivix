import {
  pluginHostSuccess,
  type PluginAuditEvent,
  type PluginAuditSink,
} from '@prodivix/plugin-host';

const DEFAULT_MAX_PLUGIN_AUDIT_EVENTS = 1_000;

export type PluginAuditJournal = Readonly<{
  sink: PluginAuditSink;
  list(): readonly PluginAuditEvent[];
  clear(): void;
}>;

export const createPluginAuditJournal = (
  maxEvents = DEFAULT_MAX_PLUGIN_AUDIT_EVENTS
): PluginAuditJournal => {
  const limit =
    Number.isSafeInteger(maxEvents) && maxEvents > 0 ? maxEvents : 1;
  const events: PluginAuditEvent[] = [];

  return Object.freeze({
    sink: Object.freeze<PluginAuditSink>({
      append: async (input) => {
        events.push(...input);
        if (events.length > limit) events.splice(0, events.length - limit);
        return pluginHostSuccess(undefined);
      },
    }),
    list: () => Object.freeze([...events]),
    clear: () => events.splice(0, events.length),
  });
};
