import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeIsSolo, loungePresentMembers, loungePresenceMs, loungeHosts, loungeThemes, loungeHostThemes, loungeRoomTheme, loungeRecording } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const { loungeCharacters } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));

test('a conversation uses one of its character\'s backgrounds, the same one for everyone in the room', () => {
  for (const theme of loungeThemes) assert.ok(theme.image && /^#[0-9a-f]{6}$/i.test(theme.accent) && /^#[0-9a-f]{6}$/i.test(theme.surface), `${theme.id} has an image and colours`);
  for (const host of loungeHosts) {
    const choices = loungeHostThemes[host.id];
    assert.ok(choices?.length, `${host.id} has backgrounds`);
    for (const id of choices) assert.ok(loungeThemes.some(theme => theme.id === id), `${host.id}: unknown background ${id}`);
    assert.equal(loungeRoomTheme(host.id, 'lounge-abc'), loungeRoomTheme(host.id, 'lounge-abc'), 'the same room always gets the same background');
    assert.ok(choices.includes(loungeRoomTheme(host.id, 'lounge-abc')));
  }
  assert.equal(loungeRoomTheme('lawyer', 'lounge-1'), 'lawlibrary');
  assert.equal(loungeRoomTheme('unknown', 'lounge-1'), loungeThemes[0].id, 'an unknown character falls back to the first background');
  // With several backgrounds, different rooms spread across them.
  const original = loungeHostThemes.jaeseok;
  loungeHostThemes.jaeseok = ['hotel', 'river', 'forest'];
  try { assert.ok(new Set(Array.from({ length: 30 }, (_, index) => loungeRoomTheme('jaeseok', `lounge-${index}`))).size > 1); }
  finally { loungeHostThemes.jaeseok = original; }
});

test('a recorded clip always fits the 1.5 MB upload limit once encoded as base64', () => {
  const largestUpload = Math.ceil(loungeRecording.maxBytes * 1.5 / 3) * 4;
  assert.ok(largestUpload < 1_500_000 * 0.8, `largest upload ${largestUpload} bytes`);
  assert.ok(loungeRecording.maxMs <= 30_000 && loungeRecording.bitsPerSecond <= 64_000);
});

test('every home card has a name and a short job title', () => {
  assert.deepEqual(loungeCharacters.map(character => character.id), ['jaeseok', 'ina', 'auditor', 'closer', 'velvet', 'trickster', 'diplomat', 'lawyer'], 'four on top, four below, in this order');
  for (const character of loungeCharacters) assert.ok(character.job && character.job.length <= 12, `${character.id}: job "${character.job}"`);
});
const { readLoungeTopicSuggestions, loungeTopicSuggestionInstructions, loungeTopicLimit } = loadTs(fileURLToPath(new URL('../src/lib/loungeTopics.ts', import.meta.url)));
const now = Date.parse('2026-10-09T12:00:00Z');
const seen = secondsAgo => ({ last_seen: new Date(now - secondsAgo * 1000).toISOString() });

test('a space table is one-to-one while one person is present, a group once another arrives', () => {
  const space = { capacity: 6, space_id: 'hotel-bar' };
  assert.equal(loungeIsSolo(space, [seen(5)], now), true);
  assert.equal(loungeIsSolo(space, [seen(5), seen(20)], now), false);
  assert.equal(loungeIsSolo(space, [seen(5), seen(loungePresenceMs / 1000 + 1)], now), true, 'someone gone for over 3 minutes no longer counts');
  assert.equal(loungeIsSolo(space, [seen(5), seen(120)], now), false, 'a phone briefly in the background still counts');
  assert.equal(loungePresentMembers([seen(1), seen(500)], now).length, 1);
});

test('created rooms keep their capacity rule', () => {
  assert.equal(loungeIsSolo({ capacity: 1, space_id: null }, [seen(5), seen(5)], now), true);
  assert.equal(loungeIsSolo({ capacity: 4 }, [seen(5)], now), false);
});

test('topic suggestions: three distinct trimmed topics within the limit', () => {
  assert.deepEqual(readLoungeTopicSuggestions({ topics: [' 요즘 믿게 된 뉴스 ', '요즘 믿게 된 뉴스', '', 'x'.repeat(loungeTopicLimit + 1), '틀렸다고 인정한 순간', '근거 없는 확신', '네 번째'] }),
    ['요즘 믿게 된 뉴스', '틀렸다고 인정한 순간', '근거 없는 확신']);
  assert.throws(() => readLoungeTopicSuggestions({ topics: [] }));
  assert.throws(() => readLoungeTopicSuggestions(null));
  assert.match(loungeTopicSuggestionInstructions('벨벳 나이프', '호텔 바 끝자리'), /벨벳 나이프.*호텔 바 끝자리/s);
  assert.doesNotMatch(loungeTopicSuggestionInstructions('벨벳 나이프', null), /null/);
});
