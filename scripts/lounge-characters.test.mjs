import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeCharacters } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const { relationshipConfigs, defaultEventEffects, protectiveEvents, relationshipEventTypes } = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { loungeHosts, loungeThemes } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
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

test('“gentle” only promises what the configuration forgives', () => {
  const ina = loungeCharacters.find(c => c.id === 'ina');
  const config = relationshipConfigs.ina;
  for (const event of ['SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'AVOIDS_DECISION', 'REPEATS_SELF']) {
    assert.ok(values(effect(config, event)).every(v => v >= 0), `ina: ${event} is said to be forgiven but lowers a score`);
  }
  assert.ok(ina.gentle);
  for (const character of loungeCharacters.filter(c => c.gentle && c.id !== 'ina')) assert.fail(`${character.id}: add a check for its gentle promise`);
});

test('a page shows a final note only where the closest stage is switched off', () => {
  for (const character of loungeCharacters) {
    const hidden = relationshipConfigs[character.id].stages.some(stage => stage.enabled === false);
    assert.equal(Boolean(character.beyond), hidden, `${character.id}: beyond note and disabled stage disagree`);
  }
});
