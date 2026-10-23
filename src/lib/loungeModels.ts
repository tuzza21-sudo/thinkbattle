/**
 * The conversation models a member can choose for a one-to-one room. The reply's instructions and JSON shape are the
 * same for every model, so the rest of the lounge does not change. Each provider caches the long, unchanging start of
 * the instructions on its own: the first reply after switching model is read in full, the ones after it from cache.
 */
export const loungeChatModels = [
  { id: 'gpt', label: 'GPT', description: '빠르고 안정적인 기본 대화', provider: 'openai' },
  { id: 'gemini-flash', label: 'Gemini Flash', description: '빠르고 표현이 풍부한 대화', provider: 'gemini' },
  // Voice replies use Flash instead: Pro is too slow to wait for in silence.
  { id: 'gemini-pro', label: 'Gemini Pro', description: '답은 느리지만 더 깊이 생각하는 대화 (채팅 전용)', provider: 'gemini' },
] as const;
export type LoungeChatModelId = typeof loungeChatModels[number]['id'];
export const getLoungeChatModel = (id?: string | null) => loungeChatModels.find(model => model.id === id) ?? loungeChatModels[0];

/**
 * Gemini model names. Measured on 2026-10-21 with the real chat instructions (about 8,000 tokens, thinking "low"):
 * first words after 1.7-2.8 s for GPT, 3.1-4.2 s for 3.8 Flash and 10.5-14 s for 3.1 Pro. In those streamed replies
 * Gemini reported no cached tokens, while the same prompt sent without streaming reported about 72% cached.
 * LOUNGE_GEMINI_FLASH_MODEL and LOUNGE_GEMINI_PRO_MODEL change the models.
 */
export const loungeGeminiChatModels = { 'gemini-flash': 'gemini-3.8-flash', 'gemini-pro': 'gemini-3.1-pro-preview' } as const;

/** Gemini sometimes fills a field that should be empty with a word meaning "none". */
export const loungeEmptyWord = (value: string) => /^(없음|none|null|n\/a|-|해당\s*없음)$/i.test(value.trim());
