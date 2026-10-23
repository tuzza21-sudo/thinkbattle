/**
 * The conversation models a member can choose for a one-to-one room. The reply's instructions and JSON shape are the
 * same for every model, so the rest of the lounge does not change. Each provider caches the long, unchanging start of
 * the instructions on its own: the first reply after switching model is read in full, the ones after it from cache.
 *
 * Measured on 2026-10-21 with the real chat instructions on five scenes: GPT without reasoning showed the first words
 * after 1.6-2.8 s; with medium reasoning after 3.2-6.9 s, writing fuller replies (scene progress, senses, the character's
 * own details) while keeping the rules, for about 0.34 USD per 1,000 replies. Gemini Flash was as rich but mixed polite
 * and casual speech and repeated gestures, at about 20 times the cost; Gemini Pro took 10-16 s. Only the two GPT models
 * are offered (`listed`); the Gemini ones still work if a room is set to them, so they can be offered again later.
 * `voiceFallback` is the model a voice reply uses instead, where waiting in silence is not acceptable.
 */
export const loungeChatModels = [
  { id: 'gpt', label: '빠른 대화', description: '바로바로 주고받는 기본 대화', provider: 'openai', reasoning: 'none', listed: true, voiceFallback: null },
  { id: 'gpt-reasoning', label: '깊은 대화', description: '한 번 더 생각해서 더 풍성하게 답해요 (조금 느림, 채팅 전용)', provider: 'openai', reasoning: 'medium', listed: true, voiceFallback: 'gpt' },
  { id: 'gemini-flash', label: 'Gemini Flash', description: '빠르고 표현이 풍부한 대화', provider: 'gemini', reasoning: 'none', listed: false, voiceFallback: null },
  { id: 'gemini-pro', label: 'Gemini Pro', description: '답은 느리지만 더 깊이 생각하는 대화 (채팅 전용)', provider: 'gemini', reasoning: 'none', listed: false, voiceFallback: 'gemini-flash' },
] as const;
export type LoungeChatModelId = typeof loungeChatModels[number]['id'];
export const getLoungeChatModel = (id?: string | null) => loungeChatModels.find(model => model.id === id) ?? loungeChatModels[0];
/** The models shown in the room's picker. */
export const loungeOfferedChatModels = loungeChatModels.filter(model => model.listed);

/** Gemini model names; LOUNGE_GEMINI_FLASH_MODEL and LOUNGE_GEMINI_PRO_MODEL change them. */
export const loungeGeminiChatModels = { 'gemini-flash': 'gemini-3.8-flash', 'gemini-pro': 'gemini-3.1-pro-preview' } as const;

/** Gemini sometimes fills a field that should be empty with a word meaning "none". */
export const loungeEmptyWord = (value: string) => /^(없음|none|null|n\/a|-|해당\s*없음)$/i.test(value.trim());
