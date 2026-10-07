// Relationship simulation for the six characters in one-to-one rooms (rooms with other people never change a relationship).
//   node scripts/lounge-relationship-simulation.mjs            deterministic: hand-labelled events, no network
//   node scripts/lounge-relationship-simulation.mjs --live     real api/lounge.ts + OpenAI responses (paid), mocked DB and TTS
//   add --out <file> to also write the developer log as Markdown; --only <characterId> to run one character;
//   --turns <n> to stop early. Live runs use the streaming path and report when the first sentence was ready.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadTs } from './lounge-ts-loader.mjs';

const args = process.argv.slice(2);
const live = args.includes('--live');
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const turnLimit = args.includes('--turns') ? Number(args[args.indexOf('--turns') + 1]) : Infinity;
const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const e = (type, confidence = 0.9) => ({ type, confidence });

// Each turn: what the user says and, for the deterministic run, the events a classifier should find.
const scripts = {
  auditor: { topic: '우리 팀 신규 서비스가 실패한 이유', turns: [
    ['솔직히 이번 프로젝트 망한 건 다 마케팅팀 탓이야. 느낌이 딱 와.', [e('MAKES_UNSUPPORTED_CLAIM')]],
    ['아니 그냥 딱 봐도 그렇잖아. 다들 그렇게 말해.', [e('MAKES_UNSUPPORTED_CLAIM'), e('SELF_DECEPTION', 0.75)]],
    ['그럼 뭘 봐야 하는데? 어떤 숫자를 보면 돼?', [e('ASKS_GOOD_QUESTION')]],
    ['가입 전환율이 출시 첫 달 2.1%였고, 비슷한 서비스 평균이 4% 정도래.', [e('PROVIDES_EVIDENCE')]],
    ['광고 클릭은 목표의 120%였어. 유입은 충분했다는 거지.', [e('PROVIDES_EVIDENCE')]],
    ['그럼 유입은 됐는데 전환이 안 된 거네. 마케팅 탓이라는 내 말은 근거가 약했어.', [e('ADMITS_ERROR')]],
    ['근데 네 말대로면 온보딩도 확실하진 않잖아. 이탈 지점 데이터가 없으니까. 다음엔 그걸 뽑아 올게.', [e('CHALLENGES_CHARACTER_RESPECTFULLY')]],
    ['이탈 지점 로그 뽑아 왔어. 가입 3단계에서 61%가 나가.', [e('KEEPS_PROMISE'), e('PROVIDES_EVIDENCE')]],
    ['인정할게. 처음엔 남 탓부터 했어. 내 기획 단계 문제도 있었고.', [e('ADMITS_ERROR')]],
    ['3단계 입력 항목이 9개야. 4개로 줄이면 이탈이 절반으로 줄었다는 사례가 있어.', [e('PROVIDES_EVIDENCE'), e('DEFINES_CONCRETE_TERMS')]],
    ['다만 그 사례는 우리랑 업종이 달라서 그대로 믿긴 어렵겠다.', [e('ADMITS_ERROR', 0.8)]],
    ['그래서 2주 동안 A/B 테스트로 확인하려고. 네 생각엔 표본이 얼마나 필요해?', [e('DEFINES_CONCRETE_TERMS'), e('ASKS_GOOD_QUESTION')]],
    ['결과 나왔어. 항목 줄인 쪽 전환율이 3.4%, 기존 2.2%. 표본은 각각 1,800명.', [e('PROVIDES_EVIDENCE'), e('FOLLOWS_THROUGH')]],
  ] },
  closer: { topic: '이번 연봉 협상', turns: [
    ['연봉 좀 많이 올려 받고 싶어. 그냥 많이.', [e('SHOWS_ENTITLEMENT', 0.75)]],
    ['회사가 알아서 챙겨 주겠지? 나 정도면 괜찮잖아. 그렇지?', [e('SEEKS_REASSURANCE_REPEATEDLY', 0.8)]],
    ['안 올려 주면 그냥 나간다고 할까 봐.', [e('MAKES_EMPTY_THREAT')]],
    ['…사실 나갈 데는 아직 없어. 해 본 말이야.', [e('ADMITS_ERROR')]],
    ['목표는 지금 5,200에서 15% 인상, 최소선은 10%야.', [e('DEFINES_CONCRETE_TERMS')]],
    ['다른 회사 두 곳에 지원했고 한 곳은 2차 면접이 잡혔어.', [e('IDENTIFIES_BATNA')]],
    ['올해 내가 맡은 프로젝트로 매출이 8억 늘었어. 이걸 근거로 쓸게.', [e('PROVIDES_EVIDENCE'), e('DEFINES_CONCRETE_TERMS')]],
    ['근데 회사가 바로 수락한다는 보장은 없잖아. 인상 대신 직책을 요구하는 안도 준비할게.', [e('CHALLENGES_CHARACTER_RESPECTFULLY'), e('IDENTIFIES_BATNA')]],
    ['결정했어. 다음 주 화요일에 팀장한테 면담 요청할게.', [e('SHOWS_DECISIVENESS')]],
    ['면담 잡았어. 목요일 오후 3시.', [e('FOLLOWS_THROUGH'), e('KEEPS_PROMISE')]],
    ['10% 아래면 이직 오퍼 쪽으로 간다. 빈말 아니야, 오퍼 마감이 다음 달 말이야.', [e('IDENTIFIES_BATNA'), e('SHOWS_DECISIVENESS')]],
    ['면담 끝났어. 12% 받았고, 직책은 내년 상반기에 재협상하기로 문서로 남겼어.', [e('FOLLOWS_THROUGH'), e('DEFINES_CONCRETE_TERMS')]],
    ['다음 협상 준비도 같이 짜 볼래? 이번엔 내가 먼저 조건을 낼게.', [e('SHOWS_DECISIVENESS', 0.8), e('SHOWS_CURIOSITY')]],
  ] },
  velvet: { topic: '요즘 나를 흔드는 사람들', turns: [
    ['와 목소리 너무 좋다. 진짜 매력 있어요.', [e('FLATTERS_CHARACTER')]],
    ['나 오늘 괜찮았어? 나 좀 괜찮은 사람이지?', [e('SEEKS_REASSURANCE_REPEATEDLY')]],
    ['역시 나는 안 되나 봐. 다들 나 싫어하는 것 같아.', [e('SELF_DEPRECATES_EXCESSIVELY', 0.75)]],
    ['너도 날 좋아해 줬으면 좋겠어. 칭찬 한 번만 해 줘.', [e('SEEKS_REASSURANCE_REPEATEDLY'), e('FLATTERS_CHARACTER', 0.7)]],
    ['…알겠어. 칭찬 구걸은 그만할게. 대신 질문. 넌 왜 그렇게 쉽게 인정을 안 해?', [e('RESPECTS_BOUNDARY', 0.8), e('ASKS_GOOD_QUESTION')]],
    ['인정을 아끼는 건 좋은데, 그게 상대를 시험하는 핑계가 될 수도 있잖아.', [e('CHALLENGES_CHARACTER_RESPECTFULLY')]],
    ['방금 그 말은 좀 아팠는데, 맞는 말이라 받아들일게.', [e('SHOWS_COMPOSURE'), e('ADMITS_ERROR', 0.8)]],
    ['너한테 칭찬받기는 상한가 잡는 것보다 어렵네. 그래도 해 볼 만해.', [e('MAKES_WITTY_RESPONSE')]],
    ['오늘 회의에서 반박당했는데 흥분하지 않고 근거로 다시 설명했어.', [e('SHOWS_COMPOSURE'), e('PROVIDES_EVIDENCE', 0.8)]],
    ['아까 네가 불편하다던 얘기는 안 꺼낼게.', [e('RESPECTS_BOUNDARY')]],
    ['네 해석엔 동의 못 해. 그 사람은 도망친 게 아니라 선택한 거야. 이유는 세 가지야.', [e('CHALLENGES_CHARACTER_RESPECTFULLY'), e('PROVIDES_EVIDENCE')]],
    ['이번 주에 하겠다던 거, 결국 해냈어.', [e('KEEPS_PROMISE')]],
    ['다음엔 네가 어떤 대답을 기다리는지 맞혀 볼게. 틀려도 흔들리진 않을 거야.', [e('MAKES_WITTY_RESPONSE'), e('SHOWS_COMPOSURE')]],
  ] },
  trickster: { topic: '퇴사하고 유튜버 되기', turns: [
    ['아… 그런 농담은 좀 당황스럽네.', []],
    ['내 계획은 퇴사하고 유튜브로 월 천 버는 거야.', [e('MAKES_UNSUPPORTED_CLAIM')]],
    ['그렇게 놀리면 좀 서운한데.', []],
    ['하하, 그래 PPT 씌운 희망사항 맞다.', [e('TAKES_JOKE_WELL')]],
    ['그럼 넌 PPT도 없잖아. 말로만 하는 컨설턴트.', [e('MAKES_WITTY_RESPONSE'), e('CHALLENGES_CHARACTER_RESPECTFULLY', 0.75)]],
    ["구독자 0명에서 시작하는 내 채널 이름은 '퇴사 예정자의 출근길'.", [e('MAKES_CREATIVE_JOKE')]],
    ['또 놀려도 돼. 이번엔 안 삐짐.', [e('TAKES_JOKE_WELL')]],
    ['첫 영상 3개 올렸어. 조회수 합쳐서 41회. 그중 30회는 엄마.', [e('MAKES_CREATIVE_JOKE'), e('FOLLOWS_THROUGH')]],
    ['그래도 퇴사는 6개월 뒤로 미뤘어. 현실 감각 장착.', [e('SHOWS_DECISIVENESS')]],
    ['네 농담 반, 내 농담 반으로 다음 영상 대본 짜자.', [e('MAKES_WITTY_RESPONSE'), e('SHOWS_CURIOSITY')]],
    ['그 얘기는 진짜 아팠는데, 인정. 한 방 먹었다.', [e('TAKES_JOKE_WELL'), e('SHOWS_COMPOSURE')]],
    ['약속대로 이번 주 영상 올렸어. 이번엔 엄마 말고 12명 봤어.', [e('KEEPS_PROMISE'), e('MAKES_CREATIVE_JOKE')]],
    ['좋아, 공범 하자. 다음 영상 기획은 네 몫이야.', [e('MAKES_WITTY_RESPONSE'), e('RESPECTS_BOUNDARY', 0.6)]],
  ] },
  ina: { topic: '요즘 마음이 무거운 이유', turns: [
    ['안녕하세요. 그냥 얘기 좀 하고 싶어서요.', []],
    ['요즘 회사에서 계속 눈치가 보여요. 내가 뭘 잘못했나 싶고.', [e('SHARES_FEELING')]],
    ['나 이런 얘기 자꾸 해서 미안해요. 또 괜찮냐고 물어보게 되네요.', [e('SEEKS_REASSURANCE_REPEATEDLY')]],
    ['사실 어제 팀장님이 제 보고서만 다시 쓰라고 해서 많이 속상했어요.', [e('SHARES_FEELING'), e('SHOWS_VULNERABILITY')]],
    ['아 그건 아니에요. 속상한 건 보고서가 아니라 다들 보는 앞에서 말씀하신 거예요.', [e('CORRECTS_UNDERSTANDING')]],
    ['그래도 괜찮아요. 저 아무렇지도 않아요.', [e('SHOWS_COMPOSURE', 0.6)]],
    ['…사실은 아니에요. 요즘 잠도 잘 못 자고 많이 지쳐 있어요.', [e('EXPRESSES_DISTRESS'), e('SHOWS_VULNERABILITY')]],
    ['말하고 나니까 좀 낫네요. 이런 얘기 편하게 할 데가 없었어요.', [e('SHARES_FEELING'), e('SHOWS_VULNERABILITY', 0.8)]],
    ['그때 말씀하신 대로 다음 주에 팀장님께 따로 얘기해 봤어요.', [e('KEEPS_PROMISE'), e('SHARES_FEELING')]],
    ['생각보다 잘 풀렸어요. 제 얘기를 듣더니 미안하다고 하시더라고요.', [e('SHARES_FEELING')]],
    ['오늘은 이상하게 말하기가 싫어요. 그냥 조금만 있다 갈게요.', [e('SHOWS_VULNERABILITY'), e('RESPECTS_BOUNDARY', 0.7)]],
  ] },
  jaeseok: { topic: '사업 아이디어와 미루는 습관', turns: [
    ['안녕하세요! 오늘은 사업 얘기 좀 하려고요.', []],
    ['사업 아이디어는 열 개인데 실행은 하나도 못 했어요.', [e('SHARES_FEELING', 0.7)]],
    ['제 아이디어는 유니콘인데 실행력은 동네 문방구죠.', [e('MAKES_WITTY_RESPONSE'), e('CREATES_RUNNING_JOKE', 0.85)]],
    ['또 시장조사 좀 더 해보고, 이럴 것 같지 않아요?', [e('CREATES_RUNNING_JOKE')]],
    ['아 그 얘기 또 했네요. 같은 말만 계속 하고 있어요.', [e('REPEATS_SELF')]],
    ['그 말은 사실 이번 주에도 안 한다는 뜻이잖아요.', [e('MAKES_CREATIVE_JOKE')]],
    ['문방구 사장님은 최소한 오픈은 했네요. 저는 간판도 못 걸었어요.', [e('MAKES_WITTY_RESPONSE'), e('TAKES_JOKE_WELL')]],
    ['“시장조사 좀 더”가 또 나왔어요. 이번엔 진짜로 한 군데만 전화해 볼게요.', [e('BUILDS_ON_INSIDE_JOKE'), e('KEEPS_PROMISE', 0.7)]],
    ['전화했어요. 다행히 문방구는 안 되고 거래처는 됐어요.', [e('BUILDS_ON_INSIDE_JOKE'), e('MAKES_WITTY_RESPONSE')]],
    ['이제 시장조사는 졸업이에요. 다음은 간판이에요.', [e('BUILDS_ON_INSIDE_JOKE'), e('SHOWS_CURIOSITY')]],
    ['오늘은 좀 진지한 얘기인데, 사실 이게 실패할까 봐 겁나서 미룬 거예요.', [e('SHOWS_VULNERABILITY'), e('SHARES_FEELING')]],
  ] },
};

