import assert from 'node:assert/strict';
import test from 'node:test';
import { agencyCases, captureAgencyCase } from './lounge-agency-probe.mjs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

test('early visit corrections select the correction example rather than a later-stage or unrelated date', () => {
  const { getLoungeCharacter, loungeCompanionVoiceExamples } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
  const scene = agencyCases.find(scene => scene.id === 'closer-correct-visit');
  const examples = loungeCompanionVoiceExamples(getLoungeCharacter('closer'), { innerVoice: 'on', stage: 1, turn: 8, userText: scene.user });
  assert.match(examples[0].scene, /누가 방문하는지 바로잡는다/);
  assert.match(examples[0].text, /당신 집으로 갈게요/);
  assert.doesNotMatch(examples[0].text, /[?？]/);
});

test('agency review catches actual delegation and refusal loops while allowing useful questions and banter', () => {
  const { loungeCompanionReplyReview: review } = loadTs(fileURLToPath(new URL('../src/lib/loungeMessenger.ts', import.meta.url)));
  const input = { characterId: 'closer', userText: '알아서 잘 해요.', text: '내일 실수하면 옆에서 웃고 있을 생각부터 하신 거죠?' };
  assert.deepEqual(review(input).notes, ['delegated_choice']);
  assert.deepEqual(review({ characterId: 'diplomat', userText: '네가 보고 싶은 걸로 골라. 난 다 좋아.', text: '이거 어떻게? 내가 골라 둔 건데.' }).notes, ['delegated_choice']);
  assert.equal(review({ ...input, text: '그럼 내 방식대로 하죠. 내일 인사는 내가 할게요.' }), undefined);
  assert.equal(review({ characterId: 'closer', userText: '우리 집으로 오는 거예요.', text: '알겠어요. 부모님은 어떤 과일을 좋아하세요?' }), undefined, 'a relevant unanswered practical question is allowed');
  const no = { characterId: 'diplomat', userText: '그럼 아예 오지 마. 됐어.', text: '방금 그거 다시 말해 봐. 그 사이에 뭐가 있었길래 이래?', inner: '그럼 나는 뭐가 되는 건데.' };
  assert.deepEqual(review(no).notes, ['refusal_interrogation']);
  assert.equal(review({ ...no, text: '알겠어. 오늘은 여기까지 하자. 나도 내일 기사 마무리해야 돼.', inner: '' }), undefined);
  assert.equal(review({ ...input, characterId: 'teacher' }), undefined);
});

test('structured ledger integration guards pending plans while preserving major history and member facts', () => {
  const m = loadTs(fileURLToPath(new URL('../src/lib/loungeMessenger.ts', import.meta.url)));
  const turns = loadTs(fileURLToPath(new URL('../src/lib/loungeTurnPersistence.ts', import.meta.url)));
  const history = { id: 'e1', text: '사용자가 10억 원을 벌었다.', turn: 1, major: true };
  const member = { id: 'u1', text: '사용자가 사업으로 10억 원을 벌었다.', turn: 1 };
  const previous = { scene: '지금 장면: 사무실', events: [history], member: [member], between: [{ id: 'b1', text: '6개월 계약에 서명했다.', turn: 1 }], pending: [{ id: 'p1', text: '무진이 사용자를 데리러 간다.', turn: 6 }] };
  const human = '내일 우리 집에서 저녁 먹어요.', reply = '좋아요. 내일 저녁 당신 집으로 갈게요.';
  const answer = { memory: '지금 장면: 사무실', record_ops: [{ op: 'add', section: 'pending', ref: '', text: '첫 데이트 메뉴 정하기', major: false, quote: '' }], pending_plans: [{ ref: '', summary: '내일 저녁 무진이 사용자 집으로 방문한다.', human_quote: human, character_quote: reply }] };
  const { commit } = turns.reduceLoungeTurn('room', undefined, { state: { room_id: 'room', memory_ledger: previous }, stateVersion: 0, relationship: null, mood: {} }, { room_id: 'room', turn: 9, user_text: human, reply, status: 'ready', created_at: '2026-11-27T00:00:00Z', payload: { answer, ledger: {} } });
  assert.deepEqual(commit.state.memory_ledger.events, [history]);
  assert.deepEqual(commit.state.memory_ledger.member, [member]);
  assert.deepEqual(commit.state.memory_ledger.between, previous.between);
  assert.deepEqual(commit.state.memory_ledger.pending.map(item => item.text), [answer.pending_plans[0].summary]);
  assert.match(commit.memory, /10억 원/);
  assert.doesNotMatch(commit.memory, /데리러|메뉴 정하기/);
  const unchanged = m.applyLoungeMemoryLedger(previous, { memory: '지금 장면: 사무실', record_ops: [], history_merge: {} }, 10);
  assert.deepEqual(unchanged.pending, previous.pending, 'legacy jobs without pending_plans keep their pending records');
});

test('empty DeepSeek voice output falls back before speaking and records the applied GPT model', async () => {
  for (const character of ['closer', 'diplomat']) {
    const scene = agencyCases.find(scene => scene.character === character && scene.medium === 'voice');
    const { request, modelLogs } = await captureAgencyCase({ ...scene, model: 'deepseek-flash', emptyDeepseek: true });
    assert.equal(request.model, 'gpt-6-luna');
    assert.ok(modelLogs.some(log => log.applied_provider === 'openai' && log.attempts.some(attempt => attempt.provider === 'deepseek' && !attempt.ok)));
  }
});

