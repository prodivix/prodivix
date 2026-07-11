import type { TargetAdapter } from '#src/core/adapter';

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

    return { element: node.type || 'div' };
  },
};
