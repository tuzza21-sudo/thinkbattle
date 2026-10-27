// .js paths: the Node functions in api/ compile this file on its own, where imports must name the file.
import type { LoungeHostId, LoungeThemeId } from './lounge.js';
import { normalizeLoungeStoryEpisodes, type LoungeStoryEpisode } from './loungeStory.js';

/**
 * Stories a member can start with a character (scenarios), kept in lounge_scenarios and edited by the super admin.
 * Starting one opens a one-to-one chat in story mode: the prologue is shown first (no waiting), then the character
 * opens the first scene. The member plays `user_role`; `relationship` is where the two start (it sets the tone from
 * the first line); `place` is the first scene and `theme` the room's scenery.
 */
export type LoungeScenarioRow = {
  id: string; character_id: LoungeHostId; title: string;
  /** One line on the card. */
  hook: string;
  /** Told to the member before the story starts, in the second person. */
  prologue: string;
  user_role: string; relationship: string; place: string; theme: LoungeThemeId; sort: number; active: boolean;
  /** A story in episodes (see loungeStory.ts); none for a story told in one go. */
  episodes?: LoungeStoryEpisode[] | null;
};
/**
 * A house character's one-to-one conversation starts only from one of its stories (2026-10-23): the free chat and voice
 * entries ("둘이서 대화", "둘이서 시작하기") lead to the character's stories instead. Members' own characters, which
 * have no stories, keep their chat. Set to false to open the free one-to-one again.
 */
export const loungeOneToOneStoriesOnly = true;
/** The character page section that lists a character's stories. */
export const loungeStoriesPath = (characterId: string) => `/lounge/characters/${characterId}#stories`;
/** The copy of a scenario a room keeps (rooms.scenario), so editing the scenario does not change a story under way. */
export type LoungeRoomScenario = Pick<LoungeScenarioRow, 'id' | 'title' | 'prologue' | 'user_role' | 'relationship' | 'place'> & {
  /** What the member wrote about themselves when they started (2026-10-28): told to the character, never spoken for the member. */
  member_note?: string;
  /** The story's episodes, copied with it (see loungeStory.ts). */
  episodes?: LoungeStoryEpisode[];
};
/** How long that note may be (characters): by plan 500, 1,000 and 2,000; 1,000 for everyone during the test opening. */
export const loungeMemberNoteLimits = { standard: 500, plus: 1000, pro: 2000, current: 1000 } as const;

/** Whether a name ends in a final consonant (and whether it is ㄹ), to choose 은/는, 이/가, 을/를, 과/와, (으)로. */
function finalSound(name: string) {
  const last = name.slice(-1), code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) { const final = (code - 0xac00) % 28; return { consonant: final > 0, rieul: final === 8 }; }
  if (/[0-9]/.test(last)) return { consonant: '013678'.includes(last), rieul: '178'.includes(last) };
  if (/[a-z]/i.test(last)) return { consonant: /[lmn]/i.test(last), rieul: /l/i.test(last) };
  return { consonant: false, rieul: false };
}
/**
 * A story told with the member's own name (2026-10-26): "당신" in the narration becomes their nickname, with the
 * particle that fits it ("당신은" → "지수는", "당신을" → "지수를"). Inside quotes it stays: there someone is speaking to them.
 */
export function personalizeLoungeStory(story: string, name?: string | null) {
  const who = name?.replace(/\s+/g, ' ').trim();
  if (!who || !story.includes('당신')) return story;
  const { consonant, rieul } = finalSound(who);
  const particles: Record<string, string> = {
    은: consonant ? '은' : '는', 이: consonant ? '이' : '가', 을: consonant ? '을' : '를', 과: consonant ? '과' : '와',
    으로: consonant && !rieul ? '으로' : '로', 이라: consonant ? '이라' : '라', 이랑: consonant ? '이랑' : '랑', 이었: consonant ? '이었' : '였', 이야: consonant ? '이야' : '야',
  };
  return story.split(/(“[^”]*”|"[^"]*")/).map((part, index) => index % 2 ? part
    : part.replace(/당신(으로|이라|이랑|이었|이야|은|이|을|과)?/g, (_, particle?: string) => who + (particle ? particles[particle] : ''))).join('');
}

/** Paragraphs are told in blocks of about this many characters: one paragraph at a time was tiring to read (2026-10-27). */
export const storyIntroBlockSize = 420;
export function storyIntroBlocks(paragraphs: readonly string[], size = storyIntroBlockSize) {
  const blocks: string[][] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (!blocks.length || length >= size) { blocks.push([]); length = 0; }
    blocks[blocks.length - 1].push(paragraph); length += paragraph.length;
  }
  return blocks;
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
/** A room's scenario as stored, or nothing when the room has none (or it is unreadable). */
export function normalizeLoungeRoomScenario(raw: unknown): LoungeRoomScenario | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const scenario: LoungeRoomScenario = { id: text(value.id, 60), title: text(value.title, 40), prologue: text(value.prologue, loungeScenarioLimits.prologue), user_role: text(value.user_role, 120), relationship: text(value.relationship, 200), place: text(value.place, 200) };
  const note = text(value.member_note, loungeMemberNoteLimits.pro);
  if (note) scenario.member_note = note;
  const episodes = normalizeLoungeStoryEpisodes(value.episodes);
  if (episodes.length) scenario.episodes = episodes;
  return scenario.id && scenario.prologue ? scenario : undefined;
}

/** The limits the database checks, for the admin form (a prologue opens full screen and may run to 12,000 characters since 2026-10-27). */
export const loungeScenarioLimits = { title: 40, hook: 120, prologue: 12000, user_role: 120, relationship: 200, place: 200 } as const;
