import type { LlmTaskRequest } from '@prodivix/shared';

export interface OpenAICompatibleMessage {
  role: 'system' | 'user';
  content: string;
}

export const openAICompatibleSystemPrompt =
  'You are Prodivix AI runtime. Return only valid JSON. Do not wrap JSON in markdown fences. Do not include prose before or after the JSON.';

export const createOpenAICompatibleMessages = (
  task: LlmTaskRequest
): OpenAICompatibleMessage[] => [
  {
    role: 'system',
    content: openAICompatibleSystemPrompt,
  },
  {
    role: 'user',
    content: JSON.stringify({
      intent: task.intent,
      context: task.context,
      outputChannels: task.outputChannels,
      allowedTools: task.allowedTools,
      requiresPlan: task.requiresPlan,
      expectedOutput: task.requiresPlan
        ? {
            goal: 'string',
            assumptions: ['string'],
            milestones: [
              {
                id: 'string',
                title: 'string',
                description: 'string | optional',
              },
            ],
          }
        : undefined,
    }),
  },
];

export const stringifyOpenAICompatibleMessages = (
  messages: readonly OpenAICompatibleMessage[]
) => JSON.stringify(messages, null, 2);
