// .js paths: the Node functions in api/ compile this file on its own, where imports must name the file.
/**
 * Stories told in episodes (2026-10-28, first used by 선우령's 《검은 장미》). A story may have episodes; each has a scene, a
 * goal, what the character may and may not reveal, and checkpoints: things that must happen in the conversation before
 * the story moves on. The character leads the conversation toward the open checkpoints, one at a time. After each reply a
 * second call says which checkpoints that turn met; once all of an episode's are met and the relationship has reached
 * the episode's stage, the next episode opens (its opening is shown full screen and the character opens its first scene).
 *
 * The format is the same for every story (docs/stories/*.json, loaded with scripts/upsert-lounge-story.mjs), so the next
 * story is a file, not code.
 */

export type LoungeStoryCheckpoint = {
  /** Short, stable id (letters, numbers and hyphens). */
  id: string;
  /** What the member sees in the episode's progress, written as something to do ("내일 아침 10시, 선택하기"). */
  label: string;
  /** What counts as done, for the model that checks it. */
  detail: string;
};
export type LoungeStoryEpisode = {
  number: number;
  title: string;
  /** Told full screen when the episode opens. Empty for the first episode, which opens with the story's prologue. */
  opening: string;
  /** Where and when the episode happens, for the character. */
  scene: string;
  /** What the episode is for. */
  goal: string;
  /** How the character leads the conversation in this episode. */
  lead: string;
  checkpoints: LoungeStoryCheckpoint[];
  /** What the character may tell in this episode, whatever the relationship stage. */
  reveal: string[];
  /** What the character keeps for later episodes. */
  keep: string[];
  /** The relationship stage (id) the two must have reached before the next episode opens; empty for none. */
  gate: string;
  /** How the episode closes once its checkpoints are met. */
  ending: string;
};
/** Where a room is in its story: the episode (0-based), the checkpoints met in it, and whether its first scene was told. */
export type LoungeStoryState = { episode: number; done: string[]; opened: boolean; complete: boolean };

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const texts = (value: unknown, count: number, max: number) => Array.isArray(value) ? value.map(item => text(item, max)).filter(Boolean).slice(0, count) : [];
const idPattern = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** A story's episodes as stored, cleaned to the shape and sizes above; an unreadable episode or checkpoint is left out. */
export function normalizeLoungeStoryEpisodes(raw: unknown): LoungeStoryEpisode[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).flatMap((item, index): LoungeStoryEpisode[] => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    const checkpoints = Array.isArray(value.checkpoints) ? value.checkpoints.slice(0, 8).flatMap((point): LoungeStoryCheckpoint[] => {
      if (!point || typeof point !== 'object') return [];
      const entry = point as Record<string, unknown>;
      const id = text(entry.id, 40), label = text(entry.label, 60), detail = text(entry.detail, 400);
      return idPattern.test(id) && label && detail ? [{ id, label, detail }] : [];
    }) : [];
    const title = text(value.title, 60);
    if (!title || !checkpoints.length) return [];
    return [{
      number: index + 1, title, opening: text(value.opening, 4000), scene: text(value.scene, 400), goal: text(value.goal, 600), lead: text(value.lead, 1500),
      checkpoints, reveal: texts(value.reveal, 8, 300), keep: texts(value.keep, 8, 300), gate: text(value.gate, 40), ending: text(value.ending, 600),
    }];
  });
}

/** A room's story state, made valid for its episodes (a new story starts at the first episode, its scene already told by the prologue). */
export function normalizeLoungeStoryState(raw: unknown, episodes: readonly LoungeStoryEpisode[]): LoungeStoryState {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const episode = Math.min(Math.max(0, Math.trunc(Number(value.episode)) || 0), Math.max(0, episodes.length - 1));
  const ids = new Set(episodes[episode]?.checkpoints.map(point => point.id) ?? []);
  const done = [...new Set(Array.isArray(value.done) ? value.done.filter((id): id is string => typeof id === 'string' && ids.has(id)) : [])];
  return { episode, done, opened: episode === 0 ? true : value.opened === true, complete: value.complete === true };
}

/**
 * What the character is told about the story's episode in a reply: the episode, the checkpoints still open and those met,
 * what may and may not be told, and whether this reply opens the episode. Nothing about later episodes.
 */
export function loungeStoryEpisodeContext(episodes: readonly LoungeStoryEpisode[], state: LoungeStoryState, stageReached: boolean) {
  const episode = episodes[state.episode];
  if (!episode) return undefined;
  const done = new Set(state.done);
  const allDone = episode.checkpoints.every(point => done.has(point.id));
  return {
    number: episode.number, total: episodes.length, title: episode.title, scene: episode.scene, goal: episode.goal, lead: episode.lead,
    ...(state.opened ? {} : { just_started: true, opening: episode.opening }),
    checkpoints_open: episode.checkpoints.filter(point => !done.has(point.id)).map(point => ({ id: point.id, what: point.detail })),
    checkpoints_done: episode.checkpoints.filter(point => done.has(point.id)).map(point => point.label),
    reveal: episode.reveal, keep: episode.keep,
    ...(allDone ? { closing: state.complete ? 'story_end' : !stageReached && state.episode < episodes.length - 1 ? 'waiting_for_trust' : 'ending', ending: episode.ending } : {}),
  };
}

