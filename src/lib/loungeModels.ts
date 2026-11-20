/**
 * The conversation models a member can choose for a one-to-one room. The reply's instructions and JSON shape are the
 * same for every model, so the rest of the lounge does not change. Each provider caches the long, unchanging start of
 * the instructions on its own: the first reply after switching model is read in full, the ones after it from cache.
 *
 * Measured on 2026-10-21 with the real chat instructions on five scenes: GPT without reasoning showed the first words
 * after 1.6-2.8 s; with medium reasoning after 3.2-6.9 s, writing fuller replies (scene progress, senses, the character's
 * own details) while keeping the rules, for about 0.34 USD per 1,000 replies. Gemini Flash was as rich but mixed polite
 * and casual speech and repeated gestures, at about 20 times the cost; Gemini Pro took 10-16 s.
 * `voiceFallback` is the model a voice reply uses instead, where waiting in silence is not acceptable.
 *
 * 2026-10-30, measured on 선우령's 《검은 장미》 (five scenes): GPT-6 Luna without reasoning broke the requested casual
 * speech in three of five replies; GPT-6 Sol kept it in all five. Those OpenAI variants (reasoning, Sol, Terra) are no
 * longer offered. A room still stored with one of those ids answers with the fast GPT.
 *
 * 2026-11-03: DeepSeek Flash can be picked as well (chat only; a voice reply is OpenAI's). Its API takes the same
 * instructions and input as the others but not a JSON schema, so the schema goes into the instructions (see
 * deepseekReply in api/lounge.ts). Adult-mode turns go to NanoGPT instead (NANOGPT_API_KEY, loungeAdultChatModel).
 *
 * 2026-11-11: the picker offered the fast GPT, Gemini 3.8 Flash, GLM 5.3 Flash and DeepSeek Flash. `model` is the OpenAI
 * model name; the Gemini names live below, and `stallModel` is the model that answers when a reasoning reply has not
 * begun in time.
 *
 * 2026-11-16: GLM is gone (a room still stored with 'glm-flash' answers with the fast GPT), and members no longer see
 * the provider names: each model is shown under a code name (노바, 아리아, 오닉스). The ids and providers stay as they
 * are, since rooms store the id.
 *
 * 2026-11-19, by the owner: 라쿤 ('deepseek-raccoon') is DeepSeek's own model for a chat and for a call alike. Where 오닉스 hands a call to the fast GPT and an adult
 * scene on a call goes to NanoGPT first, a room on 라쿤 keeps DeepSeek first on a call too (NanoGPT is its fallback), so the two can be compared on the same turns.
 *
 * 2026-11-20, by the owner: the picker lists 오닉스 ('빠르고 자유로운 대화'), 아리아 ('표현이 풍부한 대화') and 라쿤 ('균형잡힌 대화') in that
 * order, with no word about chat or voice after a name. 노바 is no longer offered and 오닉스 is the default (a room with no model, and one stored with an id that
 * is gone, answers with it). 노바 stays as the id 'gpt' that a call and a failed reply fall back to. 라쿤 moves to OpenRouter's
 * Qwen 3.8 Flash (OPENROUTER_API_KEY), for every turn of a room on it: general talk, chat, calls and adult scenes alike; DeepSeek's
 * own model answers when it fails.
 */
export const loungeChatModels = [
  { id: 'deepseek-flash', label: '오닉스', description: '빠르고 자유로운 대화', provider: 'deepseek', model: null, stallModel: null, reasoning: 'none', listed: true, voiceFallback: 'gpt' },
  { id: 'gemini-flash', label: '아리아', description: '표현이 풍부한 대화', provider: 'gemini', model: null, stallModel: null, reasoning: 'none', listed: true, voiceFallback: null },
  { id: 'deepseek-raccoon', label: '라쿤', description: '균형잡힌 대화', provider: 'openrouter', model: null, stallModel: null, reasoning: 'none', listed: true, voiceFallback: null },
  { id: 'gpt', label: '노바', description: '바로바로 주고받는 기본 대화', provider: 'openai', model: 'gpt-6-luna', stallModel: null, reasoning: 'none', listed: false, voiceFallback: null },
  { id: 'gemini-pro', label: '아리아 딥', description: '답은 느리지만 더 깊이 생각하는 대화', provider: 'gemini', model: null, stallModel: null, reasoning: 'none', listed: false, voiceFallback: 'gemini-flash' },
] as const;
export type LoungeChatModelId = typeof loungeChatModels[number]['id'];
/** The model of a room that has none, and of one stored with an id that is gone. */
export const loungeDefaultChatModelId = 'deepseek-flash';
export const getLoungeChatModel = (id?: string | null) => loungeChatModels.find(model => model.id === id) ?? loungeChatModels.find(model => model.id === loungeDefaultChatModelId)!;
/** The models shown in the room's picker. */
export const loungeOfferedChatModels = loungeChatModels.filter(model => model.listed);

/** Gemini model names; LOUNGE_GEMINI_FLASH_MODEL and LOUNGE_GEMINI_PRO_MODEL change them. */
export const loungeGeminiChatModels = { 'gemini-flash': 'gemini-3.8-flash', 'gemini-pro': 'gemini-3.1-pro-preview' } as const;

/** OpenRouter model of 라쿤; LOUNGE_RACCOON_MODEL changes it. Chat-completions URL for it (OPENROUTER_API_KEY). */
export const loungeRaccoonModel = 'qwen/qwen3.8-flash';
export const loungeRaccoonUrl = 'https://openrouter.ai/api/v1/chat/completions';

/** NanoGPT model that answers adult-mode turns; LOUNGE_ADULT_MODEL changes it. */
export const loungeAdultChatModel = 'deepseek/deepseek-v4.1-flash-1017-uncensored';
/** NanoGPT chat-completions URL for those turns. */
export const loungeAdultChatUrl = 'https://nano-gpt.com/api/v1/chat/completions';

/** Gemini sometimes fills a field that should be empty with a word meaning "none". */
export const loungeEmptyWord = (value: string) => /^(없음|none|null|n\/a|-|해당\s*없음)$/i.test(value.trim());
