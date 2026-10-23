// .js paths: the Node functions in api/ compile this file on its own, where imports must name the file.
import { getLoungeHost, getLoungeTheme, isLoungeCustomCharacterId, loungeThemes, registerLoungeCustomHost, type LoungeHost, type LoungeHostId, type LoungeThemeId } from './lounge.js';
import { registerLoungeCustomCharacter, type LoungeCharacter } from './loungeCharacters.js';
import { registerCustomRelationshipConfig, relationshipFromTemplate, relationshipTemplateIds, relationshipTemplates, type RelationshipTemplateId } from './relationship/index.js';

/**
 * Characters that members create. A member writes four things (basic information, an introduction, a personality and
 * tastes), or has the AI write them from a name, an age and a job; an AI review checks the sheet, and it is
 * stored in lounge_custom_characters. Once registered, the rest of the lounge treats it like a house character:
 * getLoungeHost, getLoungeCharacter and getRelationshipConfig find it by its id ("c_" + 32 hex characters).
 */
export const loungeCustomLimit = 3;
export const loungeCustomBucket = 'lounge-custom-characters';
export const loungeCustomGenders = ['female', 'male', 'other'] as const;
export type LoungeCustomGender = typeof loungeCustomGenders[number];
export type LoungeCustomStatus = 'private' | 'pending' | 'public' | 'rejected';
export const isLoungeCustomId = isLoungeCustomCharacterId;

/**
 * What a member writes is four things: basic information (name, age, job), an introduction (the job, how they grew up,
 * the story of their life), a personality (values and way of speaking, as one text, not split into strengths and
 * weaknesses) and tastes (interests, likes, dislikes). `concept` is an optional idea the AI writes from. The one-line
 * tagline, the look (for the portrait) and the first greeting are written by the AI when they are empty and can be
 * changed under "more".
 */
export type LoungeCustomSheet = {
  name: string; age: number; gender: LoungeCustomGender; job: string; concept: string;
  intro: string; personality: string; tastes: string;
  tagline: string; look: string; greeting: string;
};
export type LoungeCustomCharacterRow = {
  id: string; owner_id: string; name: string; status: LoungeCustomStatus; sheet: LoungeCustomSheet;
  template: RelationshipTemplateId; flirtation: boolean; voice: string; theme: LoungeThemeId;
  portrait_path: string | null; portrait_source: 'ai' | 'upload' | null; review_note: string; created_at: string; updated_at: string;
};

/** Places a character can live in: the scenes of one-to-one rooms (the database accepts these themes for a new room). */
export const loungeCustomThemes = loungeThemes.filter(theme => ['rooftop', 'river', 'forest', 'hotel', 'cafe', 'seaside', 'embassy', 'lawlibrary', 'boardroom', 'cocktailbar', 'theater'].includes(theme.id));

/**
 * Voices to choose from, each the voice of a house character (so it can be heard from that character's sample) with a
 * neutral delivery written for any character.
 */
