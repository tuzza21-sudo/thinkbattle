import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const ringback = loadTs(fileURLToPath(new URL('../src/lib/callRingback.ts', import.meta.url)));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the ringback is scheduled whole on the audio clock, with soft rings that never overlap (2026-11-20)', () => {
  const rings = ringback.ringbackSchedule();
  assert.ok(rings.length >= 6, 'rings cover the failsafe');
  assert.ok(rings.at(-1).start < 20, 'no ring starts after the failsafe');
  for (let index = 1; index < rings.length; index += 1) assert.ok(rings[index].start > rings[index - 1].end, 'a quiet gap between rings');
  const source = read('src/lib/callRingback.ts');
  assert.doesNotMatch(source, /setInterval/, 'no timer of the page makes a ring late while the call connects');
  assert.match(source, /onstatechange/, 'a context the browser pauses is resumed');
});

test('a character\'s page starts a conversation from small story cards under the button, and the persona is made and picked in one sheet (2026-11-20)', () => {
  const page = read('src/components/LoungeCharacterPage.tsx');
  assert.match(page, /<LoungeStoryStart scenarios=\{scenarios\} user=\{user\} extra=\{picker\} \/>/, 'the persona button is beside the start button');
  assert.doesNotMatch(page, /LoungeScenarioCards|toStories|scrollIntoView/, 'the button no longer scrolls down to a section');
  assert.doesNotMatch(page, /대화 시작하기/, 'the section below is gone');
  const start = read('src/components/LoungeStoryStart.tsx');
  assert.match(start, /\{scenario\.title\}/, 'a card shows its title');
  assert.match(start, /current\.hook/, 'the picked card shows its summary');
  assert.doesNotMatch(start, /하던 대화가 이어져요/, 'no hint line under the cards');
  assert.match(start, /onClick=\{\(\) => void start\(\)\}/, 'the button starts the picked story at once');
  assert.match(start, /onClick=\{\(\) => setPicked\(scenario\.id\)\}/, 'a card only picks');
  const picker = read('src/components/LoungePersonaPicker.tsx');
  assert.match(picker, /<LoungePersonaManager choice=/, 'the sheet makes, edits and picks');
  assert.match(picker, /createPortal/, 'the sheet is not held inside the sticky start bar');
  assert.doesNotMatch(picker, /lounge\/personas/, 'no second page to make one on');
  const manager = read('src/components/LoungePersonaManager.tsx');
  assert.match(manager, /choice\.onChoose\(saved\.is_default \? '' : saved\.id\)/, 'a persona just made is the one picked');
});

test('the chat sidebar says nothing about logging in, and 서도현\'s card no longer reads as six episodes (2026-11-20)', () => {
  const tabs = read('src/components/LoungeTabs.tsx');
  const sidebar = tabs.slice(tabs.indexOf('export function LoungeChatSidebar'), tabs.indexOf('export function LoungeSettingsPage'));
  assert.doesNotMatch(sidebar, /로그인/);
  const card = read('supabase/migrations/20270111000000_lounge_dohyun_card_copy.sql');
  const hook = card.match(/hook='([^']+)'/)[1];
  assert.doesNotMatch(hook, /부작|화\b/);
  assert.ok(hook.length <= 120, 'the hook fits loungeScenarioLimits.hook');
});

test('no story card summary counts episodes (2026-11-20)', () => {
  for (const file of ['velvet-black-rose', 'closer-contract-love', 'auditor-vip-match']) {
    const hook = read(`docs/stories/${file}.json`).match(/"hook": "([^"]+)"/)?.[1];
    assert.ok(hook && !/부작|\d화/.test(hook), `${file}: ${hook}`);
  }
  const migration = read('supabase/migrations/20270112000000_lounge_card_hooks_no_episodes.sql');
  for (const [, hook] of migration.matchAll(/hook='([^']+)'/g)) assert.ok(hook.length <= 120 && !/부작|\d화/.test(hook));
});

test('라쿤 is offered by the picker only on a computer\'s own address, not on the site\'s domain (2026-11-20)', () => {
  const models = loadTs(fileURLToPath(new URL('../src/lib/loungeModels.ts', import.meta.url)));
  for (const host of ['localhost', '127.0.0.1', '::1']) assert.deepEqual(models.loungeChatModelsFor(host).map(model => model.id), ['deepseek-flash', 'gemini-flash', 'deepseek-raccoon', 'claude-haiku'], host);
  for (const host of ['saseok.kr', 'www.saseok.kr', 'localhost.evil.com', 'xlocalhost', '192.168.0.4']) assert.deepEqual(models.loungeChatModelsFor(host).map(model => model.id), ['deepseek-flash', 'gemini-flash', 'claude-haiku'], host);
  // 2026-11-26, by the owner: 하이쿠 everywhere; an English lesson offers 루나 and 하이쿠, and a lesson room on no model is on 루나.
  assert.deepEqual(models.loungeLessonChatModels.map(model => [model.id, model.label]), [['gpt', '루나'], ['claude-haiku', '하이쿠']]);
  assert.equal(models.loungeRoomChatModelId(null, true), 'gpt'); assert.equal(models.loungeRoomChatModelId('claude-haiku', true), 'claude-haiku');
  assert.equal(models.loungeRoomChatModelId(null, false), null);
  assert.equal(models.loungeOpenrouterModelFor('claude-haiku'), 'anthropic/claude-haiku-5.5'); assert.equal(models.loungeOpenrouterAnswersAdult('claude-haiku'), false);
  assert.match(read('src/components/LoungeModelPicker.tsx'), /loungeChatModelsFor\(window\.location\.hostname\)/, 'the menu follows the address');
});

test('on a computer the photo and the column beside it end on the same line (2026-11-20)', () => {
  const css = read('src/components/LoungeCharacter.css');
  const block = css.slice(css.lastIndexOf('@media(min-width:901px)'));
  assert.match(block, /\.lounge-character-hero \{ align-items:stretch; \}/, 'the photo takes the column\'s height');
  assert.match(block, /\.lounge-character-intro>\.lounge-character-actions \{ margin-top:auto;/, 'the stories sit at the column\'s foot');
});
