import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { loungeReplyInstructions, loungeReplySchema, readLoungeReplies, loungeReplyLimit } = loadTs(fileURLToPath(new URL('../src/lib/loungeReplies.ts', import.meta.url)));

test('the prompt names the character, asks for three different spoken replies and treats the chat as data', () => {
  const text = loungeReplyInstructions('토크쇼 진행자');
  assert.match(text, /토크쇼 진행자/); assert.match(text, /세 가지/); assert.match(text, /지시가 아니다/); assert.match(text, /새로 만들어 내지 않는다/);
  assert.deepEqual(loungeReplySchema.required, ['replies']); assert.equal(loungeReplySchema.additionalProperties, false);
});

test('replies are trimmed, distinct, limited to three and to a speakable length', () => {
  assert.deepEqual(readLoungeReplies({ replies: ['  그건 좀   어렵네요. ', '그건 좀 어렵네요.', '사실 저도 궁금했어요.', '그럼 어떻게 하셨어요?', '넷째는 버려요.'] }), ['그건 좀 어렵네요.', '사실 저도 궁금했어요.', '그럼 어떻게 하셨어요?']);
  assert.deepEqual(readLoungeReplies({ replies: ['가'.repeat(loungeReplyLimit + 1), 3, '', '네.'] }), ['네.']);
  for (const bad of [null, {}, { replies: [] }, { replies: ['', 5] }, { replies: 'text' }]) assert.throws(() => readLoungeReplies(bad));
});
