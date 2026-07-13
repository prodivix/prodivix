export type RuntimeExecutor<TContext, TResult> = (
  context: TContext
) => TResult | Promise<TResult>;

export class RuntimeExecutorNotFoundError extends Error {
  readonly executorKey: string;

  constructor(executorKey: string) {
    super(`Runtime executor is not registered: ${executorKey}`);
    this.name = 'RuntimeExecutorNotFoundError';
    this.executorKey = executorKey;
  }
}

export type RuntimeExecutorRegistry<TContext, TResult> = {
  register(
    key: string,
    executor: RuntimeExecutor<TContext, TResult>
  ): () => void;
  resolve(key: string): RuntimeExecutor<TContext, TResult> | undefined;
  execute(key: string, context: TContext): Promise<TResult>;
  listKeys(): string[];
};

const normalizeExecutorKey = (key: string): string => {
  const normalized = key.trim();
  if (!normalized) {
    throw new TypeError('Runtime executor key must not be empty.');
  }
  return normalized;
};

/**
 * Creates an instance-owned executor registry. Registrations never leak across
 * editor mounts, tests, runtimes, or concurrent execution providers.
 */
export const createRuntimeExecutorRegistry = <
  TContext,
  TResult,
>(): RuntimeExecutorRegistry<TContext, TResult> => {
  const executors = new Map<string, RuntimeExecutor<TContext, TResult>>();

  return {
    register: (key, executor) => {
      const normalized = normalizeExecutorKey(key);
      if (executors.has(normalized)) {
        throw new Error(
          `Runtime executor is already registered: ${normalized}`
        );
      }
      executors.set(normalized, executor);
      return () => {
        if (executors.get(normalized) === executor) {
          executors.delete(normalized);
        }
      };
    },
    resolve: (key) => executors.get(normalizeExecutorKey(key)),
    execute: async (key, context) => {
      const normalized = normalizeExecutorKey(key);
      const executor = executors.get(normalized);
      if (!executor) {
        throw new RuntimeExecutorNotFoundError(normalized);
      }
      return executor(context);
    },
    listKeys: () => [...executors.keys()].sort(),
  };
};