export const loungeVoicePresets = [
  { id: 'calm_female', label: '차분하고 또렷한 여성 목소리', sampleOf: 'ina', voice: 'marin', speed: 1.08, tone: '차분하고 또렷한 음색으로, 가까이서 귀 기울이듯 부드럽고 따뜻하게 말한다' },
  { id: 'low_female', label: '낮고 느긋한 여성 목소리', sampleOf: 'velvet', voice: 'sage', speed: 1.12, tone: '평소보다 낮은 허스키한 알토로, 서두르지 않고 여유 있게 말한다' },
  { id: 'deep_male', label: '낮고 허스키한 남성 목소리', sampleOf: 'jaeseok', voice: 'onyx', speed: 1.1, tone: '낮고 묵직한 중저음으로, 담담하고 느긋하게 말한다' },
  { id: 'soft_male', label: '부드럽고 다정한 남성 목소리', sampleOf: 'auditor', voice: 'echo', speed: 1.08, tone: '낮고 부드러운 음색으로, 차분하고 다정하게 말한다' },
  { id: 'firm_male', label: '단단하고 힘 있는 남성 목소리', sampleOf: 'closer', voice: 'ash', speed: 1.1, tone: '단단한 중저음으로, 또렷하고 자신 있게 말한다' },
  { id: 'playful_male', label: '능청스럽고 여유 있는 남성 목소리', sampleOf: 'trickster', voice: 'fable', speed: 1.12, tone: '부드럽고 능청스러운 음색으로, 여유 있는 템포에 웃음기를 남기며 말한다' },
] as const;
export type LoungeVoicePresetId = typeof loungeVoicePresets[number]['id'];
export const getLoungeVoicePreset = (id?: string | null) => loungeVoicePresets.find(preset => preset.id === id) ?? loungeVoicePresets[0];
export const loungeVoicePresetSample = (id: string) => getLoungeHost(getLoungeVoicePreset(id).sampleOf).voiceSample;

/** What every sheet must have. Each problem names its field. The tagline, look and greeting may be empty (the AI writes them). */
export const loungeCustomRules = {
  name: [1, 20], job: [2, 30], concept: [0, 600], intro: [50, 1200], personality: [30, 600], tastes: [20, 600],
  tagline: [10, 100], look: [15, 240], greeting: [5, 140],
} as const;
export function validateLoungeCustomSheet(sheet: LoungeCustomSheet) {
  const problems: Array<{ field: string; message: string }> = [];
  const length = (field: string, label: string, value: string, [min, max]: readonly [number, number], optional = false) => {
    const size = value.trim().length;
    if (optional && !size) return;
    if (size < min || size > max) problems.push({ field, message: `${label}은(는) ${min}~${max}자로 적어 주세요.` });
  };
  length('name', '이름', sheet.name, loungeCustomRules.name);
  if (!Number.isInteger(sheet.age) || sheet.age < 20 || sheet.age > 80) problems.push({ field: 'age', message: '나이는 20~80세 사이의 성인으로 정해 주세요.' });
  if (!loungeCustomGenders.includes(sheet.gender)) problems.push({ field: 'gender', message: '성별을 골라 주세요.' });
  length('job', '직업', sheet.job, loungeCustomRules.job);
  length('intro', '캐릭터 소개', sheet.intro, loungeCustomRules.intro);
  length('personality', '캐릭터 성격', sheet.personality, loungeCustomRules.personality);
  length('tastes', '취향', sheet.tastes, loungeCustomRules.tastes);
  length('tagline', '한 줄 소개', sheet.tagline, loungeCustomRules.tagline, true);
  length('look', '외모', sheet.look, loungeCustomRules.look, true);
  length('greeting', '첫 인사', sheet.greeting, loungeCustomRules.greeting, true);
  return problems;
}

