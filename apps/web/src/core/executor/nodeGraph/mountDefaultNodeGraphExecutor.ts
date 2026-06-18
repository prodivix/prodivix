import type { PIRDocument } from '@prodivix/shared/types/pir';
import {
  registerGraphExecutionHandler,
  type GraphExecutionRequest,
} from '@/core/executor/executor';
import { executePirNodeGraph } from '@/core/executor/nodeGraph/nodeGraphExecutor';

type MountDefaultNodeGraphExecutorOptions = {
  getPirDoc: () => PIRDocument;
};

/**
 * 默认节点图执行器挂载链路：
 * executeGraph bridge -> default graph handler -> PIR graph executor。
 */
export const mountDefaultNodeGraphExecutor = ({
  getPirDoc,
}: MountDefaultNodeGraphExecutorOptions) =>
  registerGraphExecutionHandler('*', (request: GraphExecutionRequest) =>
    executePirNodeGraph(getPirDoc(), request)
  );
