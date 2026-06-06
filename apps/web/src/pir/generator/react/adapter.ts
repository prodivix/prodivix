import type { TargetAdapter } from '@/pir/generator/core/adapter';

const toPascalCase = (value: string) =>
  value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const readIconRef = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const iconRef = value as Record<string, unknown>;
  const provider =
    typeof iconRef.provider === 'string' ? iconRef.provider.trim() : '';
  const name = typeof iconRef.name === 'string' ? iconRef.name.trim() : '';
  if (!provider || !name) return null;
  const variant = iconRef.variant === 'solid' ? 'solid' : 'outline';
  return { provider, name, variant };
};

const toFontAwesomeSymbol = (iconName: string) => {
  const normalized = iconName.trim().replace(/^fa[-_]?/i, '');
  const pascal = toPascalCase(normalized);
  if (!pascal) return null;
  return `fa${pascal}`;
};

export const reactAdapter: TargetAdapter = {
  id: 'react-default',
  resolveNode: (node) => {
    if (node.type === 'container') {
      return { element: 'div' };
    }

    if (node.type === 'PdxIcon') {
      const iconRef = readIconRef(node.props?.iconRef);
      if (!iconRef) {
        return {
          element: node.type,
          imports: [
            {
              source: '@prodivix/ui',
              kind: 'named',
              imported: node.type,
            },
          ],
        };
      }

      if (iconRef.provider === 'ant-design-icons') {
        const symbol = toPascalCase(iconRef.name);
        if (symbol) {
          return {
            element: symbol,
            imports: [
              {
                source: '@ant-design/icons',
                kind: 'named',
                imported: symbol,
              },
            ],
          };
        }
      }

      if (iconRef.provider === 'mui-icons') {
        const symbol = toPascalCase(iconRef.name);
        if (symbol) {
          return {
            element: symbol,
            imports: [
              {
                source: `@mui/icons-material/${symbol}`,
                kind: 'default',
                imported: symbol,
              },
            ],
          };
        }
      }

      if (iconRef.provider === 'heroicons') {
        const baseName = toPascalCase(iconRef.name);
        const symbol = baseName.endsWith('Icon') ? baseName : `${baseName}Icon`;
        const heroiconsSource =
          iconRef.variant === 'solid'
            ? '@heroicons/react/24/solid'
            : '@heroicons/react/24/outline';
        if (baseName) {
          return {
            element: symbol,
            imports: [
              {
                source: heroiconsSource,
                kind: 'named',
                imported: symbol,
              },
            ],
          };
        }
      }

      if (iconRef.provider === 'fontawesome') {
        const symbol = toFontAwesomeSymbol(iconRef.name);
        if (symbol) {
          return {
            element: 'FontAwesomeIcon',
            imports: [
              {
                source: '@fortawesome/react-fontawesome',
                kind: 'named',
                imported: 'FontAwesomeIcon',
              },
              {
                source: '@fortawesome/free-solid-svg-icons',
                kind: 'named',
                imported: symbol,
              },
            ],
          };
        }
      }
    }

    if (node.type.startsWith('Pdx')) {
      return {
        element: node.type,
        imports: [
          {
            source: '@prodivix/ui',
            kind: 'named',
            imported: node.type,
          },
        ],
      };
    }

    if (node.type === 'RadixLabel') {
      return {
        element: 'Label.Root',
        imports: [
          {
            source: '@radix-ui/react-label',
            kind: 'namespace',
            imported: 'Label',
          },
        ],
      };
    }

    if (node.type.startsWith('Antd')) {
      const bareType = node.type.slice('Antd'.length);
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
        element: bareType || 'div',
        imports: bareType
          ? [
              {
                source: 'antd',
                kind: 'named',
                imported: bareType,
              },
            ]
          : undefined,
      };
    }

    if (node.type.startsWith('Mui')) {
      const bareType = node.type.slice('Mui'.length);
      return {
        element: bareType || 'div',
        imports: bareType
          ? [
              {
                source: `@mui/material/${bareType}`,
                kind: 'default',
                imported: bareType,
              },
            ]
          : undefined,
      };
    }

    if (node.type.startsWith('Radix')) {
      return {
        element: 'div',
        diagnostics: [
          {
            code: 'REACT_ADAPTER_UNKNOWN_RADIX_COMPONENT',
            severity: 'warning',
            source: 'adapter',
            message: `No React adapter mapping found for "${node.type}".`,
            path: node.path,
            suggestion:
              'Add a mapping in react adapter or provide a custom adapter plugin.',
          },
        ],
      };
    }

    return { element: node.type || 'div' };
  },
};