test('Jian sends the new political ambition and polite reunion into chat and voice while an existing friendship stays casual', async () => {
  const scene = agencyCases.find(item => item.character === 'diplomat');
  for (const medium of ['chat', 'voice']) {
    const { request } = await captureAgencyCase({ ...scene, medium });
    const input = JSON.parse(request.input);
    assert.equal(input.scenario.id, 'diplomat-byline');
    assert.equal(input.relationship.speech_level, 'polite');
    assert.match(input.relationship.character_core.join(' '), /정계 진출/);
    assert.match(input.relationship.character_core.join(' '), /경제력·실행력/);
    assert.match(request.instructions, /명예/);
    assert.doesNotMatch(request.instructions, /3년|우정을 잃|서운해 물러서면/);
    assert.doesNotMatch(input.relationship.stage.hint, /3년|편안한 친구/);
  }
  const scenario = { id: 'diplomat-old-friend-fling', title: '기존 방의 이야기', place: '차 안', prologue: '기존에 함께 나눈 이야기', user_role: '오랜 친구', relationship: '3년 친구. 이미 서로 사귀기로 합의했다.' };
  const { request } = await captureAgencyCase({ ...scene, scenario, memory: '둘 사이: 서로 사귀기로 합의했다' });
  const input = JSON.parse(request.input);
  assert.equal(input.scenario.id, scenario.id);
  assert.equal(input.scenario.relationship, scenario.relationship);
  assert.equal(input.relationship.speech_level, 'casual');
  assert.match(input.memory, /서로 사귀기로 합의/);
});

test('a corrected plan cannot cite the old character invitation to restore a canceled pickup', () => {
  const { loungeSummaryWithGroundedPlans } = loadTs(fileURLToPath(new URL('../src/lib/loungeRoomLedger.ts', import.meta.url)));
  const old = '내일 저녁 집 앞으로 데리러 갈게요.';
  const memory = loungeSummaryWithGroundedPlans({ memory: '지금 장면: 사무실', previous: { scene: '', member: [], between: [], events: [], pending: [{ id: 'ps0', text: '내일 저녁 무진이 사용자를 데리러 간다', turn: 1 }] }, plans: [{ ref: 'ps0', summary: '11월 28일 저녁 무진이 사용자 집 앞으로 데리러 간다', human_quote: '무진씨가 우리 집에 오는 거죠.', character_quote: old }], human: '아니 뭘 모셔요. 무진씨가 우리 집에 오는 거죠.', reply: '맞아요. 내가 당신 집으로 가는 거죠. 데리러 간다는 말은 취소할게요.', recent: [{ kind: 'host', text: old }] });
  assert.match(memory, /남은 것: 없음$/);
  assert.doesNotMatch(memory, /데리러/);
});

test('both characters carry their own boundary and a corrected visit into chat and voice reply/recorder requests', async () => {
  for (const character of ['closer', 'diplomat']) {
    for (const medium of ['chat', 'voice']) {
      const state = { room_memory: [
        { id: 'boundary', kind: 'boundary', summary: '오늘은 하룻밤을 함께 보내지 않겠다고 했다', status: 'active', human_quote: '', character_quote: '오늘은 여기서만 이야기하죠.', turn: 6 },
        { id: 'correction', kind: 'correction', summary: '캐릭터가 사용자의 집으로 방문한다', status: 'active', human_quote: '네가 우리 집에 오는 거야.', character_quote: '그쪽 집으로 갈게요.', turn: 7 },
      ], memory_ledger: { scene: '지금 장면: 카페', between: [{ id: 'b', text: '서로 합의한 관계는 유지한다', turn: 1 }], events: [], member: [], pending: [{ id: 'p', text: '캐릭터가 사용자의 집에 방문한다', turn: 7 }] } };
      const { request, after } = await captureAgencyCase({ ...agencyCases.find(scene => scene.character === character), medium, state });
      const input = JSON.parse(request.input), recorder = JSON.parse(after.input);
      assert.deepEqual(input.room_memory.map(item => item.kind), ['boundary', 'correction']);
      assert.equal(input.relationship.stage.id, character === 'closer' ? 'PROSPECT' : 'FIRST_IMPRESSION');
      assert.match(request.instructions, /재촉/);
      assert.match(after.instructions, /당사자가 실제로 바꾼 경우만 갱신/);
      assert.match(after.instructions, /잘못된 주체·장소·일정을 교체/);
      assert.doesNotMatch(after.instructions, /스스로 정한 속도·허용 범위·멈춤은 사실이나 '남은 것'으로 적지 않는다/);
      assert.deepEqual(recorder.memory_ledger, state.memory_ledger);
      assert.ok(recorder.record, 'the canonical companion path uses main’s structured ledger');
      assert.ok(after.text.format.schema.properties.record_ops);
      if (medium === 'voice') assert.equal(input.reply_medium, 'voice');
    }
  }
});
