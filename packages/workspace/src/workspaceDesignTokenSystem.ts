import { applyWorkspaceCommand } from './workspaceCommand';
import { createWorkspaceDocumentAtPathCommand } from './workspaceDocumentFactory';
import type { WorkspaceTransactionEnvelope } from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceDesignTokenSystemDocumentRole =
  'foundation' | 'light' | 'dark' | 'resolver';

export type CreateWorkspaceDesignTokenSystemTransactionInput = Readonly<{
  workspace: WorkspaceSnapshot;
  transactionId: string;
  issuedAt: string;
  slug: string;
  displayName: string;
  basePath?: string;
  documentIdFactory?: (role: WorkspaceDesignTokenSystemDocumentRole) => string;
}>;

export type WorkspaceDesignTokenSystemTransactionPlan = Readonly<{
  transaction: WorkspaceTransactionEnvelope;
  documentIds: Readonly<Record<WorkspaceDesignTokenSystemDocumentRole, string>>;
  resolverDocumentId: string;
}>;

export type WorkspaceDesignTokenSystemTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceDesignTokenSystemTransactionPlan;
    }>
  | Readonly<{
      status: 'rejected';
      message: string;
    }>;

const normalizeBasePath = (value: string): string | null => {
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/+$/, '');
  if (
    !normalized.startsWith('/') ||
    normalized === '/' ||
    normalized
      .slice(1)
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  return normalized;
};

const createDefaultDocumentId = (
  slug: string,
  role: WorkspaceDesignTokenSystemDocumentRole
): string => `tokens-${slug}-${role}`;

/**
 * Creates the standard four-document DTCG design-system starter atomically:
 * foundation, light and dark token documents plus one Resolver mapping.
 */
export const createWorkspaceDesignTokenSystemTransactionPlan = (
  input: CreateWorkspaceDesignTokenSystemTransactionInput
): WorkspaceDesignTokenSystemTransactionPlanResult => {
  const slug = input.slug.trim().toLocaleLowerCase('en-US');
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) {
    return Object.freeze({
      status: 'rejected',
      message:
        'Design system slug must use lowercase letters, numbers, and hyphens.',
    });
  }
  const displayName = input.displayName.trim();
  if (!displayName) {
    return Object.freeze({
      status: 'rejected',
      message: 'Design system name must not be empty.',
    });
  }
  const basePath = normalizeBasePath(input.basePath ?? '/tokens');
  if (!basePath) {
    return Object.freeze({
      status: 'rejected',
      message: 'Design system base path must be a canonical Workspace path.',
    });
  }
  const documentIdFactory =
    input.documentIdFactory ??
    ((role: WorkspaceDesignTokenSystemDocumentRole) =>
      createDefaultDocumentId(slug, role));
  const documentIds = Object.freeze({
    foundation: documentIdFactory('foundation'),
    light: documentIdFactory('light'),
    dark: documentIdFactory('dark'),
    resolver: documentIdFactory('resolver'),
  });
  if (
    Object.values(documentIds).some((id) => !id.trim() || id !== id.trim()) ||
    new Set(Object.values(documentIds)).size !== 4
  ) {
    return Object.freeze({
      status: 'rejected',
      message: 'Design system document ids must be non-empty and unique.',
    });
  }

  const foundationFile = `${slug}.foundation.tokens.json`;
  const lightFile = `${slug}.light.tokens.json`;
  const darkFile = `${slug}.dark.tokens.json`;
  const documents: readonly WorkspaceDocument[] = Object.freeze([
    {
      id: documentIds.foundation,
      type: 'design-tokens',
      name: `${displayName} Foundation`,
      path: `${basePath}/${foundationFile}`,
      contentRev: 1,
      metaRev: 1,
      content: {
        scale: {
          $type: 'number',
          base: { $value: 1 },
        },
      },
    },
    {
      id: documentIds.light,
      type: 'design-tokens',
      name: `${displayName} Light`,
      path: `${basePath}/${lightFile}`,
      contentRev: 1,
      metaRev: 1,
      content: {
        surface: {
          $type: 'color',
          background: { $value: '#ffffff' },
          foreground: { $value: '#111111' },
        },
      },
    },
    {
      id: documentIds.dark,
      type: 'design-tokens',
      name: `${displayName} Dark`,
      path: `${basePath}/${darkFile}`,
      contentRev: 1,
      metaRev: 1,
      content: {
        surface: {
          $type: 'color',
          background: { $value: '#111111' },
          foreground: { $value: '#ffffff' },
        },
      },
    },
    {
      id: documentIds.resolver,
      type: 'design-token-resolver',
      name: displayName,
      path: `${basePath}/${slug}.resolver.json`,
      contentRev: 1,
      metaRev: 1,
      content: {
        $schema: 'https://www.designtokens.org/schemas/2025.10/resolver.json',
        name: displayName,
        version: '2025.10',
        sets: {
          foundation: {
            sources: [{ $ref: foundationFile }],
          },
        },
        modifiers: {
          theme: {
            description: 'Color theme',
            contexts: {
              light: [{ $ref: lightFile }],
              dark: [{ $ref: darkFile }],
            },
            default: 'light',
          },
        },
        resolutionOrder: [
          { $ref: '#/sets/foundation' },
          { $ref: '#/modifiers/theme' },
        ],
      },
    },
  ]);

  let staged = input.workspace;
  const commands: WorkspaceTransactionEnvelope['commands'] = [];
  try {
    documents.forEach((document, index) => {
      const command = createWorkspaceDocumentAtPathCommand({
        workspace: staged,
        document,
        commandId: `${input.transactionId}:create:${index}`,
        issuedAt: input.issuedAt,
        label: `Create ${document.path}`,
      });
      const applied = applyWorkspaceCommand(staged, command);
      if (!applied.ok) {
        throw new Error(
          applied.issues[0]?.message ??
            `Could not create design system document ${document.path}.`
        );
      }
      commands.push(command);
      staged = applied.snapshot;
    });
  } catch (error) {
    return Object.freeze({
      status: 'rejected',
      message:
        error instanceof Error
          ? error.message
          : 'Could not create the design system documents.',
    });
  }

  const transaction: WorkspaceTransactionEnvelope = {
    id: input.transactionId,
    workspaceId: input.workspace.id,
    issuedAt: input.issuedAt,
    commands: [...commands],
    label: `Create ${displayName} design system`,
  };
  return Object.freeze({
    status: 'ready',
    plan: Object.freeze({
      transaction,
      documentIds,
      resolverDocumentId: documentIds.resolver,
    }),
  });
};
