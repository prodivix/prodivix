import type { TargetAdapter } from '@/pir/generator/core/adapter';
import { reactAdapter } from './adapter';

export interface AntdReactAdapterOptions {
  typePrefix?: string;
  fallbackAdapter?: TargetAdapter;
}

const stripPrefix = (type: string, prefix: string) =>
  type.startsWith(prefix) ? type.slice(prefix.length) : null;

export const createAntdReactAdapter = (
  options?: AntdReactAdapterOptions
): TargetAdapter => {
  const prefix = options?.typePrefix ?? 'Antd';
  const fallback = options?.fallbackAdapter ?? reactAdapter;

  return {
    id: `react-antd-${prefix.toLowerCase()}`,
    resolveNode: (node) => {
      const bareType = stripPrefix(node.type, prefix);
      if (!bareType) return fallback.resolveNode(node);

      if (bareType === 'Button') {
        return {
          element: 'Button',
          imports: [
            {
              source: 'antd',
              kind: 'named',
              imported: 'Button',
            },
          ],
        };
      }

      if (bareType === 'Input') {
        return {
          element: 'Input',
          imports: [
            {
              source: 'antd',
              kind: 'named',
              imported: 'Input',
            },
          ],
        };
      }

      if (bareType === 'Modal') {
        return {
          element: 'Modal',
          imports: [
            {
              source: 'antd',
              kind: 'named',
              imported: 'Modal',
            },
          ],
        };
      }

      if (bareType === 'FormItem') {
        return {
          element: 'Form.Item',
          imports: [
            {
              source: 'antd',
              kind: 'named',
              imported: 'Form',
            },
          ],
        };
      }

      return {
        element: 'div',
        diagnostics: [
          {
            code: 'REACT_ADAPTER_UNKNOWN_ANTD_COMPONENT',
            severity: 'warning',
            source: 'adapter',
            message: `No Ant Design mapping found for "${node.type}".`,
            path: node.path,
            suggestion:
              'Use AntdButton/AntdInput/AntdModal/AntdFormItem or extend createAntdReactAdapter.',
          },
        ],
      };
    },
  };
};

export const antdReactAdapter = createAntdReactAdapter();
