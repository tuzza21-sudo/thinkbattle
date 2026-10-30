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
    // 2026-10-30: the member answers with feelings and choices, at most three a episode; she reads the records herself.
    assert.ok(episode.checkpoints.length >= 2 && episode.checkpoints.length <= 3, `episode ${episode.number} asks for two or three moments`);
    assert.match(episode.lead, /선우령이 직접 읽고/, `episode ${episode.number}: the case's details are hers to explain`);
    for (const point of episode.checkpoints) assert.doesNotMatch(point.detail, /경로|패턴|이니셜|순서를 말하|짚는다/, `${point.id} does not ask the member to work out the case`);
    assert.ok(episode.lead && episode.goal && episode.ending, `episode ${episode.number} says how she leads it and how it ends`);
    if (episode.gate) assert.ok(velvetStages.includes(episode.gate), `episode ${episode.number}: ${episode.gate} is a stage of hers`);
    if (episode.number > 1) assert.ok(episode.opening.length > 100, `episode ${episode.number} opens with a scene`);
  }
  assert.ok(blackRose.prologue.length <= 3000, 'the prologue fits even before the 12,000-character migration');
  assert.match(blackRose.prologue, /당신/, 'the prologue tells the member as 당신, for their nickname');
});

test('a story starts in its first episode, and the state is kept to the checkpoints of the episode it is in', () => {
  assert.deepEqual(story.normalizeLoungeStoryState(null, episodes), { episode: 0, done: [], opened: true, complete: false });
  assert.deepEqual(story.normalizeLoungeStoryState({ episode: 1, done: ['escape', 'envelope', 'escape'], opened: false }, episodes), { episode: 1, done: ['escape'], opened: false, complete: false }, 'an id from another episode is dropped');
  assert.equal(story.normalizeLoungeStoryState({ episode: 99 }, episodes).episode, 5, 'never past the last episode');
});

test('the character is told only the current episode: what is open, what is done, and when to close it', () => {
  const first = story.loungeStoryEpisodeContext(episodes, { episode: 0, done: ['envelope'], opened: true, complete: false }, true);
  assert.equal(first.number, 1); assert.equal(first.total, 6);
  assert.deepEqual(first.checkpoints_open.map(point => point.id), ['her-signature', 'choice']);
  assert.deepEqual(first.checkpoints_done, ['봉투를 보여 줄지 정하기']);
  assert.equal(first.closing, undefined, 'not closed while something is open');
  assert.equal(first.just_started, undefined, 'the first episode is opened by the prologue');
  assert.ok(!JSON.stringify(first).includes(episodes[1].title), 'nothing of the next episode');
  const all = ['envelope', 'her-signature', 'choice'];
  assert.equal(story.loungeStoryEpisodeContext(episodes, { episode: 0, done: all, opened: true, complete: false }, true).closing, 'ending');
  // The second episode needs her interest: done but not trusted enough yet, the two keep talking in the scene.
  const second = episodes[1].checkpoints.map(point => point.id);
  assert.equal(story.loungeStoryEpisodeContext(episodes, { episode: 1, done: second, opened: true, complete: false }, false).closing, 'waiting_for_trust');
  const opening = story.loungeStoryEpisodeContext(episodes, { episode: 1, done: [], opened: false, complete: false }, true);
  assert.equal(opening.just_started, true); assert.equal(opening.opening, episodes[1].opening, 'a new episode is opened from its opening');
});