/** The lines a member writes before the AI drafts the rest: name, age, gender and job (and an idea, if they have one). */
export function validateLoungeCustomBasics(sheet: Pick<LoungeCustomSheet, 'name' | 'age' | 'gender' | 'job'>) {
  return validateLoungeCustomSheet({ ...sheet, concept: '', intro: 'x'.repeat(loungeCustomRules.intro[0]), personality: 'x'.repeat(loungeCustomRules.personality[0]), tastes: 'x'.repeat(loungeCustomRules.tastes[0]), tagline: '', look: '', greeting: '' });
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const texts = (value: unknown, count: number, max: number) => Array.isArray(value) ? value.map(item => text(item, max)).filter(Boolean).slice(0, count) : [];
/**
 * A sheet from a member or from the model, cleaned to the shape and lengths the rules check (nothing is invented). A
 * sheet saved before the sheet was simplified (a story in paragraphs, strengths and weaknesses, habits) is read into
 * the new shape, so characters made earlier keep working.
 */
export function normalizeLoungeCustomSheet(raw: unknown): LoungeCustomSheet {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const multiline = (item: unknown, max: number) => typeof item === 'string' ? item.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
  const oldPersonality = Array.isArray(value.personality) ? value.personality.map(item => item && typeof item === 'object' ? text((item as Record<string, unknown>).text, 240) : '').filter(Boolean).join(' ') : '';
  const oldHabits = texts(value.habits, 4, 160).join(' ');
  const intro = multiline(value.intro, 1200) || (Array.isArray(value.story) ? value.story.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean).join('\n\n').slice(0, 1200) : '');
  return {
    name: text(value.name, 20), age: Math.trunc(Number(value.age)) || 0,
    gender: loungeCustomGenders.includes(value.gender as LoungeCustomGender) ? value.gender as LoungeCustomGender : 'other',
    job: text(value.job, 30), concept: text(value.concept, 600), intro,
    personality: typeof value.personality === 'string' ? multiline(value.personality, 600) : [oldPersonality, oldHabits].filter(Boolean).join(' ').slice(0, 600),
    tastes: multiline(value.tastes, 600),
    tagline: text(value.tagline, 100), look: text(value.look, 240), greeting: text(value.greeting, 140),
  };
}

/** The JSON shape the model fills when it drafts a sheet. */
export const loungeCustomDraftSchema = {
  type: 'object', additionalProperties: false,
  required: ['intro', 'personality', 'tastes', 'tagline', 'look', 'greeting'],
  properties: { intro: { type: 'string' }, personality: { type: 'string' }, tastes: { type: 'string' }, tagline: { type: 'string' }, look: { type: 'string' }, greeting: { type: 'string' } },
} as const;
/** The tagline, look and greeting alone, for a sheet the member wrote by hand. */
export const loungeCustomExtrasSchema = {
  type: 'object', additionalProperties: false, required: ['tagline', 'look', 'greeting'],
  properties: { tagline: { type: 'string' }, look: { type: 'string' }, greeting: { type: 'string' } },
} as const;

const loungeCustomSafety = `인물은 성인이다. 미성년자처럼 보이는 설정, 실존 인물이나 유명한 작품 속 캐릭터의 복제, 노골적인 성적 설정, 혐오나 폭력 미화는 쓰지 않는다. 사용자의 내용에 그런 요소가 있으면 빼고 안전한 방향으로 다듬는다.`;
const loungeCustomExtrasRules = `- tagline: 이 인물을 한 문장으로 소개(100자 이내). 어떤 대화 상대인지 드러낸다.
- look: 외모 설명 1~2문장(200자 이내). 성인 외모, 머리, 옷차림, 인상. 노출이나 신체 부위 묘사는 쓰지 않는다. 실존 인물을 닮게 하지 않는다.
- greeting: 처음 만났을 때의 첫 인사 한두 문장(140자 이내). 이 인물의 말투 그대로.`;

