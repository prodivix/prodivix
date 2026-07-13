import type { ExportImportIntent } from '#src/export/types';

const renderNamedImport = (intent: ExportImportIntent) => {
  if (!intent.imported) return '';
  if (intent.local && intent.local !== intent.imported) {
    return `${intent.imported} as ${intent.local}`;
  }
  return intent.imported;
};

export const renderExportImportIntent = (
  intent: ExportImportIntent
): string => {
  if (intent.kind === 'asset-url' && (intent.local || intent.imported)) {
    return `import ${intent.local ?? intent.imported} from '${intent.source}';`;
  }
  if (intent.kind === 'side-effect' || intent.kind === 'asset-url') {
    return `import '${intent.source}';`;
  }
  if (intent.kind === 'default') {
    return `import ${intent.local ?? intent.imported} from '${intent.source}';`;
  }
  if (intent.kind === 'namespace') {
    return `import * as ${intent.local ?? intent.imported} from '${intent.source}';`;
  }
  return `import { ${renderNamedImport(intent)} } from '${intent.source}';`;
};

export const dedupeExportImportIntents = (
  intents: ExportImportIntent[]
): ExportImportIntent[] => {
  const byKey = new Map<string, ExportImportIntent>();
  intents.forEach((intent) => {
    const key = [
      intent.kind,
      intent.targetModuleId ?? '',
      intent.source,
      intent.imported ?? '',
      intent.local ?? '',
    ].join(':');
    byKey.set(key, intent);
  });
  return Array.from(byKey.values()).sort((a, b) =>
    renderExportImportIntent(a).localeCompare(renderExportImportIntent(b))
  );
};
