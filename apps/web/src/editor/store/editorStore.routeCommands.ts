import type { WorkspaceCommandEnvelope } from '@/workspace';
import type { RouteIntent, WorkspaceRouteManifest } from './editorStore.types';

const routeCommandTypeByIntent: Record<RouteIntent['type'], string> = {
  'create-page': 'route.create-page',
  'create-index': 'route.create-index',
  'create-child-route': 'route.create-child',
  'rename-segment': 'route.rename-segment',
  'move-route': 'route.move',
  'attach-layout': 'route.attach-layout',
  'detach-layout': 'route.detach-layout',
  'bind-outlet': 'route.bind-outlet',
  'unbind-outlet': 'route.unbind-outlet',
  'set-runtime-ref': 'route.set-runtime-ref',
  'delete-route': 'route.delete',
};

const getIntentRouteNodeId = (intent: RouteIntent): string | undefined => {
  if ('routeNodeId' in intent) return intent.routeNodeId;
  return undefined;
};

export type CreateRouteIntentCommandInput = {
  workspaceId: string;
  commandId: string;
  issuedAt: string;
  intent: RouteIntent;
  before: WorkspaceRouteManifest;
  after: WorkspaceRouteManifest;
};

export const createRouteIntentCommand = ({
  workspaceId,
  commandId,
  issuedAt,
  intent,
  before,
  after,
}: CreateRouteIntentCommandInput): WorkspaceCommandEnvelope => ({
  id: commandId,
  namespace: 'core.route',
  type: routeCommandTypeByIntent[intent.type],
  version: '1.0',
  issuedAt,
  forwardOps: [
    {
      op: 'replace',
      path: '/routeManifest',
      value: after,
    },
  ],
  reverseOps: [
    {
      op: 'replace',
      path: '/routeManifest',
      value: before,
    },
  ],
  target: {
    workspaceId,
    ...(getIntentRouteNodeId(intent)
      ? { routeNodeId: getIntentRouteNodeId(intent) }
      : {}),
  },
  domainHint: 'route',
});