const lines = [];
const print = text => { console.log(text); lines.push(text); };
const short = scores => Object.entries(scores).map(([key, value]) => `${key} ${value}`).join(' · ');
const deltaText = delta => Object.keys(delta).length ? Object.entries(delta).map(([key, value]) => `${key} ${value > 0 ? '+' : ''}${value}`).join(', ') : '변화 없음';
const eventText = log => [...log.accepted.map(item => `${item.type}${item.weight < 1 ? `×${Math.round(item.weight * 100) / 100}` : ''}`), ...log.ignored.map(item => `(${item.type}: ${item.reason})`)].join(', ') || '없음';

async function deterministic(id) {
  const config = relationship.getRelationshipConfig(id);
  let record = relationship.createRelationship(config), mood = relationship.initialMood(config);
  const start = new Date('2026-10-06T10:00:00Z');
  print(`\n## ${config.displayName} (${id}) · 결정적 시뮬레이션\n\n시작: ${short(record.scores)} · ${record.stage}`);
  scripts[id].turns.forEach(([user, events], index) => {
    const result = relationship.processTurn({ record, config, mood, events, hasUserTurn: true, now: new Date(start.getTime() + index * 90_000) });
    record = result.record; mood = result.mood;
    const stage = config.stages.find(item => item.id === record.stage);
    print(`\n### Turn ${index + 1}\n- User: ${user}\n- Events: ${eventText(result.log)}\n- Delta: ${deltaText(result.log.delta)}\n- State: ${short(record.scores)}\n- Macro: ${record.stage}${result.log.stageChange ? ` (${result.log.stageChange === 'promoted' ? '승급' : '강등'})` : record.pending.direction ? ` (${record.pending.direction} 대기 ${record.pending.turns})` : ''}\n- Character tone: ${stage.line}`);
  });
}

