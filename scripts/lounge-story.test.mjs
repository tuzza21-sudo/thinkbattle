import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
import { checkStory } from './upsert-lounge-story.mjs';

const story = loadTs(fileURLToPath(new URL('../src/lib/loungeStory.ts', import.meta.url)));
const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const blackRose = JSON.parse(readFileSync(new URL('../docs/stories/velvet-black-rose.json', import.meta.url), 'utf8'));
const episodes = story.normalizeLoungeStoryEpisodes(blackRose.episodes);
const velvetStages = relationship.relationshipConfigs.velvet.stages.filter(stage => stage.enabled !== false).map(stage => stage.id);

test('《검은 장미》 is six episodes, each with checkpoints the page keeps, and gates that are real stages of 선우령', () => {
  assert.deepEqual(checkStory(blackRose), [], 'the file passes the same check as the upload');
  assert.equal(episodes.length, 6);
  assert.deepEqual(episodes.map(episode => episode.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(episodes[0].opening, '', 'the first episode opens with the prologue');
  for (const episode of episodes) {
    assert.ok(episode.checkpoints.length >= 3, `episode ${episode.number} asks for a few moments`);
    assert.ok(episode.lead && episode.goal && episode.ending, `episode ${episode.number} says how she leads it and how it ends`);
    if (episode.gate) assert.ok(velvetStages.includes(episode.gate), `episode ${episode.number}: ${episode.gate} is a stage of hers`);
    if (episode.number > 1) assert.ok(episode.opening.length > 100, `episode ${episode.number} opens with a scene`);
  }
  assert.ok(blackRose.prologue.length <= 3000, 'the prologue fits even before the 12,000-character migration');
  assert.match(blackRose.prologue, /당신/, 'the prologue tells the member as 당신, for their nickname');
});

test('a story starts in its first episode, and the state is kept to the checkpoints of the episode it is in', () => {
  assert.deepEqual(story.normalizeLoungeStoryState(null, episodes), { episode: 0, done: [], opened: true, complete: false });
  assert.deepEqual(story.normalizeLoungeStoryState({ episode: 1, done: ['order', 'envelope', 'order'], opened: false }, episodes), { episode: 1, done: ['order'], opened: false, complete: false }, 'an id from another episode is dropped');
  assert.equal(story.normalizeLoungeStoryState({ episode: 99 }, episodes).episode, 5, 'never past the last episode');
});

test('the character is told only the current episode: what is open, what is done, and when to close it', () => {
  const first = story.loungeStoryEpisodeContext(episodes, { episode: 0, done: ['envelope'], opened: true, complete: false }, true);
  assert.equal(first.number, 1); assert.equal(first.total, 6);
  assert.deepEqual(first.checkpoints_open.map(point => point.id), ['missing-lines', 'her-signature', 'choice']);
  assert.deepEqual(first.checkpoints_done, ['봉투 속 보고서를 털어놓기']);
  assert.equal(first.closing, undefined, 'not closed while something is open');
  assert.equal(first.just_started, undefined, 'the first episode is opened by the prologue');
  assert.ok(!JSON.stringify(first).includes(episodes[1].title), 'nothing of the next episode');
  const all = ['envelope', 'missing-lines', 'her-signature', 'choice'];
  assert.equal(story.loungeStoryEpisodeContext(episodes, { episode: 0, done: all, opened: true, complete: false }, true).closing, 'ending');
  // The second episode needs her interest: done but not trusted enough yet, the two keep talking in the scene.
  const second = episodes[1].checkpoints.map(point => point.id);
  assert.equal(story.loungeStoryEpisodeContext(episodes, { episode: 1, done: second, opened: true, complete: false }, false).closing, 'waiting_for_trust');
  const opening = story.loungeStoryEpisodeContext(episodes, { episode: 1, done: [], opened: false, complete: false }, true);
  assert.equal(opening.just_started, true); assert.equal(opening.opening, episodes[1].opening, 'a new episode is opened from its opening');
});

test('a turn ticks the checkpoints it met, and the next episode follows once the ending was told and the stage allows it', () => {
  const start = { episode: 0, done: [], opened: true, complete: false };
  let step = story.advanceLoungeStory(episodes, start, ['envelope', 'not-a-checkpoint', 'order'], true);
  assert.deepEqual(step.state.done, ['envelope'], 'only checkpoints of this episode count'); assert.equal(step.advanced, false);
  step = story.advanceLoungeStory(episodes, { ...start, done: ['envelope', 'missing-lines', 'her-signature'] }, ['choice'], true);
  assert.equal(step.state.episode, 0, 'the turn that meets the last checkpoint does not move on: the next reply tells the ending');
  assert.equal(step.state.done.length, 4);
  step = story.advanceLoungeStory(episodes, step.state, [], true);
  assert.deepEqual(step.state, { episode: 1, done: [], opened: false, complete: false }); assert.equal(step.advanced, true);
  // Episode two: all done, but she is not interested enough yet.
  const second = { episode: 1, done: episodes[1].checkpoints.map(point => point.id), opened: true, complete: false };
  assert.equal(story.advanceLoungeStory(episodes, second, [], false).state.episode, 1, 'the relationship holds the story');
  assert.equal(story.advanceLoungeStory(episodes, second, [], true).state.episode, 2);
  // The last episode completes the story.
  const last = { episode: 5, done: episodes[5].checkpoints.map(point => point.id), opened: true, complete: false };
  assert.deepEqual(story.advanceLoungeStory(episodes, last, [], false).state, { ...last, complete: true });
  assert.equal(story.loungeStoryEpisodeContext(episodes, { ...last, complete: true }, true).closing, 'story_end');
  // A new episode is marked opened after its first reply, even if nothing was met yet.
  assert.equal(story.advanceLoungeStory(episodes, { episode: 2, done: [], opened: false, complete: false }, [], true).state.opened, true);
});

test('a stage gate is met at that stage or later, and an episode without one is always open', () => {
  assert.equal(story.loungeStoryStageReached(episodes[1], velvetStages, 'DISMISSIVE'), false);
  assert.equal(story.loungeStoryStageReached(episodes[1], velvetStages, 'INTRIGUED'), true);
  assert.equal(story.loungeStoryStageReached(episodes[1], velvetStages, 'DRAWN_IN'), true);
  assert.equal(story.loungeStoryStageReached(episodes[0], velvetStages, undefined), true);
  assert.equal(story.loungeStoryStageReached({ ...episodes[1], gate: 'NO_SUCH_STAGE' }, velvetStages, 'DISMISSIVE'), true, 'an unknown gate does not lock a story');
});

test('a story file with a broken episode is refused before anything is sent', () => {
  const broken = { ...blackRose, episodes: [...blackRose.episodes.slice(0, 1), { ...blackRose.episodes[1], opening: '', checkpoints: [{ id: 'Bad Id', label: '', detail: '' }] }] };
  const problems = checkStory(broken);
  assert.ok(problems.some(problem => /episode 2/.test(problem)));
  assert.ok(problems.some(problem => /no opening/.test(problem)));
});
