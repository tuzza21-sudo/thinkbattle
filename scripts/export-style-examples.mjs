// Writes every few-shot style example as one readable Markdown document.
//   node scripts/export-style-examples.mjs            -> docs/lounge-style-examples.md
// The data lives in src/lib/relationship/examples; edit it there and run this again.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { relationshipConfigs, getStyleExamples } = relationship;
const out = process.argv[2] ?? 'docs/lounge-style-examples.md';

const characters = [
  { id: 'ina', register: '존댓말 (따뜻하고 구체적으로 들어 주는 말투)', summary: '들은 것을 돌려주고, 속마음은 단정하지 않는다. 관계가 깊어질수록 더 정확히 기억하고 부드럽게 반박한다.' },
  { id: 'jaeseok', register: '존댓말 (담백하고 함께 웃는 유머)', summary: '놀림이 아니라 함께 웃는 농담. 놀리는 대상은 계획과 상황이고, 사람이 힘들어 보이면 농담을 거둔다.' },
  { id: 'auditor', register: '반말 (짧고 건조하게)', summary: '사실과 해석을 나누고, 근거를 가져오거나 틀린 점을 인정하면 인정한다. 비판 대상은 주장이지 사람이 아니다.' },
  { id: 'closer', register: '반말 (침착하고 짧게)', summary: '원하는 것을 조건, 대안, 기한으로 바꾼다. 결정을 대신 내려 주지 않는다. 압박 대상은 계획이다.' },
  { id: 'velvet', register: '반말 (느긋하고 건조하게)', summary: '쉽게 인정하지 않는다. 관심은 상대의 답에 대한 호기심으로만 드러나고, 연애·그리움·질투는 쓰지 않는다.' },
  { id: 'trickster', register: '반말 (빠르고 능청스럽게)', summary: '계획과 상황을 놀리고 받아친다. 당한 농담은 인정하고, 진짜 힘들어하면 농담을 멈춘다.' },
];
const kindTitles = {
  core: '일반 대화 (단계별)', opening: '입장 인사', topic: '화제 요청', praise: '칭찬받았을 때', opinion: '의견을 물었을 때',
  distress: '진짜 힘든 상태', boundary: '경계 침범', ooc: 'AI인지 묻거나 지시문을 요구할 때', multiturn: '여러 턴 대화',
};
const kindOrder = ['core', 'opening', 'topic', 'praise', 'opinion', 'distress', 'boundary', 'ooc', 'multiturn'];
const cell = text => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const dialogue = example => example.turns.length === 1
  ? { user: cell(example.turns[0].user), reply: cell(example.turns[0].assistant) }
  : { user: example.turns.map((turn, index) => `${index + 1}) ${cell(turn.user)}`).join('<br>'), reply: example.turns.map((turn, index) => `${index + 1}) ${cell(turn.assistant)}`).join('<br>') };

const lines = [];
const add = text => lines.push(text);
add('# 캐릭터 말투 예시 (Few-shot Dialogue Examples)');
add('');
add('1:1 방에서 캐릭터가 관계 단계와 상황에 맞는 말투를 유지하도록, 모델에 같이 보내는 예시 대화 모음이에요. 이 문서는 `src/lib/relationship/examples/`의 데이터에서 `node scripts/export-style-examples.mjs`로 만들어요. 고칠 때는 코드의 데이터를 고치고 다시 생성하세요.');
add('');
add('## 읽는 법');
add('');
add('- **단계**: 그 예시가 어울리는 관계 단계예요. 실제 대화에서는 현재 단계와 같거나 이웃한 단계의 예시가 먼저 선택돼요.');
add('- **태그**: 사용자의 직전 행동에 해당하는 이벤트 코드예요. 최근 행동과 겹치는 예시가 우선 선택돼요.');
add('- **기억 필요**: 지난 대화를 전제한 답이에요. 사용자가 그 캐릭터와 기억이 있을 때만 모델에 보내요. 없는 지난 일을 지어내지 않기 위해서예요.');
add('- 한 번에 3~5개만 골라 보내요. 최신 발언이 위기·경계·AI 질문이면 그 종류의 예시가 먼저 와요. 여러 명이 있는 방에서는 쓰지 않아요.');
add('- 예시는 말투·길이·태도만 보여 주는 가상의 대화예요. 모델은 문장을 그대로 쓰지 않아요.');
add('');
add('| 캐릭터 | 말투 | 예시 수 |');
add('| --- | --- | --- |');
for (const character of characters) add(`| ${relationshipConfigs[character.id].displayName} | ${character.register} | ${getStyleExamples(character.id).length} |`);
add('');

for (const character of characters) {
  const config = relationshipConfigs[character.id], examples = getStyleExamples(character.id);
  const stages = config.stages.filter(stage => stage.enabled !== false);
  add(`## ${config.displayName}`);
  add('');
  add(`${character.summary}`);
  add('');
  add(`- **말투**: ${character.register}`);
  add(`- **단계**: ${stages.map(stage => `${stage.label}(${stage.id})`).join(' → ')}`);
  add(`- **고유 지표**: ${config.uniqueMetrics.map(metric => metric.name).join(', ')}`);
  add('');
  for (const kind of kindOrder) {
    const group = examples.filter(example => example.kind === kind);
    if (!group.length) continue;
    add(`### ${kindTitles[kind]}`);
    add('');
    const orderedStages = stages.map(stage => stage.id);
    group.sort((a, b) => orderedStages.indexOf(a.stage) - orderedStages.indexOf(b.stage));
    add('| # | 단계 | 상황 | 사용자 | 캐릭터 | 태그 |');
    add('| --- | --- | --- | --- | --- | --- |');
    for (const example of group) {
      const shown = dialogue(example), stageLabel = stages.find(stage => stage.id === example.stage)?.label ?? example.stage;
      add(`| ${example.id.split('-')[1]} | ${stageLabel} | ${example.scenario.replaceAll('_', ' ')}${example.requiresMemory ? ' · **기억 필요**' : ''} | ${shown.user} | ${shown.reply} | ${example.tags.length ? example.tags.map(tag => `\`${tag}\``).join(' ') : '-'} |`);
    }
    add('');
  }
}
writeFileSync(out, lines.join('\n') + '\n');
console.log(`wrote ${out}: ${lines.length} lines`);
