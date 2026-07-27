import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_IN } from '../nodeCatalogConstants';

export const realtimeFilesNodeCatalog: NodeCatalogItem[] = [
  {
    kind: 'webSocket',
    label: 'WebSocket',
    icon: '○',
    groupId: 'realtime-files',
    groupLabel: 'Real-time & Files',
    ports: {
      controlIn: 'in.control.connect',
      dataIn: 'in.data.url',
      dataOut: 'out.data.message',
      controlOut: 'out.control.open',
    },
    defaults: {
      autoReconnect: 'true',
      reconnectMs: '1500',
      heartbeatMs: '30000',
      protocols: '',
      value: 'wss://echo.websocket.events',
    },
  },
  {
    kind: 'uploadFile',
    label: 'Upload File',
    icon: '○',
    groupId: 'realtime-files',
    groupLabel: 'Real-time & Files',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.file',
      dataOut: 'out.data.response',
      controlOut: 'out.control.success',
    },
    defaults: {
      endpoint: '/api/upload',
      method: 'POST',
      fieldName: 'file',
      accept: '*/*',
      maxSizeMB: '10',
    },
  },
  {
    kind: 'download',
    label: 'Download',
    icon: '○',
    groupId: 'realtime-files',
    groupLabel: 'Real-time & Files',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.url',
      controlOut: 'out.control.done',
    },
    defaults: {
      filename: 'download.bin',
      mimeType: 'application/octet-stream',
      openMode: 'save',
    },
  },
];
