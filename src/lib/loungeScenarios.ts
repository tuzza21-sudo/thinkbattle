// .js paths: the Node functions in api/ compile this file on its own, where imports must name the file.
import type { LoungeHostId, LoungeThemeId } from './lounge.js';

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
export type LoungeRoomScenario = Pick<LoungeScenarioRow, 'id' | 'title' | 'prologue' | 'user_role' | 'relationship' | 'place'>;

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
/** A room's scenario as stored, or nothing when the room has none (or it is unreadable). */
export function normalizeLoungeRoomScenario(raw: unknown): LoungeRoomScenario | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const scenario = { id: text(value.id, 60), title: text(value.title, 40), prologue: text(value.prologue, 700), user_role: text(value.user_role, 120), relationship: text(value.relationship, 200), place: text(value.place, 200) };
  return scenario.id && scenario.prologue ? scenario : undefined;
}

/** The limits the database checks, for the admin form. */
export const loungeScenarioLimits = { title: 40, hook: 120, prologue: 700, user_role: 120, relationship: 200, place: 200 } as const;
