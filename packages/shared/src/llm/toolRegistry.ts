import type { LlmToolDefinition } from './types.js';

export class LlmToolRegistry {
  private readonly tools = new Map<string, LlmToolDefinition>();

  register(tool: LlmToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`LLM tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): LlmToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): readonly LlmToolDefinition[] {
    return Array.from(this.tools.values());
  }

  pick(names: readonly string[]): readonly LlmToolDefinition[] {
    return names.map((name) => {
      const tool = this.tools.get(name);

      if (!tool) {
        throw new Error(`Unknown LLM tool: ${name}`);
      }

      return tool;
    });
  }
}
