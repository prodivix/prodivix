export const MAXIMUM_AI_DRAFT_BYTES = 262_144;

export const isBoundedAiDraftRawResponse = (value: string): boolean =>
  new TextEncoder().encode(value).byteLength <= MAXIMUM_AI_DRAFT_BYTES;
