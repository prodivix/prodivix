import type { ProjectSummary } from './editorApi';
import type { LocalProjectRecord } from './localProjectStore';

export type ProjectHomeItem = ProjectSummary & {
  source: 'remote' | 'local';
  localRecord?: LocalProjectRecord;
};

export type ProjectBusyState =
  | 'publishing'
  | 'deleting'
  | 'renaming'
  | 'syncing'
  | 'duplicating';
