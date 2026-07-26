import type { TargetAdapter } from '#src/core/adapter';

/**
 * The controlled Vue/Vite target resolves native element types only.
 *
 * `@prodivix/ui` and the official antd/mui/radix plugins are React packages,
 * so a PIR document that names one of their components has no Vue counterpart
 * to import. That is a real capability gap, and it is reported as a compile
 * diagnostic rather than silently emitted as an unknown custom element — the
 * previous runtime interpreter passed `node.type` straight to `h()`, which
 * rendered nothing and produced no diagnostic at all.
 */
export const vueAdapter: TargetAdapter = {
  id: 'vue-default',
  resolveNode: (node) => {
    if (node.type === 'container') return { element: 'div' };
    if (/^[A-Z]/.test(node.type)) {
      return {
        element: 'div',
        diagnostics: [
          {
            code: 'WKS-EXPORT-VUE-COMPONENT-UNSUPPORTED',
            severity: 'error',
            source: 'export',
            message: `Element ${node.type} has no controlled Vue/Vite implementation; the Vue target resolves native elements only.`,
            path: node.path,
          },
        ],
      };
    }
    return { element: node.type || 'div' };
  },
};
