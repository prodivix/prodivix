import type { AiDraftRequest } from '../draft/draft.types';

export interface OpenAICompatibleMessage {
  role: 'system' | 'user';
  content: string;
}

export const openAICompatibleSystemPrompt =
  'You are Prodivix AI runtime. Return only valid JSON. Do not wrap JSON in markdown fences. Do not include prose before or after the JSON.';

export const createOpenAICompatibleMessages = (
  draft: AiDraftRequest
): OpenAICompatibleMessage[] => [
  {
    role: 'system',
    content: openAICompatibleSystemPrompt,
  },
  {
    role: 'user',
    content: JSON.stringify({
      intent: draft.intent,
      context: draft.context,
      allowedTools: draft.allowedTools,
      authority: 'explain-or-plan-only',
      expectedOutput: {
        goal: 'string',
        assumptions: ['string'],
        milestones: [
          {
            id: 'string',
            title: 'string',
            description: 'string | optional',
          },
        ],
      },
    }),
  },
];

export const stringifyOpenAICompatibleMessages = (
  messages: readonly OpenAICompatibleMessage[]
) => JSON.stringify(messages, null, 2);