/**
 * The state after a turn: the checkpoints it met (only ids of the current episode count). An episode whose checkpoints
 * were all met before this turn had its ending told in this reply, so (once the stage allows it) the next episode follows,
 * not yet opened; the last episode completes the story instead.
 */
export function advanceLoungeStory(episodes: readonly LoungeStoryEpisode[], state: LoungeStoryState, met: unknown, stageReached: boolean): { state: LoungeStoryState; advanced: boolean } {
  const episode = episodes[state.episode];
  if (!episode || state.complete) return { state, advanced: false };
  const ids = new Set(episode.checkpoints.map(point => point.id));
  const fresh = Array.isArray(met) ? met.filter((id): id is string => typeof id === 'string' && ids.has(id)) : [];
  const endingTold = episode.checkpoints.every(point => state.done.includes(point.id)) && (stageReached || state.episode >= episodes.length - 1);
  if (endingTold && state.episode >= episodes.length - 1) return { state: { ...state, opened: true, complete: true }, advanced: false };
  if (endingTold) return { state: { episode: state.episode + 1, done: [], opened: false, complete: false }, advanced: true };
  return { state: { ...state, done: [...new Set([...state.done, ...fresh])], opened: true }, advanced: false };
}

/** Whether a relationship stage (by its index among the enabled stages) has reached the episode's gate. */
export function loungeStoryStageReached(episode: LoungeStoryEpisode | undefined, stageIds: readonly string[], currentStage: string | undefined) {
  if (!episode?.gate) return true;
  const gate = stageIds.indexOf(episode.gate), current = stageIds.indexOf(currentStage ?? '');
  return gate < 0 || current >= gate;
}

/** The instructions for a story with episodes (added to the story mode instructions). */
export const loungeStoryEpisodeInstructions = `story_episode가 있으면 이 이야기는 여러 화로 나뉜다. 지금은 story_episode.number화(전체 total화)이고, scene은 이 화의 장소와 때, goal은 이 화에서 이뤄질 일이다.
- 너는 이 화를 이끈다. story_episode.lead대로 대화와 장면을 주도하며 checkpoints_open의 일들이 대화 속에서 일어나도록 이끈다. 한 번에 하나씩, 자연스럽게 장면과 질문, 선택지, 사건으로 사용자가 직접 말하거나 고르도록 만든다. 사용자의 대답이나 선택을 네가 대신 정하지 않는다. 사용자가 다른 이야기를 하면 먼저 받아 주고 장면 안에서 다시 이 화의 일로 데려온다.
- 이 화에서는 story_episode.reveal의 것은 관계 단계와 상관없이 말해도 되고, keep의 것은 아직 말하지 않으며 암시도 하지 않는다. 다음 화의 일을 앞당기지 않는다.
- just_started가 true면 이번 답은 이 화의 첫 장면이다. story_episode.opening 바로 다음 순간에서 장면을 열고, 사용자를 그 장면 안으로 끌어들인다. opening 문장을 되풀이하지 않는다.
- closing이 'ending'이면 이 화의 일이 모두 이뤄졌다. 이번 답에서 story_episode.ending대로 이 화를 닫는다(다음 화는 다음 장면에서 열린다). 'waiting_for_trust'면 이 화의 일은 이뤄졌지만 둘 사이가 아직 다음으로 갈 만큼 가깝지 않다. 사건을 서두르지 않고 이 장면 안에서 둘의 이야기(믿음, 망설임, 서로에 대한 궁금함)를 나눈다. 'story_end'면 이야기의 마지막 화가 끝났다. ending으로 이야기를 닫고, 그 뒤로는 이야기 밖의 여운 있는 대화를 이어 간다.`;
/**
 * The instruction for the call after the reply: which open checkpoints are met. A chat member often writes one thing in
 * several messages, and a checkpoint missed on its turn stayed open for good (2026-10-29: 선우령's "봉투 속 보고서" was
 * told and never counted), so everything the member said in `recent` counts, and the gist is enough.
 */
export const loungeStoryCheckpointInstructions = `story_checkpoints: story_episode.checkpoints_open 가운데 지금까지 이뤄진 것의 id. recent 안에서 사용자가 한 모든 발언(이번 턴에 여러 번 나눠 보낸 말, 앞서 했지만 아직 인정되지 않은 말 포함)과 캐릭터가 방금 한 답을 본다. 사용자가 실제로 말하거나 보여 주거나 고른 것만 인정하고, 캐릭터 혼자 말한 것이나 앞으로 할 일은 인정하지 않는다. what의 세부를 다 말하지 않아도 그 핵심(무엇을 털어놓았는지, 무엇을 골랐는지)이 사용자 말에 드러났으면 인정한다. 없으면 빈 배열.`;
