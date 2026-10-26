import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeCharacters, loungePersonaPrompt } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const { relationshipConfigs, defaultEventEffects, protectiveEvents, relationshipEventTypes } = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { loungeHosts, loungeThemes, loungeHostGroups, loungeCharacterProfiles, loungeHostThemes, loungeEngineVoice } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const effect = (config, event) => (config.events[event] ?? defaultEventEffects[event]).deltas;
const values = deltas => Object.values(deltas);

test('every host has a character page with a real theme and an existing photo', () => {
  assert.deepEqual(loungeCharacters.map(c => c.id).sort(), loungeHosts.map(h => h.id).sort());
  for (const character of loungeCharacters) {
    assert.ok(loungeThemes.some(theme => theme.id === character.place), `${character.id}: unknown place ${character.place}`);
    if (character.fullBody) assert.ok(existsSync(fileURLToPath(new URL(`../public${character.fullBody}`, import.meta.url))), `${character.id}: missing ${character.fullBody}`);
    for (const relation of character.relations) assert.ok(loungeHosts.some(h => h.id === relation.with) && relation.with !== character.id);
  }
});

test('the conversations a page recommends raise that character\'s scores, and the ones it warns about lower them', () => {
  for (const character of loungeCharacters) {
    const config = relationshipConfigs[character.id];
    assert.ok(config, `${character.id}: no relationship configuration`);
    for (const move of character.wins) {
      assert.ok(relationshipEventTypes.includes(move.event), `${character.id}: unknown event ${move.event}`);
      const deltas = values(effect(config, move.event));
      assert.ok(deltas.some(v => v > 0) && deltas.reduce((a, b) => a + b, 0) > 0, `${character.id}: ${move.event} is listed as winning but does not raise scores`);
    }
    for (const move of character.losses) {
      assert.ok(values(effect(config, move.event)).some(v => v < 0), `${character.id}: ${move.event} is listed as losing but lowers nothing`);
    }
    assert.equal(new Set([...character.wins, ...character.losses].map(m => m.event)).size, character.wins.length + character.losses.length, `${character.id}: an event is listed twice`);
  }
});

test('every strong driver of a character (a change of 4 or more) is explained on its page', () => {
  for (const character of loungeCharacters) {
    const config = relationshipConfigs[character.id], listed = new Set([...character.wins, ...character.losses].map(m => m.event));
    for (const event of relationshipEventTypes) {
      if (protectiveEvents.includes(event)) continue; // Hardship is never presented as a way to win someone over.
      const deltas = values(effect(config, event));
      if (deltas.some(v => v >= 4)) assert.ok(listed.has(event), `${character.id}: ${event} raises a score by 4 or more but the page does not explain it`);
    }
  }
});

test('“gentle” only promises what the configuration forgives, for whichever character has it', () => {
  for (const character of loungeCharacters.filter(c => c.gentle)) {
    const config = relationshipConfigs[character.id];
    for (const event of ['SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'AVOIDS_DECISION', 'REPEATS_SELF']) {
      assert.ok(values(effect(config, event)).every(v => v >= 0), `${character.id}: ${event} is said to be forgiven but lowers a score`);
    }
  }
});

test('a page shows a final note only where the closest stage is switched off', () => {
  for (const character of loungeCharacters) {
    const hidden = relationshipConfigs[character.id].stages.some(stage => stage.enabled === false);
    assert.equal(Boolean(character.beyond), hidden, `${character.id}: beyond note and disabled stage disagree`);
  }
});

test('every character has a full profile for the model: name, age, work, past, temperament and habits', () => {
  for (const character of loungeCharacters) {
    const persona = loungePersonaPrompt(character);
    for (const part of [character.name, character.age, character.role, character.story[0], character.habits[0], character.personality[0].text]) assert.ok(persona.includes(part), `${character.id}: ${part.slice(0, 20)}`);
    assert.ok(persona.startsWith(`너는 ${character.name}이다.`));
  }
});

test('her flirtation and dominance are written down with their limits, and nobody else is given them', () => {
  const { loungeHosts } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
  const velvet = loungeHosts.find(host => host.id === 'velvet');
  for (const rule of ['먼저 유혹하거나 장난스럽게 주도권을 시험한다', '성인 사이의 상호적인 플러팅', '한 단계씩만 올리고', '노골적인 성행위나 신체 묘사', '미성년으로 보이는 정황', '상대가 원하지 않으면 즉시 물러난다', '실제 인간관계를 통제하거나 집착과 의존을 유도하지 않는다', '현실에서 만나자는 약속']) assert.ok(velvet.companion.includes(rule), rule);
  assert.ok(!velvet.companion.includes('유혹·연애·성적 뉘앙스, 질투, 집착, 의존 유도는 하지 않는다'));
  // In a room with other people she keeps to a light provocation.
  assert.ok(velvet.instruction.includes('다른 참가자에게 불편을 주지 않는 범위') && velvet.instruction.includes('노골적인 성적 화제'));
  const page = loungeCharacters.find(character => character.id === 'velvet');
  assert.ok(page.personality.some(item => item.label === '유혹') && page.personality.some(item => item.label === '주도권'));
  assert.ok(page.boundaries.some(item => item.includes('그만하자고 하면 바로 멈춘다')));
  for (const host of loungeHosts.filter(item => item.id !== 'velvet')) assert.ok(!host.companion.includes('성인 사이의 상호적인 플러팅'), host.id);
});

// Adding a character touches several places (docs/add-a-lounge-character.md). These two tests name what is missing.
test('every host is fully set up: lobby group and card, background, voice and its files', () => {
  for (const host of loungeHosts) {
    const missing = what => `${host.id}: missing ${what} (see docs/add-a-lounge-character.md)`;
    assert.equal(loungeHostGroups.filter(group => group.hostIds.includes(host.id)).length, 1, missing('a place in exactly one lobby group (loungeHostGroups)'));
    const card = loungeCharacterProfiles[host.id];
    assert.ok(card?.traits.length && card.summary, missing('a lobby card (loungeCharacterProfiles)'));
    const backgrounds = loungeHostThemes[host.id];
    assert.ok(backgrounds?.length && backgrounds.every(id => loungeThemes.some(theme => theme.id === id)), missing('a background (loungeHostThemes)'));
    assert.equal(typeof loungeEngineVoice('eleven', host.id, undefined), 'string', missing('an ElevenLabs voice (loungeEngineVoices.eleven or the gender in houseVoiceGender)'));
    for (const file of [host.portrait, host.voiceSample]) assert.ok(existsSync(fileURLToPath(new URL(`../public${file.split('?')[0]}`, import.meta.url))), missing(`the file ${file} (scripts/generate-lounge-character-portraits.mjs, generate-lounge-voice-sample.mjs)`));
  }
});

test('no character is shipped with the placeholders scripts/new-lounge-character.mjs leaves', () => {
  for (const file of ['src/lib/lounge.ts', 'src/lib/loungeCharacters.ts', 'src/lib/relationship/index.ts', 'scripts/lounge-character-prompts.json']) {
    const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
    if (!existsSync(path)) continue;
    assert.doesNotMatch(readFileSync(path, 'utf8'), /TODO\(새 캐릭터\)/, `${file}: a new character still has TODO(새 캐릭터) to write`);
  }
});
