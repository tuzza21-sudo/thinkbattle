/**
 * When a 1:1 chat's background follows the place (2026-11-09, on the v4 engine's scene). The owner's rules:
 *  - at the start (the room is opened) the background is set from the place the chat is at, when it is stated;
 *  - when the member (or the talk) explicitly moves the two somewhere else, the background changes at once;
 *  - otherwise it does not change often: only when the engine's scene has stayed in the new place for a few turns and the
 *    last change was a while ago.
 * The server (api/lounge-images.ts, action "scene" with auto) decides with this and remembers what it did in the room's
 * background (`follow`); a background the member chose is never touched.
 */
export type SceneForFollow = { location: string; scene_type: string; activity?: string; time_of_day?: string };
/** What the background was last chosen for (kept in the room's background, under `follow`). */
export type SceneFollow = { key: string; at: number; place: string };
/** The engine's note of the last change of scene (companion state): the turn, the time, and whether the member asked for it. */
export type SceneChangeNote = { turn: number; at: number; explicit: boolean };

export const sceneFollowRules = {
  /** After a change, another that is not explicit waits this long. */
  minIntervalMs: 20 * 60_000,
  /** and the scene must have stayed in the new place for this many turns (scene_turns). */
  stableTurns: 3,
} as const;

const normalized = (text: string) => text.toLowerCase().replace(/[\s.,，。·—–\-~!?'"“”‘’()（）]/g, '');
/** Words that say nothing about where: the engine's stand-ins when it does not know the place. */
const vaguePlace = /각자|어딘가|알 수 없|모르|있는 곳|^기타$|^통화$|^전화$|전화 통화$/;

/** The place of the engine's scene when it is a stated one; undefined when it is only "where each is". */
export function stateScenePlace(scene: Pick<SceneForFollow, 'location'> | undefined) {
  const place = scene?.location?.replace(/\s+/g, ' ').trim();
  return place && place.length >= 2 && !vaguePlace.test(place) ? place : undefined;
}

const timeWords = /^(?:이른\s*|늦은\s*|한\s*)?(?:새벽|아침|오전|낮|점심|오후|저녁|밤|한밤|심야|해\s*질\s*녘)(?:\s*\S*?\s*시)?\s*[,，·\-—–]?\s*/;
/**
 * The place a chat's summary line ("지금 장면: …") states, for a chat the engine has no scene for yet: the line without its
 * time of day. A call line ("통화 중 — …") states no place of its own. Undefined when nothing is stated.
 */
export function placeFromSceneLine(line: string | undefined) {
  let text = (line ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 4 || /^통화 중/.test(text)) return undefined;
  for (let guard = 0; guard < 2; guard += 1) text = text.replace(timeWords, '');
  const place = text.split(/[.。;；]|\s[—–-]\s/)[0].trim().slice(0, 60);
  return place.length >= 3 && !vaguePlace.test(place) ? place : undefined;
}

export type SceneFollowInput = {
  /** A background the member chose: not touched. */
  manual?: boolean;
  scene?: SceneForFollow;
  /** The chat's summary scene line, used when the engine has no scene. */
  memoryLine?: string;
  sceneTurns: number;
  change?: SceneChangeNote;
  follow?: SceneFollow;
  now: number;
};
export type SceneFollowDecision =
  | { action: 'keep'; reason: 'manual' | 'no_place' | 'same' | 'too_soon' }
  | { action: 'apply'; reason: 'first' | 'explicit' | 'moved'; key: string; place: string };

export function sceneFollowKey(scene: SceneForFollow | undefined, place: string) {
  return `${scene?.scene_type ?? ''}|${normalized(place).slice(0, 30)}`;
}

export function decideSceneFollow(input: SceneFollowInput): SceneFollowDecision {
  if (input.manual) return { action: 'keep', reason: 'manual' };
  const fromEngine = stateScenePlace(input.scene);
  const place = fromEngine ?? placeFromSceneLine(input.memoryLine);
  if (!place) return { action: 'keep', reason: 'no_place' };
  const key = sceneFollowKey(fromEngine ? input.scene : undefined, place);
  const { follow, change, now } = input;
  // The start: the place is stated and nothing was decided for this chat yet.
  if (!follow) return { action: 'apply', reason: 'first', key, place };
  if (follow.key === key) return { action: 'keep', reason: 'same' };
  // An explicit move, made after the last decision, changes it at once, however recently the last change was.
  if (fromEngine && change?.explicit && change.at > follow.at) return { action: 'apply', reason: 'explicit', key, place };
  // Otherwise not often: the new place has held for a few turns, and the last change was a while ago.
  const stable = fromEngine ? input.sceneTurns >= sceneFollowRules.stableTurns : true;
  if (stable && now - follow.at >= sceneFollowRules.minIntervalMs) return { action: 'apply', reason: 'moved', key, place };
  return { action: 'keep', reason: 'too_soon' };
}

/** What the model is told about the scene when it picks the background. */
export function sceneForMatch(scene: SceneForFollow | undefined, place: string) {
  if (!scene || !stateScenePlace(scene)) return place;
  return [place, scene.activity, scene.time_of_day, scene.scene_type ? `(${scene.scene_type})` : ''].filter(Boolean).join(' · ').slice(0, 300);
}

/**
 * What the follow reads of a chat's companion state (the JSON the engine keeps): its scene, how many turns the scene has held and the
 * last change. Read here, field by field, so the function that decides does not load the whole engine.
 */
export function readEngineScene(raw: unknown): { scene?: SceneForFollow; sceneTurns: number; change?: SceneChangeNote } {
  const state = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const scene = state.scene && typeof state.scene === 'object' ? state.scene as Record<string, unknown> : undefined;
  const location = text(scene?.location, 60);
  const note = state.scene_change && typeof state.scene_change === 'object' ? state.scene_change as Record<string, unknown> : undefined;
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const change = finite(note?.turn) !== undefined && finite(note?.at) !== undefined ? { turn: note!.turn as number, at: note!.at as number, explicit: note!.explicit === true } : undefined;
  return {
    ...(location ? { scene: { location, scene_type: text(scene?.scene_type, 12), activity: text(scene?.activity, 60), time_of_day: text(scene?.time_of_day, 20) } } : {}),
    sceneTurns: finite(state.scene_turns) ?? 0,
    ...(change ? { change } : {}),
  };
}

export function readSceneFollow(value: unknown): SceneFollow | undefined {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
  return item && typeof item.key === 'string' && typeof item.at === 'number' && Number.isFinite(item.at) ? { key: item.key.slice(0, 60), at: item.at, place: typeof item.place === 'string' ? item.place.slice(0, 80) : '' } : undefined;
}
