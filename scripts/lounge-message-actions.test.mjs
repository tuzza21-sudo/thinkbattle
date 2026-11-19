import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const actions = loadTs(fileURLToPath(new URL('../src/lib/loungeMessageActions.ts', import.meta.url)));
const { joinLoungeInnerVoice } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const messages = kinds => kinds.map((kind, index) => ({ id: index + 1, kind }));

test('a month of message voices is 3 minutes without a plan, 30 with Plus, and has no limit for the super admin', () => {
  assert.equal(actions.loungeMessageVoiceLimitSeconds({ plan: null }), 180);
  assert.equal(actions.loungeMessageVoiceLimitSeconds({ plan: 'pro' }), 1800);
  assert.equal(actions.loungeMessageVoiceLimitSeconds({ plan: 'plus' }), 1800, 'the first buyers\' plan is Plus too');
  assert.equal(actions.loungeMessageVoiceLimitSeconds({ plan: 'pro', exempt: true }), null);
  assert.equal(actions.loungeMessageVoiceUsageText({ usedSeconds: 75, limitSeconds: 180 }), '이번 달 음성 변환 1분 15초 / 3분');
  assert.equal(actions.loungeMessageVoiceUsageText({ usedSeconds: 42, limitSeconds: 1800 }), '이번 달 음성 변환 42초 / 30분');
  assert.equal(actions.loungeMessageVoiceUsageText({ usedSeconds: 120, limitSeconds: null }), '이번 달 음성 변환 2분');
  assert.equal(actions.loungeMessageVoiceUsageText(null), '');
});

test('a voice reads what is said aloud, without the inner voice or the actions', () => {
  const reply = joinLoungeInnerVoice('*잔을 내려놓으며* 오늘 와 줘서 고마워요. 정말로요.', '보고 싶었다');
  assert.equal(actions.loungeMessageVoiceText(reply), '오늘 와 줘서 고마워요. 정말로요.');
  assert.equal(actions.loungeMessageVoiceText('*고개를 끄덕인다*'), '', 'a reply of actions alone has nothing to read');
  assert.ok(actions.loungeMessageVoiceText('가'.repeat(5000)).length <= 1000);
  assert.equal(actions.loungeMp3Seconds(16_000), 1, '128 kbps: 16,000 bytes a second');
  assert.ok(actions.loungeMessageVoiceEstimate('가나다라마바사아자차') > 1);
});

test('only the last ten messages can be gone back to, and only a reply that ends the chat can be written again', () => {
  const list = messages(['human', 'host', 'human', 'host', 'host', 'human', 'host', 'human', 'host', 'host', 'human', 'host', 'host']);
  assert.deepEqual([...actions.loungeRewindableIds(list)], [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual([...actions.loungeLastReplyIds(list)].sort((a, b) => a - b), [12, 13], 'every part of the last reply');
  assert.equal(actions.loungeLastReplyId(list), 13);
  const waiting = messages(['host', 'human']);
  assert.equal(actions.loungeLastReplyId(waiting), undefined, 'the member spoke last: nothing to write again');
  assert.equal(actions.loungeLastReplyIds(waiting).size, 0);
  assert.deepEqual([...actions.loungeRewindableIds([{ id: 1, kind: 'system' }, ...messages(['human'])])], [1], 'only what the two said counts');
});

test('the server takes the actions only for the member\'s own chat, and the voice is counted once by the database', () => {
  const api = read('api/lounge.ts');
  assert.match(api, /'rewind', 'message-voice'\]\.includes/);
  assert.match(api, /rpc\/rewind_voice_lounge_chat/);
  assert.match(api, /mine\.host_id === user\.id && mine\.capacity === 1 && !mine\.space_id/);
  assert.match(api, /'record_lounge_message_voice'/);
  assert.match(api, /output_format=mp3_44100_128/);
  const sql = read('supabase/migrations/20270107000000_lounge_message_actions.sql');
  for (const name of ['rewind_voice_lounge_chat', 'record_lounge_message_voice', 'lounge_message_voice_status']) {
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role`), `${name} is for the server only`);
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated`));
  }
  assert.match(sql, /INSERT INTO public\.voice_lounge_turn_snapshots/, 'every commit keeps what it changes first');
});
