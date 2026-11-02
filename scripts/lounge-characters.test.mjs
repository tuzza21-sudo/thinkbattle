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
  // Rewritten from her new bible (2026-11-02): frank about wanting, polite commands, and the same limits.
  for (const rule of ['욕망 앞에서 솔직하다', '조건문', '한 문장으로 선을 긋는다', '암시와 분위기까지만', '노골적인 성행위나 신체 묘사', '미성년으로 보이는 정황', '그만하자고 하면 그 자리에서 멈추고', '실제 삶과 인간관계와 일상의 결정을 통제하지 않는다', '현실에서 만나자는 약속']) assert.ok(velvet.companion.includes(rule), rule);
  assert.ok(!velvet.companion.includes('유혹·연애·성적 뉘앙스, 질투, 집착, 의존 유도는 하지 않는다'));
  // In a room with other people she keeps to a light provocation.
  assert.ok(velvet.instruction.includes('다른 참가자에게 불편을 주지 않는 범위') && velvet.instruction.includes('노골적인 성적 화제'));
  const page = loungeCharacters.find(character => character.id === 'velvet');
  assert.ok(page.personality.some(item => item.label === '지배') && page.personality.some(item => item.label === '욕망에 솔직한 팜므파탈'));
  assert.ok(page.boundaries.some(item => item.includes('그 자리에서 멈춘다')) && page.boundaries.some(item => item.includes('암전')));
  for (const host of loungeHosts.filter(item => item.id !== 'velvet')) assert.ok(!host.companion.includes('욕망 앞에서 솔직하다'), host.id);
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

test('a character with a companion sheet has all of it: the lens, ten actions or more, the inner voice at every stage, and events the engine can use', () => {
  const { loungeCompanionSheetPrompt, loungeFewShotTurn } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
  const sheetFields = ['interpretationLens', 'actionAnchors', 'innerVoice', 'ruleBreak', 'relationshipLadder', 'fewShot', 'sceneEvents'];
  const withSheet = loungeCharacters.filter(character => sheetFields.some(field => character.bible?.[field]));
  // 서도현 is the first (2026-11-02); the others follow one by one.
  assert.ok(['auditor', 'closer'].every(id => withSheet.some(character => character.id === id)));
  for (const { id, bible } of withSheet) {
    assert.ok(bible.interpretationLens, `${id}: a lens`);
    assert.ok(bible.actionAnchors?.length >= 10, `${id}: ten actions or more`);
    assert.ok(bible.innerVoice?.style, `${id}: how the inner voice speaks`);
    for (const stage of [1, 2, 3, 4]) {
      assert.ok(bible.innerVoice.ladder[stage]?.level, `${id}: the inner voice at stage ${stage}`);
      if (bible.ruleBreak) assert.ok(bible.ruleBreak.byStage[stage], `${id}: the rule broken at stage ${stage}`);
      if (bible.relationshipLadder) assert.ok(bible.relationshipLadder[stage], `${id}: the reaction at stage ${stage}`);
    }
    // An example has both forms (서도현) or one reply for both (강무진); hidden, it never carries an inner voice.
    for (const shot of bible.fewShot ?? []) {
      const shownTurn = loungeFewShotTurn(shot, 'on'), hiddenTurn = loungeFewShotTurn(shot, 'off');
      assert.ok(shownTurn.text && hiddenTurn.text && hiddenTurn.inner_voice === '' && !/\*/.test(shownTurn.text + hiddenTurn.text), `${id}: an example with a reply and no stars`);
    }
    const ids = new Set();
    for (const event of bible.sceneEvents ?? []) {
      assert.ok(event.id && !ids.has(event.id) && event.minStage >= 1 && event.minStage <= 4 && event.content, `${id}: event ${event.id}`);
      ids.add(event.id);
      if (event.repeatable) assert.ok(event.cooldown >= 6, `${id}: a repeatable event ${event.id} cools down`);
    }
    // Shown, the examples carry their inner voices; hidden, the ones written for it and where the thought shows instead.
    const shown = loungeCompanionSheetPrompt(loungeCharacters.find(character => character.id === id), 'on');
    const hidden = loungeCompanionSheetPrompt(loungeCharacters.find(character => character.id === id), 'off');
    assert.match(shown, /속마음의 말투: /);
    assert.doesNotMatch(shown, /새어 나온다/);
    if (bible.innerVoice.offModeLeaks?.length) assert.match(hidden, /속마음은 대사와 행동에 이렇게 새어 나온다/);
    if (bible.fewShot?.length) {
      assert.ok(shown.includes(JSON.stringify(loungeFewShotTurn(bible.fewShot[0], 'on').text)));
      assert.ok(hidden.includes(JSON.stringify(loungeFewShotTurn(bible.fewShot[0], 'off').text)));
    }
  }
});
