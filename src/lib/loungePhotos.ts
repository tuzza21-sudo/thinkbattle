// .js paths: api/lounge-images.ts runs as a Node function compiled file by file, where imports must name the file.
import { getLoungeHost } from './lounge.js';
import { getLoungeCharacter } from './loungeCharacters.js';

/**
 * Character photos: a photo of what a character is doing, sent in a one-to-one conversation or posted to the
 * character's public gallery. Every photo is a post (with the character's caption), so the gallery can become the
 * character's own social feed later. Prompts and checks shared by api/lounge-images.ts and the tests live here.
 */
export type LoungePhotoSource = 'request' | 'character' | 'daily';
export type LoungeCharacterPost = {
  id: string; character_id: string; user_id: string | null; room_id: string | null;
  visibility: 'private' | 'public'; source: LoungePhotoSource; status: 'pending' | 'ready';
  scene: string; caption: string; image_path: string | null; created_at: string;
};
export const loungePhotoBuckets = { private: 'lounge-character-private', public: 'lounge-character-public' } as const;
/** gpt-image-2.5-sunburst keeps a reference face best (OpenAI calls it the editing-precision model). */
export const loungePhotoModel = 'gpt-image-2.5-sunburst';
export const loungePhotoSize = '1024x1536';

/** The character's portrait and, where there is one, a full-body photo: the references that keep the same face and build. */
export function loungePhotoReferences(characterId: string) {
  const character = getLoungeCharacter(characterId);
  if (!character) return [];
  return [getLoungeHost(character.id).portrait, ...(character.fullBody ? [character.fullBody] : [])];
}

export const loungePhotoSceneSchema = {
  type: 'object',
  properties: { scene: { type: 'string' }, caption: { type: 'string' } },
  required: ['scene', 'caption'], additionalProperties: false,
} as const;

/**
 * Instructions for the text model that decides what the photo shows and what the character says with it.
 * `kind` chat: a photo sent in a conversation; daily: a post from the character's own day.
 */
export function loungePhotoSceneInstructions(kind: 'chat' | 'daily') {
  return [
    '너는 아래 인물 본인으로서, 지금 보낼 사진 한 장의 장면과 함께 남길 한마디를 정한다.',
    'scene은 이미지 생성 모델에 줄 영어 장면 설명이다. 인물이 어디에서 무엇을 하는지, 옷차림, 자세와 표정, 시간대와 빛, 주변 소품, 카메라 구도(셀카인지, 누가 찍어 준 사진인지, 거리)를 구체적으로 2~4문장으로 쓴다. 인물의 생김새는 참조 사진을 따르므로 얼굴이나 머리 모양을 새로 정하지 않는다.',
    'scene은 성인이 등장하는 일상 사진이어야 한다. 옷을 갖춰 입고, 노출·속옷·잠옷 차림·신체 부위 강조·성적인 자세나 상황은 쓰지 않는다. 분위기와 설렘은 빛, 시선, 거리감, 장소로만 표현한다. 실존 인물, 실제 브랜드 로고, 화면 속 글자는 넣지 않는다.',
    'caption은 사진과 함께 보내는 인물의 한국어 한마디다. 1~2문장, 80자 이내로 인물의 성격과 말투를 그대로 살린다. 별표 지문은 쓰지 않는다.',
    kind === 'chat'
      ? '지금은 대화 중에 상대에게 사진을 보내는 상황이다. recent 대화와 request(상대의 요청이나 네가 보내려던 장면)에 맞춘다. relationship.stage가 있으면 그 관계의 온도에 맞는 거리감과 표정을 고른다(초기 단계일수록 거리를 두고, 가까운 단계일수록 편하고 사적인 순간). caption은 relationship.speech_level에 맞는 존댓말이나 반말로 상대에게 직접 말한다.'
      : '지금은 너의 하루를 사진 한 장으로 남겨 공개 게시판에 올리는 상황이다. 너의 직업과 일상, 장소, 계절과 시간대(now)에 어울리는 순간을 고른다. previous의 장면과 겹치지 않게 한다. caption은 특정한 사람이 아니라 보는 사람 모두에게 남기는 짧은 글이다.',
  ].join('\n');
}

/** The prompt for the image model: the scene, the references for who the person is, and the limits on what is shown. */
export function loungePhotoImagePrompt(characterId: string, scene: string) {
  const character = getLoungeCharacter(characterId);
  return [
    'A candid, photorealistic smartphone-style photo of the adult person shown in the reference photos.',
    'Keep exactly the same face, hair and build as in the references; they are only for who the person is, not for pose, clothes or background.',
    character ? `Usual look (Korean description): ${character.look}.` : '',
    `Scene: ${scene.slice(0, 900)}`,
    'Natural light and colour, realistic skin and fabric, no filters. Fully clothed and tasteful: no nudity, no underwear or sleepwear, no sexual pose. No text, captions, watermarks or logos in the image.',
  ].filter(Boolean).join('\n');
}

/** Characters' time of day, in Korean time, for the scene. */
export function loungePhotoNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long', hour: 'numeric', hour12: false }).format(date);
  return parts;
}

/** A model's scene and caption, trimmed to what the database takes; undefined when unusable. */
export function readLoungePhotoScene(value: unknown): { scene: string; caption: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { scene, caption } = value as Record<string, unknown>;
  if (typeof scene !== 'string' || scene.trim().length < 10 || typeof caption !== 'string') return undefined;
  return { scene: scene.trim().slice(0, 600), caption: caption.replace(/\*/g, '').trim().slice(0, 200) };
}