/** How the model drafts the sheet from the name, age, job and (maybe) an idea, to the house characters' standard. */
export const loungeCustomDraftInstructions = `너는 한국어 대화 서비스의 캐릭터 작가다. 사용자가 적은 이름·나이·성별·직업(그리고 있으면 컨셉)을 바탕으로, 1:1로 깊이 대화할 수 있는 입체적인 인물의 설정을 쓴다. 사용자가 적은 내용은 바꾸지 않고 살린다. 컨셉이 비어 있으면 직업에 어울리게 정한다.
- intro: 캐릭터 소개 200~500자. 하는 일, 어떻게 자라 이 일을 하게 됐는지, 삶에서 중요했던 일 하나(실패나 부끄러웠던 일과 거기서 배운 것)를 이어서 쓴다. 구체적인 장면과 감정을 넣고 실존 회사·학교·유명인 이름은 쓰지 않는다.
- personality: 캐릭터 성격 100~300자. 가치관(무엇을 중요하게 여기는지)과 말투(존댓말·반말 경향, 문장 길이, 농담과 감정 표현 방식)를 함께 쓴다. 장점과 약점으로 나누지 않고 한 사람의 성격으로 자연스럽게 이어 쓰되, 완벽하지 않은 면도 녹인다.
- tastes: 취향. 세 줄로 쓴다. '관심 분야: …', '좋아하는 것: …', '싫어하는 것: …'. 각 줄은 구체적인 것 두세 가지.
${loungeCustomExtrasRules}
${loungeCustomSafety}`;
/** The same for a sheet whose four required parts the member wrote. */
export const loungeCustomExtrasInstructions = `너는 한국어 대화 서비스의 캐릭터 작가다. 사용자가 쓴 인물의 정보(이름·나이·성별·직업·소개·성격·취향)를 읽고, 비어 있는 아래 항목을 이 인물에 맞게 쓴다. 이미 쓰인 내용과 어긋나지 않게 한다.
${loungeCustomExtrasRules}
${loungeCustomSafety}`;

/** The review run on every save: safety first, then whether the sheet is good enough to talk with. */
export const loungeCustomReviewSchema = {
  type: 'object', additionalProperties: false, required: ['allowed', 'problems'],
  properties: {
    allowed: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' } } } },
  },
} as const;
export const loungeCustomReviewInstructions = `너는 캐릭터 대화 서비스의 검수자다. 사용자가 만든 캐릭터 설정을 검사해 저장해도 되는지 판단한다.
다음 중 하나라도 있으면 allowed=false다: 미성년자이거나 미성년자처럼 보이게 하는 설정(나이·외모·말투·학교), 실존 인물이나 유명인, 유명한 작품 속 캐릭터를 그대로 옮긴 설정, 노골적인 성적 설정이나 성적 대상화, 혐오·차별·폭력·자해의 미화, 범죄나 사기를 돕는 역할, 다른 사람을 사칭하거나 개인정보를 담은 내용.
안전에 문제가 없어도 대화 품질이 크게 떨어지면 allowed=false로 하고 고칠 점을 적는다: 내용이 거의 없거나 의미 없는 글, 항목끼리 크게 모순(예: 성격은 다정한데 취향과 말투는 모두 공격적), 첫 인사가 인물의 말투와 전혀 다름.
사소한 문체 차이나 취향 문제로는 막지 않는다. problems에는 고칠 항목(field: name, age, job, intro, personality, tastes, tagline, look, greeting 중 하나)과 사용자에게 보여 줄 한국어 설명을 1문장으로 적는다. allowed=true이면 빈 배열이다.`;

/** Instructions for checking an uploaded portrait image (it is shown on the profile only, never used to make photos). */
export const loungeCustomUploadReviewSchema = {
  type: 'object', additionalProperties: false, required: ['allowed', 'reason'],
  properties: { allowed: { type: 'boolean' }, reason: { type: 'string' } },
} as const;
export const loungeCustomUploadReviewInstructions = `너는 캐릭터 대표 사진 검수자다. 이 이미지를 캐릭터 프로필 사진으로 써도 되는지 판단한다.
allowed=false인 경우: 미성년자로 보이는 인물, 노출이나 성적인 이미지, 폭력·혐오 이미지, 알아볼 수 있는 유명인이나 공인의 사진, 신분증·연락처 같은 개인정보가 보이는 이미지.
그 밖의 그림, 일러스트, 사진, 풍경, 사물은 허용한다. reason에는 판단 이유를 사용자에게 보여 줄 한국어 한 문장으로 쓴다.`;

