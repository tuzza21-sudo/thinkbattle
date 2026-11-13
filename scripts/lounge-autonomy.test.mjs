import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const autonomy = loadTs(fileURLToPath(new URL('../src/lib/loungeAutonomy.ts', import.meta.url)));
const messenger = loadTs(fileURLToPath(new URL('../src/lib/loungeMessenger.ts', import.meta.url)));

test('built-in hosts each have a Goal Planner seed', () => {
  for (const id of ['jaeseok', 'ina', 'auditor', 'closer', 'velvet', 'trickster', 'diplomat', 'shaman', 'guide', 'poker']) {
    const profile = autonomy.getLoungeAutonomyProfile(id);
    assert.ok(profile, id);
    assert.ok(profile.coreDrive.length > 10, id);
    assert.ok(profile.persistentGoals.length >= 2, id);
    assert.ok(profile.defaultIntention.length > 5, id);
  }
  assert.equal(autonomy.getLoungeAutonomyProfile('custom-made-up'), undefined);
});

test('self_share only when a gate opens; emotional turns stay on companion/hold', () => {
  const seeded = autonomy.seedLoungeAutonomyState('trickster', 1);
  const base = { characterId: 'trickster', autonomy: seeded, turn: 10 };

  assert.equal(autonomy.decideLoungeInitiative({
    ...base, analysis: { is_emotional_moment: true, topic_stale: true },
  }).stance, 'hold');

  assert.equal(autonomy.decideLoungeInitiative({
    ...base, analysis: { topic_stale: false }, latestUserText: '오늘 날씨 좋다',
  }).allowSelfShare, false);

  const stale = autonomy.decideLoungeInitiative({
    ...base, analysis: { topic_stale: true },
  });
  assert.equal(stale.stance, 'self_share');
  assert.equal(stale.allowSelfShare, true);

  const asked = autonomy.decideLoungeInitiative({
    ...base, analysis: { topic_stale: false }, latestUserText: '너는 뭐 해?',
  });
  assert.equal(asked.allowSelfShare, true);
  assert.equal(asked.reason, 'asked_life');
});

test('self_share cools down for a few turns', () => {
  const autonomyState = { ...autonomy.seedLoungeAutonomyState('trickster', 1), last_self_share_turn: 9 };
  const blocked = autonomy.decideLoungeInitiative({
    characterId: 'trickster', autonomy: autonomyState, turn: 10, analysis: { topic_stale: true },
  });
  assert.equal(blocked.allowSelfShare, false);
  const open = autonomy.decideLoungeInitiative({
    characterId: 'trickster', autonomy: autonomyState, turn: 12, analysis: { topic_stale: true },
  });
  assert.equal(open.allowSelfShare, true);
});

test('asks-about-character heuristic', () => {
  assert.equal(autonomy.loungeAsksAboutCharacterLife('너는 뭐 해?'), true);
  assert.equal(autonomy.loungeAsksAboutCharacterLife('방송은 어때'), true);
  assert.equal(autonomy.loungeAsksAboutCharacterLife('나는 요즘 뭐 하냐면'), false);
  assert.equal(autonomy.loungeAsksAboutCharacterLife('커피 마실래?'), false);
});

test('reach-out tick parse keeps a plain line and JSON autonomy updates', () => {
  assert.equal(autonomy.readLoungeAutonomyTick('PD가 또 멘트 줄이자고 하네.').line, 'PD가 또 멘트 줄이자고 하네.');
  const parsed = autonomy.readLoungeAutonomyTick(JSON.stringify({
    line: 'PD가 멘트 수위 또 깎자고 하네.',
    current_intention: '수위는 내가 정한다고 못 박는다',
    ambient: '리허설 중 제작진과 말다툼',
    conversation_intent: '틈 나면 PD 얘기 한 줄',
  }));
  assert.match(parsed.line, /PD/);
  assert.match(parsed.update.ambient, /리허설/);
});

test('companion state keeps autonomy, turn.life every turn, and gated self_share', () => {
  const state = messenger.normalizeLoungeCompanionState(null, 'room-1', 'trickster');
  assert.ok(state.autonomy?.current_intention);
  const calm = messenger.loungeTurnConditions({
    state, turn: 4, decision: { progress: 'stay' }, innerVoice: 'on', characterId: 'trickster',
    initiative: autonomy.decideLoungeInitiative({ characterId: 'trickster', autonomy: state.autonomy, turn: 4, analysis: { topic_stale: false }, latestUserText: '오늘 날씨 좋다' }),
  });
  assert.ok(calm.life?.current_intention);
  assert.equal(calm.initiative.stance, 'companion');

  const initiative = autonomy.decideLoungeInitiative({
    characterId: 'trickster', autonomy: state.autonomy, turn: 5, analysis: { topic_stale: true },
  });
  const turn = messenger.loungeTurnConditions({
    state, turn: 5, decision: { progress: 'stay' }, innerVoice: 'on', initiative, characterId: 'trickster',
  });
  assert.equal(turn.initiative.stance, 'self_share');
  assert.ok(turn.initiative.seed);
  assert.ok(turn.life);

  const next = messenger.nextLoungeCompanionState({
    state, decision: { progress: 'stay' }, turn: 5, reply: '야, PD가 또 깎자고 하네.', inner: '',
    autonomySelfShare: true, autonomy: state.autonomy,
  });
  assert.equal(next.autonomy.last_self_share_turn, 5);
});

test('unknown character ids get no life or initiative field', () => {
  const state = messenger.normalizeLoungeCompanionState(null, 'room-1', 'not-a-host');
  assert.equal(state.autonomy, undefined);
  const turn = messenger.loungeTurnConditions({
    state, turn: 3, decision: { progress: 'stay' }, innerVoice: 'on', characterId: 'not-a-host',
  });
  assert.equal(turn.life, undefined);
  assert.equal(turn.initiative, undefined);
});
