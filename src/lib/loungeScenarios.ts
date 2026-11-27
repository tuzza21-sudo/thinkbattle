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
/**
 * Stories in which the character already speaks 반말 to the member from the prologue on, whatever the stage's speech
 * level (2026-11-01): 윤지안 and her friend of three years had been speaking politely, as the first stage asks of
 * strangers, since a rule saying "follow the prologue" did not hold against the stage. The rest start politely.
 */
export const loungeScenarioCasualStart: ReadonlySet<string> = new Set(['diplomat-old-friend-fling']);
/** Keep the agreed contract's ordinary dates separate from the engine's limits on disclosing new feelings. */
export function loungeScenarioRelationshipContext<T extends { outing: string }>(context: T, scenario: Pick<LoungeRoomScenario, 'id'> | undefined, characterId: string): T {
  if (characterId === 'auditor') return {
    ...context,
    outing: '연애와 만남에 능숙한 서도현은 이야기 속 식사·술 한잔·산책 같은 평범한 데이트와 다음 만남을 첫 단계부터 먼저 제안하고 수락할 수 있다. 낮은 관계 단계만으로 관심 표현과 약속을 보류하지 않는다. 자신의 일정과 취향에 따라 원하지 않으면 거절하거나 다른 안을 내놓고, 실제 함께 이동하거나 만나는 선택은 상대에게 남긴다. 이미 합의한 약속은 유지하며 새로운 신체적 친밀감과 둘만의 여행은 현재 동의와 관계에 맞춘다.',
  };
  // 윤지안 and the member are friends of three years (2026-11-05: she put off a movie and a jog for "the documents").
  if (characterId === 'diplomat') return {
    ...context,
    outing: '3년 된 친구 사이라 영화, 밥, 술 한잔, 산책 같은 평범한 약속은 자기 기분과 일정으로 판단하고 먼저 제안한다. 바쁘거나 내키지 않으면 짧게 거절하며 실제로 원할 때 다른 안을 낸다. 아직 연인이 아니면 데이트나 새로운 관계를 재촉받아 확정하지 않는다. 이미 서로 사귀기로 수락한 기록이 있으면 그 현재 관계에서 판단하고 다시 미정으로 돌리지 않는다. 여행이나 하룻밤은 사귀는 것과 별개로 자기 뜻과 현재 동의에 따라 정한다.',
  };
  if (characterId !== 'closer' || scenario?.id !== 'closer-contract-love') return context;
  return {
    ...context,
    outing: '현재 계약이 초안·제안 상태면 회의실에서 기간·보수·연인 역할의 범위를 실제 대화로 협상한다. 서명과 합의가 끝났다고 미리 처리하거나 가족 식사 장면으로 건너뛰지 않는다. 실제로 합의한 계약연애가 유효한 동안에는 가족 앞에서만 연기하지 않고 둘만의 평범한 데이트에도 성실하게 참여한다. 식사나 산책은 관계 단계가 낮다는 이유로 일괄 거절하지 않고, 일정과 취향에 따라 먼저 제안하거나 대안을 말한다. 기억에 명시적인 계약 종료나 합의 변경이 있으면 그 현재 상태를 따른다. 사랑의 감정이나 스킨십을 의무로 요구하지 않으며 상대의 거절을 존중한다.',
  };
}
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

/**
 * A story's prologue as the paragraphs of one page (2026-11-17). Prologues were written in different shapes (a blank line
 * between every line, or lines run together), so one page cuts them the same way: every line is a paragraph, and it is
 * told as dialogue ("..." or “...”), a note ([...]) or narration.
 */
export type StoryPageParagraph = { text: string; kind: 'line' | 'note' | 'text' };
export const storyPageParagraphs = (story: string): StoryPageParagraph[] => story.split(/\n+/).map(line => line.trim()).filter(Boolean)
  .map(line => ({ text: line, kind: /^["“]/.test(line) ? 'line' : /^\[/.test(line) ? 'note' : 'text' }));

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
