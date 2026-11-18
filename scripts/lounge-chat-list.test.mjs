import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeChatsInProgress } = loadTs(fileURLToPath(new URL('../src/lib/loungeChatList.ts', import.meta.url)));
const preference = loadTs(fileURLToPath(new URL('../src/lib/loungePersonaPreference.ts', import.meta.url)));
const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const chat = (room_id, last_kind) => ({ room_id, last_kind });

test('the chat list keeps every room the member has spoken in, even once, and leaves out the rest (2026-11-18)', async () => {
  const chats = [chat('spoke-long-ago', 'host'), chat('never-spoken', 'host'), chat('member-last', 'human'), chat('unreadable', 'host')];
  const asked = [];
  const kept = await loungeChatsInProgress(chats, async id => { asked.push(id); if (id === 'unreadable') throw new Error('down'); return id === 'spoke-long-ago'; });
  assert.deepEqual(kept.map(item => item.room_id), ['spoke-long-ago', 'member-last', 'unreadable'], 'a room that cannot be asked is kept');
  assert.ok(!asked.includes('member-last'), 'a room whose last message is the member\'s is not asked');
  assert.deepEqual(await loungeChatsInProgress([], async () => { throw new Error('not asked'); }), []);
  assert.equal((await loungeChatsInProgress([chat('a', 'host')], async () => false)).length, 0);
});

test('the open chat sidebar goes with the page, and the folded rail stays fixed on the screen (2026-11-18)', () => {
  const css = read('../src/components/LoungeTabs.css');
  const open = css.split('\n').find(line => /\.has-chat-sidebar > \.lounge-chat-sidebar \{/.test(line));
  const folded = css.split('\n').find(line => /\.has-chat-sidebar > \.lounge-chat-sidebar\.is-collapsed \{/.test(line));
  assert.doesNotMatch(open, /position:\s*(sticky|fixed)/, 'open: scrolls with the page');
  assert.match(folded, /position:fixed; left:14px; top:96px;/, 'folded: fixed on the screen');
});

test('the persona of a conversation: picked on the character\'s page and in the conversation\'s settings (2026-11-18)', () => {
  const ids = ['p1', 'p2'];
  assert.deepEqual(preference.loungePersonaToApply('p2', ids), { id: 'p2' });
  assert.deepEqual(preference.loungePersonaToApply('none', ids), { none: true });
  assert.equal(preference.loungePersonaToApply('', ids), undefined, 'the default is left to the default');
  assert.equal(preference.loungePersonaToApply('gone', ids), undefined, 'a deleted persona is not applied');
  const page = read('../src/components/LoungeCharacterPage.tsx');
  assert.match(page, /<LoungePersonaPicker characterId=\{character\.id\} characterName=\{character\.name\} \/>/, 'the character page has the picker');
  const room = read('../src/components/LoungePage.tsx');
  assert.match(room, /title="대화 속 나 \(페르소나\)"/, 'the conversation\'s settings have the choice');
  assert.match(room, /loungePersonaToApply\(loadLoungePersonaPreference\(room\.host_persona\)/, 'a new conversation takes the pick once');
});