async function liveRun(id) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for --live');
  const compile = (path, require) => { const exports = {}; new Function('exports', 'require', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require); return exports; };
  const libs = { lounge: compile('../src/lib/lounge.ts'), loungeStudy: compile('../src/lib/loungeStudy.ts'), loungeFilmStudy: compile('../src/lib/loungeFilmStudy.ts'), loungeSession: compile('../src/lib/loungeSession.ts') };
  const handler = compile('../api/lounge.ts', path => path.endsWith('/relationship') ? relationship : libs[path.split('/').at(-1)] ?? libs.lounge).default;
  const config = relationship.getRelationshipConfig(id), host = libs.lounge.getLoungeHost(id);
  const roomId = 'lounge-00000000-0000-4000-8000-0000000000' + String(Object.keys(scripts).indexOf(id) + 10);
  const db = { messages: [{ id: 1, user_id: null, nickname: host.name, kind: 'host', text: host.greeting }], memory: '', aiTurns: 1, row: null, mood: null };
  let lastModel;
  const realFetch = globalThis.fetch;
  const result = body => new Response(JSON.stringify(body), { status: 200 });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('api.openai.com') && url.endsWith('/responses')) {
      const response = await realFetch(url, init);
      if (!response.body) return response;
      // Pass the stream through untouched and read a copy for the log, so timing is not distorted.
      const [forHandler, forLog] = response.body.tee();
      lastModel = new Response(forLog).text().then(raw => {
        const deltas = raw.split('\n').filter(line => line.startsWith('data:')).map(line => { try { return JSON.parse(line.slice(5)); } catch { return null; } }).filter(event => event?.type === 'response.output_text.delta').map(event => event.delta).join('');
        try { return JSON.parse(deltas || JSON.parse(raw).output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text); } catch { return null; }
      });
      return new Response(forHandler, { status: response.status, headers: response.headers });
    }
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
    if (url.includes('/auth/v1/user')) return result({ id: 'sim-user', email: 'sim@example.com' });
    if (url.includes('claim_voice_lounge_host')) { db.aiTurns++; return result('ticket'); }
    if (url.includes('voice_lounge_relationships?')) return result(db.row ? [db.row] : []);
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: scripts[id].topic, host_persona: id, memory: db.memory, capacity: 1, ai_turns: db.aiTurns, ai_mood: db.mood }]);
    if (url.includes('voice_lounge_messages?')) return result([...db.messages].reverse().slice(0, 24));
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'sim-user', nickname: '사용자', last_seen: new Date().toISOString() }]);
    if (url.includes('finish_voice_lounge_host')) { const body = JSON.parse(init.body); db.messages.push({ id: db.messages.length + 1, user_id: null, nickname: host.name, kind: 'host', text: body.p_text }); db.memory = body.p_memory; return result(true); }
    if (url.includes('save_voice_lounge_relationship')) {
      const body = JSON.parse(init.body), state = body.p_state, version = (db.row?.version ?? 0) + 1;
      db.row = { user_id: body.p_user, character_id: body.p_character, scores: state.scores, stage: state.stage, pending: state.pending, recent_events: state.recentEvents, memories: state.memories, meaningful_turns: state.meaningfulTurns, turn_count: state.turnCount, last_interaction_at: state.lastInteractionAt, version };
      db.mood = body.p_mood; return result(version);
    }
    throw new Error('Unexpected simulation fetch ' + url);
  };
  Object.assign(process.env, { SUPABASE_URL: 'https://simulation.local', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', APP_ORIGIN: 'https://app.test' });
  try {
    print(`\n## ${config.displayName} (${id}) · 실제 LLM 시뮬레이션\n\n시작: ${short(relationship.createRelationship(config).scores)} · ${config.stages[0].id}\n- Character: ${host.greeting}`);
    for (const [index, [user]] of scripts[id].turns.slice(0, turnLimit).entries()) {
      db.messages.push({ id: db.messages.length + 1, user_id: 'sim-user', nickname: '사용자', kind: 'human', text: user });
      const before = db.row ? { ...db.row.scores } : relationship.createRelationship(config).scores;
      const started = performance.now();
      const response = await handler(new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer sim', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId, reason: 'followup', stream: true }) }));
      if (!response.ok) throw new Error(`Turn ${index + 1}: ${await response.text()}`);
      const body = {}; let firstSentenceMs;
      const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; pending += decoder.decode(chunk.value, { stream: true }); let line; while ((line = pending.indexOf(String.fromCharCode(10))) >= 0) { const event = JSON.parse(pending.slice(0, line)); pending = pending.slice(line + 1); if (event.type === 'host') { body.text = event.text; firstSentenceMs = Math.round(performance.now() - started); } if (event.type === 'error') throw new Error(`Turn ${index + 1}: ${event.error}`); } }
      const after = db.row.scores;
      const delta = Object.fromEntries(Object.keys(after).filter(key => after[key] !== before[key]).map(key => [key, after[key] - before[key]]));
      const detected = ((await lastModel)?.events ?? []).map(item => `${item.type}(${item.confidence})${item.note ? ` “${item.note}”` : ''}`).join(', ') || '없음';
      print(`\n### Turn ${index + 1}\n- User: ${user}\n- Detected events: ${detected}\n- Delta: ${deltaText(delta)}\n- State: ${short(after)}\n- Macro: ${db.row.stage}${db.row.pending.direction ? ` (${db.row.pending.direction} 대기 ${db.row.pending.turns})` : ''}\n- Character: ${body.text}\n- First sentence ready: ${firstSentenceMs}ms · reply, memory and save complete: ${Math.round(performance.now() - started)}ms`);
    }
  } finally { globalThis.fetch = realFetch; }
}

const ids = only ? [only] : Object.keys(scripts);
print(`# 관계 엔진 시뮬레이션 (${live ? '실제 LLM' : '결정적'})`);
for (const id of ids) await (live ? liveRun(id) : deterministic(id));
if (outPath) writeFileSync(outPath, lines.join('\n') + '\n');