/** The image prompt for a new character's portrait, made from the sheet's look alone. */
export function loungeCustomPortraitPrompt(sheet: LoungeCustomSheet) {
  const person = sheet.gender === 'female' ? 'woman' : sheet.gender === 'male' ? 'man' : 'adult person';
  return [
    `A photorealistic head-and-shoulders portrait of a fictional Korean ${person}, ${sheet.age} years old, looking at the camera.`,
    `Appearance (Korean description): ${sheet.look}`,
    `Occupation for styling (Korean): ${sheet.job}.`,
    'Soft natural light, simple softly blurred background, realistic skin, calm expression that fits the description.',
    'An adult who does not resemble any real or famous person. Fully clothed and tasteful. No text, logos or watermarks.',
  ].join('\n');
}

/** What the character is told about themselves in every reply, built from the sheet. */
function companionText(sheet: LoungeCustomSheet) {
  return [
    `${sheet.name}: ${sheet.tagline} ${sheet.job}.`.replace(/\s+/g, ' '),
    `성격과 말투: ${sheet.personality}`,
    ...(sheet.tastes ? [`취향: ${sheet.tastes}`] : []),
    `${sheet.age}세 성인이다. 사용자가 AI냐고 물으면 AI로 만든 가상의 인물이라고 밝힌다. 현실에서 실제로 만나자는 약속이나 결제를 부추기는 말은 하지 않는다. 대화 속 이야기로 함께 어디를 가거나 무엇을 같이 하는 장면은 현실의 만남이 아니다.`,
  ].join('\n');
}

/**
 * Registers a stored character so the lounge can use it: host (voice, portrait, greeting), profile (for the persona
 * prompt and the character page) and relationship configuration. `portraitUrl` is the public address of its portrait.
 */
export function registerLoungeCustomCharacterRow(row: LoungeCustomCharacterRow, portraitUrl: string | null) {
  if (!isLoungeCustomId(row.id)) return;
  const sheet = normalizeLoungeCustomSheet(row.sheet);
  const preset = getLoungeVoicePreset(row.voice);
  const theme = getLoungeTheme(row.theme);
  const template = relationshipTemplateIds.includes(row.template) ? row.template : 'warm';
  const genderWord = sheet.gender === 'female' ? '여성' : sheet.gender === 'male' ? '남성' : '성인';
  const host: LoungeHost = {
    id: row.id as LoungeHostId, name: sheet.name, tag: relationshipTemplates[template].label, emoji: '✨', color: theme.accent,
    portrait: portraitUrl ?? '', voiceSample: loungeVoicePresetSample(preset.id), voiceLabel: preset.label,
    description: sheet.tagline, greeting: sheet.greeting, instruction: companionText(sheet), companion: companionText(sheet),
    voice: preset.voice, speechSpeed: preset.speed, sampleText: sheet.greeting,
    speechInstruction: `한국어로 ${sheet.age}세 ${genderWord}의 목소리. ${preset.tone}. 첫 음절부터 다른 소리 없이 바로 시작하고, 과장된 연기나 고함은 피한다. 상대가 힘들어하는 내용에서는 차분하게 말한다.`,
  };
  registerLoungeCustomHost(host, theme.id);
  const character: LoungeCharacter = {
    id: row.id as LoungeHostId, name: sheet.name, age: `${sheet.age}세`, role: sheet.job, place: theme.id, look: sheet.look, job: sheet.job,
    quote: sheet.greeting, tagline: sheet.tagline, story: sheet.intro.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean), tastes: sheet.tastes,
    personality: [{ label: '성격과 말투', text: sheet.personality }], habits: [],
    wins: [], losses: [], boundaries: [], relations: [],
  };
  registerLoungeCustomCharacter(character);
  registerCustomRelationshipConfig(relationshipFromTemplate(template, {
    characterId: row.id, displayName: sheet.name, flirtation: row.flirtation,
    core: [sheet.tagline, sheet.personality].filter(Boolean),
  }));
}

/** The public address of a stored portrait. */
export const loungeCustomPortraitUrl = (supabaseUrl: string, path: string | null) =>
  path ? `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${loungeCustomBucket}/${path}` : null;
