import type { AiDraftToolDefinition } from './draft.types';

const authorityToken =
  '(?:^|[._:/-])(?:apply|approve|approval|commit|rollback)(?:$|[._:/-])';
const genericMutationToken =
  '(?:^|[._:/-])(?:workspace[._:/-]patch|json[._:/-]patch|file[._:/-]write)(?:$|[._:/-])';
const forbiddenAuthorityName = new RegExp(
  `${authorityToken}|${genericMutationToken}`,
  'iu'
);

/** Registry for admission-only draft calls; authoring authority is rejected. */
export class AiDraftToolRegistry {
  private readonly tools = new Map<string, AiDraftToolDefinition>();

  register(tool: AiDraftToolDefinition): void {
    if (forbiddenAuthorityName.test(tool.name)) {
      throw new Error(
        `AI draft tool cannot expose authoring authority: ${tool.name}`
      );
    }
    if (tool.effect !== 'read' && tool.effect !== 'ephemeral-execute') {
      throw new Error(
        `AI draft tool effect is not admission-only: ${tool.name}`
      );
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`AI draft tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): AiDraftToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): readonly AiDraftToolDefinition[] {
    return Array.from(this.tools.values());
  }

  pick(names: readonly string[]): readonly AiDraftToolDefinition[] {
    return names.map((name) => {
      const tool = this.tools.get(name);
      if (!tool) throw new Error(`Unknown AI draft tool: ${name}`);
      return tool;
    });
  }
}