test('a turn ticks the checkpoints it met, and the next episode follows once the ending was told and the stage allows it', () => {
  const start = { episode: 0, done: [], opened: true, complete: false };
  let step = story.advanceLoungeStory(episodes, start, ['envelope', 'not-a-checkpoint', 'escape'], true);
  assert.deepEqual(step.state.done, ['envelope'], 'only checkpoints of this episode count'); assert.equal(step.advanced, false);
  step = story.advanceLoungeStory(episodes, { ...start, done: ['envelope', 'her-signature'] }, ['choice'], true);
  assert.equal(step.state.episode, 0, 'the turn that meets the last checkpoint does not move on: the next reply tells the ending');
  assert.equal(step.state.done.length, 3);
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

test('replies without progress make the character lead more firmly, and meeting a checkpoint lets it follow again', () => {
  let state = { episode: 0, done: [], opened: true, complete: false };
  assert.equal(story.loungeStoryEpisodeContext(episodes, state, true).pace, 'follow');
  for (let turn = 0; turn < story.loungeStoryPaceTurns.nudge; turn++) state = story.advanceLoungeStory(episodes, state, [], true).state;
  assert.equal(state.idle, story.loungeStoryPaceTurns.nudge);
  assert.equal(story.loungeStoryEpisodeContext(episodes, state, true).pace, 'nudge');
  for (let turn = state.idle; turn < story.loungeStoryPaceTurns.steer; turn++) state = story.advanceLoungeStory(episodes, state, [], true).state;
  assert.equal(story.loungeStoryEpisodeContext(episodes, state, true).pace, 'steer');
  state = story.advanceLoungeStory(episodes, state, ['envelope'], true).state;
  assert.equal(state.idle, undefined, 'a met checkpoint starts the count again');
  assert.equal(story.loungeStoryEpisodeContext(episodes, state, true).pace, 'follow');
  assert.equal(story.loungeStoryEpisodeContext(episodes, { ...state, done: ['envelope', 'her-signature', 'choice'] }, true).pace, undefined, 'nothing to lead toward once all are met');
  assert.equal(story.normalizeLoungeStoryState({ ...state, idle: 7 }, episodes).idle, 7, 'the count is kept with the room');
});

test('what the two settled is kept across episodes, told to the character, and the next episode can be rewritten to it', () => {
  const settled = '다음 주 토요일 저녁, 쿠킹 스튜디오 대신 일반 식당에서 만나기로 했다';
  let step = story.advanceLoungeStory(episodes, { episode: 0, done: [], opened: true, complete: false }, [], true, [settled, '']);
  assert.deepEqual(step.state.facts, [settled]);
  assert.deepEqual(story.loungeStoryEpisodeContext(episodes, step.state, true).agreed, [settled]);
  step = story.advanceLoungeStory(episodes, { ...step.state, done: episodes[0].checkpoints.map(point => point.id) }, [], true, [settled]);
  assert.equal(step.advanced, true); assert.deepEqual(step.state.facts, [settled], 'the same fact once, carried into the next episode');
  const second = episodes[1];
  const adapted = story.readLoungeStoryAdaptation({ opening: '토요일 저녁, 골목 안쪽의 작은 비스트로.', scene: '토요일 저녁, 작은 비스트로', goal: '', lead: '', ending: '', checkpoints: [{ id: second.checkpoints[0].id, detail: '식당에서 바뀐 일' }, { id: 'made-up', detail: 'x' }] }, second, 1);
  assert.equal(adapted.scene, '토요일 저녁, 작은 비스트로'); assert.equal(adapted.goal, second.goal, 'what the model left empty stays as written');
  assert.deepEqual(adapted.checkpoints.map(point => point.id), second.checkpoints.map(point => point.id), 'the checkpoints keep their ids; an unknown one is dropped');
  const state = story.normalizeLoungeStoryState({ ...step.state, adapted }, episodes);
  const episode = story.loungeStoryEpisodeAt(episodes, state);
  assert.equal(episode.opening, '토요일 저녁, 골목 안쪽의 작은 비스트로.'); assert.equal(episode.title, second.title);
  assert.equal(story.loungeStoryEpisodeContext(episodes, state, true).checkpoints_open[0].what, '식당에서 바뀐 일');
  assert.equal(story.normalizeLoungeStoryState({ ...state, episode: 2, opened: false }, episodes).adapted, undefined, 'a rewrite of another episode is not used');
  assert.equal(story.readLoungeStoryAdaptation({ scene: '' }, second, 1), undefined, 'a rewrite without a scene is refused');
});

test('a checkpoint with choices shows them once the character puts that moment to the member, until the member answers', () => {
  const raw = [{ title: '선택', checkpoints: [
    { id: 'talk', label: '말하기', detail: 'x' },
    { id: 'kiss', label: '합의에 답하기', detail: 'x', choices: ['허락할게요.', '안 돼요.', '허락할게요.', ''] },
    { id: 'one', label: '하나뿐', detail: 'x', choices: ['혼자'] },
  ] }];
  const [episode] = story.normalizeLoungeStoryEpisodes(raw);
  assert.deepEqual(episode.checkpoints[1].choices, ['허락할게요.', '안 돼요.'], 'the same choice once, an empty one dropped');
  assert.equal(episode.checkpoints[0].choices, undefined); assert.equal(episode.checkpoints[2].choices, undefined, 'one choice is no choice');
  const episodes = [episode];
  const start = story.normalizeLoungeStoryState(null, episodes);
  assert.equal(story.advanceLoungeStory(episodes, start, [], true, [], 'talk').state.asking, undefined, 'a checkpoint without choices is answered in words');
  let state = story.advanceLoungeStory(episodes, start, ['talk'], true, [], 'kiss').state;
  assert.equal(state.asking, 'kiss');
  assert.deepEqual(story.loungeStoryChoices(episodes, state), { id: 'kiss', label: '합의에 답하기', choices: ['허락할게요.', '안 돼요.'] });
  assert.deepEqual(story.loungeStoryEpisodeContext(episodes, state, true).checkpoints_open.find(point => point.id === 'kiss').choices, ['허락할게요.', '안 돼요.'], 'the character knows the choices');
  assert.equal(story.normalizeLoungeStoryState(state, episodes).asking, 'kiss', 'kept with the room');
  assert.equal(story.advanceLoungeStory(episodes, state, [], true, [], '').state.asking, undefined, 'a reply that moved on clears it');
  state = story.advanceLoungeStory(episodes, state, ['kiss'], true, [], 'kiss').state;
  assert.equal(state.asking, undefined, 'a choice made is not asked again');
  assert.equal(story.loungeStoryChoices(episodes, { ...state, asking: 'kiss' }), undefined);
  assert.equal(story.normalizeLoungeStoryState({ ...start, asking: 'made-up' }, episodes).asking, undefined);
});

for (const [file, characterId, count] of [['closer-contract-love', 'closer', 5], ['auditor-vip-match', 'auditor', 6]]) {
  test(`${file} continues the story card's own prologue, with gates that are real stages and a branch the member picks`, () => {
    const file_ = JSON.parse(readFileSync(new URL(`../docs/stories/${file}.json`, import.meta.url), 'utf8'));
    const kept = story.normalizeLoungeStoryEpisodes(file_.episodes);
    const stages = relationship.relationshipConfigs[characterId].stages.filter(stage => stage.enabled !== false).map(stage => stage.id);
    assert.deepEqual(checkStory(file_), []);
    assert.equal(file_.id, file, 'the existing card, not a second one');
    assert.equal(kept.length, count);
    assert.equal(kept[0].opening, '', 'the first episode follows the prologue');
    for (const episode of kept) if (episode.gate) assert.ok(stages.includes(episode.gate), `episode ${episode.number}: ${episode.gate}`);
    assert.ok(kept.some(episode => episode.checkpoints.some(point => point.choices)), 'the member picks at least one branch');
  });
}

test('《6개월의 연인》 keeps its secrets until their episode, never says "아가씨", and ends its first part with three months left', () => {
  const closer = story.normalizeLoungeStoryEpisodes(JSON.parse(readFileSync(new URL('../docs/stories/closer-contract-love.json', import.meta.url), 'utf8')).episodes);
  assert.deepEqual(closer.map(episode => episode.checkpoints.filter(point => point.choices).map(point => point.id)), [[], ['kiss'], ['the-register'], ['that-night'], ['sign']]);
  assert.ok(closer[0].keep.some(item => item.includes('시행사')) && closer[2].reveal.some(item => item.includes('시행사')), 'the company is kept, then told in the third');
  assert.ok(closer.every(episode => episode.keep.length), 'he keeps something in every episode');
  assert.ok(!JSON.stringify(closer).includes('아가씨'), 'the member is 상무님, whatever their gender');
  assert.match(closer[4].ending, /남은 3개월/);
});
