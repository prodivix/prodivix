import type { ProjectSummary } from './editorApi';
import type { LocalProjectCatalogRecord } from './localProjectStore';

export type ProjectHomeItem = ProjectSummary & {
  source: 'remote' | 'local';
  localRecord?: LocalProjectCatalogRecord;
};

export type ProjectBusyState =
  'publishing' | 'deleting' | 'renaming' | 'syncing' | 'duplicating';
