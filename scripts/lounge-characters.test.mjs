import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeCharacters, loungePersonaPrompt, loungeBiblePrompt, loungeCompanionSheetPrompt } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const { loungeTurnConditions, normalizeLoungeCompanionState } = loadTs(fileURLToPath(new URL('../src/lib/loungeMessenger.ts', import.meta.url)));
const { relationshipConfigs, defaultEventEffects, protectiveEvents, relationshipEventTypes } = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { loungeHosts, loungeThemes, loungeHostGroups, loungeCharacterProfiles, loungeHostThemes, loungeEngineVoice } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const effect = (config, event) => (config.events[event] ?? defaultEventEffects[event]).deltas;
const values = deltas => Object.values(deltas);

test('every host has a character page with a real theme and an existing photo', () => {
  assert.deepEqual(loungeCharacters.map(c => c.id).sort(), loungeHosts.map(h => h.id).sort());
  for (const character of loungeCharacters) {
    assert.ok(loungeThemes.some(theme => theme.id === character.place), `${character.id}: unknown place ${character.place}`);
    if (character.fullBody) assert.ok(existsSync(fileURLToPath(new URL(`../public${character.fullBody}`, import.meta.url))), `${character.id}: missing ${character.fullBody}`);
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

test('character-specific prompt choices preserve autonomy without compulsory comedy', () => {
  const { loungeBiblePrompt, loungeCompanionSheetPrompt } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
  for (const id of ['closer', 'diplomat']) {
    const character = loungeCharacters.find(item => item.id === id);
    const config = relationshipConfigs[id];
    const prompt = [loungePersonaPrompt(character, { withBible: true }), loungeBiblePrompt(character), loungeCompanionSheetPrompt(character, 'on')].join('\n');
    // The user's bible of 2026-11-05 brought back banter and examples for every stage (more volley examples since the
    // same day); it stays among the shortest sheets.
    if (id === 'diplomat') assert.ok(prompt.length < 7000, id + ': keep the character prompt concise');
    if (character.bible.voice.rhythm) assert.ok(loungeCompanionSheetPrompt(character, 'on').includes(character.bible.voice.rhythm), id + ': rhythm is actually used');
    const allStages = JSON.stringify(config);
    assert.doesNotMatch(prompt + allStages, /이 사람 앞에서는 매번 진다|지면 바로 승리|일부러 질 판|질문이 다섯 개|질문이 쏟아지다/);
    assert.ok(config.core.some(line => /판단/.test(line)), id + ': independent judgment at every stage');
    assert.equal(character.bible.pressureLadder, undefined, id + ': no redundant mandatory pressure ladder');
    assert.equal(character.bible.exceptionFormula, undefined, id + ': no scripted exception performance');
  }
  const closer = loungeCharacters.find(item => item.id === 'closer');
  assert.match(closer.bible.invariants.join(' '), /6개월.*계약 기간과 비밀 유지/);
  assert.equal(closer.bible.fewShot.length, 6, 'use the six examples from the supplied patch');
  assert.match(closer.bible.voice.tone, /서로 합의해 반말로 전환하면 이후 일관되게 유지/);
  assert.match(closer.bible.invariants.join(' '), /외부 인물에게 계약의 실체나 문서를 공개하지 않는다/);
  const reporter = loungeCharacters.find(item => item.id === 'diplomat');
  assert.doesNotMatch(reporter.bible.sceneEvents.map(event => event.content + event.purpose).join(' '), /그의 휴대폰|둘 다 펄쩍|아직도 안 사귀어/);
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

test('a companion sheet has a lens, distinct actions, stage limits and usable events without padding quotas', () => {
  const { loungeCompanionSheetPrompt, loungeFewShotTurn } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
  const sheetFields = ['interpretationLens', 'actionAnchors', 'innerVoice', 'ruleBreak', 'relationshipLadder', 'fewShot', 'sceneEvents'];
  const withSheet = loungeCharacters.filter(character => sheetFields.some(field => character.bible?.[field]));
  // 서도현 is the first (2026-11-02); the others follow one by one.
  assert.ok(['auditor', 'closer'].every(id => withSheet.some(character => character.id === id)));
  for (const { id, bible } of withSheet) {
    assert.ok(bible.interpretationLens, `${id}: a lens`);
    assert.ok(bible.actionAnchors?.length > 0, `${id}: action material`);
    assert.equal(new Set(bible.actionAnchors).size, bible.actionAnchors.length, `${id}: no duplicate actions`);
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
    // The heading of the hidden-voice leaks (an example line may say "웃음이 새어 나온다").
    assert.doesNotMatch(shown, /속마음은 대사와 행동에 이렇게 새어 나온다/);
    if (bible.innerVoice.offModeLeaks?.length) assert.match(hidden, /속마음은 대사와 행동에 이렇게 새어 나온다/);
    if (bible.fewShot?.length) {
      assert.ok(shown.includes(JSON.stringify(loungeFewShotTurn(bible.fewShot[0], 'on').text)));
      assert.ok(hidden.includes(JSON.stringify(loungeFewShotTurn(bible.fewShot[0], 'off').text)));
    }
  }
});

test('윤서연: no number of years, what she keeps back until she is asked, and a story card in which she is the divorced one (2026-11-03)', () => {
  const seoyeon = loungeCharacters.find(c => c.id === 'ina');
  const text = JSON.stringify(seoyeon);
  assert.doesNotMatch(text, /3년|삼 년|서른셋/, 'the time since the divorce is told as "꽤 오래", never as a number');
  assert.match(seoyeon.tagline, /^이혼 후 첫 소개팅/);
  const rules = [...seoyeon.bible.invariants, ...seoyeon.bible.forbidden].join('\n');
  assert.match(rules, /구체적으로 묻기 전에는 먼저 말하지 않는다/);
  assert.match(rules, /상대가 한 말과 자기가 한 말을 섞지 않는다/);
  // Her story card: the title says it, and the member is not given her past (the prologue once made the member the divorced
  // one, so the two had the same story and what each had said was mixed up).
  const card = JSON.parse(readFileSync(new URL('../docs/stories/ina-first-blind-date.json', import.meta.url), 'utf8'));
  assert.equal(card.title, '이혼 후 첫 소개팅');
  assert.doesNotMatch(JSON.stringify(card), /3년|삼 년/);
  assert.doesNotMatch(card.user_role, /이혼/);
  assert.doesNotMatch(card.prologue, /이혼|3년/, 'the prologue does not tell the member\'s past as hers');
  assert.match(card.relationship, /구체적으로 물을 때/);
  assert.match(card.prologue, /당신/);
});

test('임시우: his story card is the reunion his sheet tells, and the reason he was late is on his sheet but not in the prologue (2026-11-03)', () => {
  const siwoo = loungeCharacters.find(c => c.id === 'jaeseok');
  const card = JSON.parse(readFileSync(new URL('../docs/stories/jaeseok-ending-without-you.json', import.meta.url), 'utf8'));
  assert.equal(card.id, 'jaeseok-ending-without-you', 'the card keeps its id: a story has one card');
  assert.equal(card.title, '막차까지 이십 분');
  // The sheet's night and its two people, told from the member's side.
  for (const part of ['막차', '사십 분', '손을 흔들지 않았다', '결혼식', '같은 방향이었네요', '…오랜만이네요']) assert.ok(card.prologue.includes(part), part);
  assert.match(card.prologue, /당신/);
  assert.ok(card.prologue.trimEnd().endsWith('“…오랜만이네요.”'), 'it ends where his first reply starts');
  assert.doesNotMatch(JSON.stringify(card), /시사회|세계적|현관문|현실/, 'the earlier card told another past: a poor start, a quarrel, a famous director');
  // What is his to tell stays his: not the film behind it, not why he was late, not why she did not wave.
  assert.doesNotMatch(card.prologue, /마지막 버스|한 컷|믿었|영화표/);
  assert.match(card.user_role, /손을 흔들지 않고/);
  assert.match(card.relationship, /직접 꺼낸다/);
  // The reason is written only where it opens, the third stage's disclosure: in a line told every turn (the sheet, the example
  // turns, the moment kept for it) he told it to a member who asked at the first stage (2026-11-03).
  const disclosure = relationshipConfigs.jaeseok.stageDisclosure;
  assert.match(disclosure.SAME_SCREEN, /마지막 한 컷을 고치느라 시계를 안 봤고, 당신이 늘 그랬듯 기다려 줄 거라고 믿었다는 것/);
  assert.doesNotMatch(disclosure.FIRST_SCREENING + disclosure.SPARRING, /한 컷|믿었/, 'not before the third stage');
  assert.doesNotMatch(JSON.stringify(siwoo.bible), /한 컷|기다려 줄 거라고 믿었/, 'not in anything the model reads at every stage');
  assert.match(siwoo.bible.reservedMoments[0], /self_disclosure에 열려 있는 만큼만/);
});

/**
 * What of a character reaches the model in a one-to-one chat (2026-11-05). Every turn, in the cached instructions: the
 * tagline, story, personality (since 2026-11-05), habits and the bible's rules, voice, actions, inner-voice style and
 * every example. With the turn: the inner-voice level of the stage (in full one turn in three, its first sentence on the
 * others) and an event when one comes. Never sent: quote and wins/losses (the page; scoring reads the relationship
 * config) and boundaries. look goes to photo prompts only.
 */
test('every part of a companion sheet meant for the model reaches it', () => {
  const state = normalizeLoungeCompanionState(null, 'room-1');
  const sent = (prompt, text) => prompt.includes(text) || prompt.includes(JSON.stringify(text).slice(1, -1));
  for (const character of loungeCharacters.filter(item => item.bible?.innerVoice)) {
    const bible = character.bible;
    const prompt = [loungePersonaPrompt(character, { withBible: true }), loungeBiblePrompt(character), loungeCompanionSheetPrompt(character, 'on')].join(' ');
    const parts = [character.tagline, ...character.story, ...character.personality.map(item => item.text), ...character.habits, bible.desire, bible.fear, bible.outward, bible.hidden, bible.humor,
      bible.interpretationLens, bible.voice?.tone, bible.voice?.length, bible.voice?.rhythm, ...(bible.humorExamples?.good ?? []), ...(bible.humorExamples?.bad ?? []), ...(bible.forbidden ?? []), ...(bible.actionAnchors ?? []), bible.innerVoice.style,
      ...bible.reactions.flatMap(item => [item.when, item.then]), ...bible.invariants, bible.growth,
      ...(bible.fewShot ?? []).flatMap(shot => [shot.user, 'on' in shot ? shot.on.reply : shot.reply])].filter(Boolean);
    for (const text of parts) assert.ok(sent(prompt, text), `${character.id}: not sent: ${text.slice(0, 40)}`);
    for (const stage of [1, 2, 3, 4]) {
      const level = bible.innerVoice.ladder[stage].level;
      const at = turn => loungeTurnConditions({ bible, stage, state, turn, decision: { progress: 'stay' }, innerVoice: 'on' }).inner_voice_level.level;
      assert.equal(at(3), level, `${character.id}: stage ${stage} in full`);
      assert.equal(at(4), level.split('.')[0], `${character.id}: stage ${stage} in short`);
    }
    for (const event of bible.sceneEvents ?? []) {
      const turn = loungeTurnConditions({ bible, stage: 4, state, turn: 3, decision: { progress: 'stay', event }, innerVoice: 'on' });
      assert.deepEqual(turn.event, { content: event.content, purpose: event.purpose }, `${character.id}: ${event.id}`);
    }
  }
});

test('서도현\'s turn engine, hooks, weak spots, material, hobby answer and rematch ledger reach the model (2026-11-05)', () => {
  const { loungeCompanionRules, loungeTurnEngineDirectorNote } = loadTs(fileURLToPath(new URL('../src/lib/loungeMessenger.ts', import.meta.url)));
  const doHyun = loungeCharacters.find(character => character.id === 'auditor');
  const bible = doHyun.bible;
  const prompt = [loungeBiblePrompt(doHyun), loungeCompanionSheetPrompt(doHyun, 'on')].join('\n');
  const parts = [...bible.turnEngine.beats, ...bible.turnEngine.rules, ...bible.hooks.flatMap(hook => [hook.type, hook.example]), ...bible.weakSpots,
    ...bible.materialBank.studied, ...bible.materialBank.real, ...bible.materialBank.brags, bible.hobbyAnswer.rehearsed, bible.hobbyAnswer.real, bible.hobbyAnswer.rule,
    bible.relationshipDevice.name, bible.relationshipDevice.rule];
  for (const text of parts) assert.ok(prompt.includes(text), `not sent: ${text.slice(0, 40)}`);
  // The engine ends every reply on a hook, so neither the sheet nor the chat's rules tell it to end flat more often.
  assert.doesNotMatch(loungeCompanionSheetPrompt(doHyun, 'on'), /담백하게 할 말을 하고 끝내는 답이 더 많다/);
  const own = loungeCompanionRules({ ownLength: true, innerVoice: 'on', ownEnding: true });
  assert.match(own, /턴 엔진\(turnEngine\)대로 매 답을 사용자가 한두 마디로 받아칠 수 있는 미끼로 끝낸다/);
  assert.doesNotMatch(own, /매 답을 질문으로 끝내지 않는다/);
  assert.match(loungeCompanionRules({ ownLength: true, innerVoice: 'on' }), /매 답을 질문으로 끝내지 않는다/, 'the others keep the shared rule');
  assert.match(loungeTurnEngineDirectorNote, /담백을 고르지 않고/);
  // One reply per example with its inner voice; none of them puts off the rematch to another day.
  assert.equal(bible.fewShot.length, 8);
  for (const shot of bible.fewShot) assert.ok('reply' in shot && shot.inner_voice && !/다음에 다시/.test(shot.reply), shot.user);
  // The others are untouched.
  for (const character of loungeCharacters.filter(item => item.id !== 'auditor')) assert.equal(character.bible?.turnEngine, undefined, character.id);
});
