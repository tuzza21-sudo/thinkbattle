import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeChatsInProgress } = loadTs(fileURLToPath(new URL('../src/lib/loungeChatList.ts', import.meta.url)));
const chat = (room_id, last_kind) => ({ room_id, last_kind });

test('the chat list keeps only conversations that are going on (2026-11-18)', async () => {
  const chats = [chat('answered-twice', 'host'), chat('never-spoken', 'host'), chat('member-last', 'human'), chat('one-answer-spoken', 'host'), chat('one-answer-opening', 'host'), chat('unknown', 'host')];
  const turns = [{ id: 'answered-twice', ai_turns: 2 }, { id: 'never-spoken', ai_turns: 0 }, { id: 'member-last', ai_turns: 0 }, { id: 'one-answer-spoken', ai_turns: 1 }, { id: 'one-answer-opening', ai_turns: 1 }];
  const asked = [];
  const kept = await loungeChatsInProgress(chats, async () => turns, async id => { asked.push(id); return id === 'one-answer-spoken' ? 3 : 0; });
  assert.deepEqual(kept.map(item => item.room_id), ['answered-twice', 'member-last', 'one-answer-spoken', 'unknown'], 'an unspoken room is out; a room whose answers cannot be read is kept');
  assert.deepEqual(asked.sort(), ['one-answer-opening', 'one-answer-spoken'], 'only a room with one answer is asked whether the member spoke');
  // A failure never empties the list.
  assert.equal((await loungeChatsInProgress(chats, async () => null, async () => 0)).length, chats.length);
  assert.equal((await loungeChatsInProgress(chats, async () => { throw new Error('down'); }, async () => 0)).length, chats.length);
  assert.deepEqual(await loungeChatsInProgress([], async () => { throw new Error('not asked'); }, async () => 0), []);
  // The count of the member's messages failing keeps the room.
  assert.equal((await loungeChatsInProgress([chat('x', 'host')], async () => [{ id: 'x', ai_turns: 1 }], async () => { throw new Error('down'); })).length, 1);
});

test('the chat sidebar is not held on the screen: it scrolls with the page, open or folded (2026-11-18)', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/components/LoungeTabs.css', import.meta.url)), 'utf8');
  const rules = css.split('\n').filter(line => line.includes('.lounge-page.has-chat-sidebar > .lounge-chat-sidebar'));
  assert.ok(rules.length >= 2);
  for (const rule of rules) assert.doesNotMatch(rule, /position:\s*(sticky|fixed)/, rule.slice(0, 80));
});
