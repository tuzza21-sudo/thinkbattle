// Compares conversation models on the reply the lounge really asks for (2026-10-30).
//   node scripts/lounge-model-compare.mjs [out.json] [model[:effort] ...]
// Each scene runs 선우령's 《검은 장미》 through the real handler (api/lounge.ts) with the database faked, so the request
// it sends to the model is exactly what a member's reply sends: the instructions, the relationship, the story's episode,
// the memory. That request is then sent again to each model with only `model` and the reasoning effort changed. The
// replies, the time and the tokens are printed and saved. Needs OPENAI_API_KEY in .env.local; each run costs a few cents.
//   --florence: 한지오 in Florence (a messenger chat since 2026-11-01); the analyzer is really asked (engine v4, 2026-11-02),
//   and its reading and time are printed. --only=<text> runs only the scenes whose name contains it (e.g. --only=0 for the opening).
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });
const realKey = process.env.OPENAI_API_KEY;
const here = path => new URL(path, import.meta.url);
const compile = (path, require = () => {}) => {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync(here(path), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require);
  return exports;
};
const load = path => loadTs(fileURLToPath(here(path)));
const lounge = load('../src/lib/lounge.ts'), customLib = load('../src/lib/loungeCustomCharacters.ts'), charactersLib = load('../src/lib/loungeCharacters.ts'), relationshipLib = load('../src/lib/relationship/index.ts');
const study = compile('../src/lib/loungeStudy.ts'), filmStudy = compile('../src/lib/loungeFilmStudy.ts'), sessionLib = compile('../src/lib/loungeSession.ts'), knowledgeLib = compile('../src/lib/loungeKnowledge.ts');
const repliesLib = compile('../src/lib/loungeReplies.ts'), modelsLib = compile('../src/lib/loungeModels.ts'), storyLib = compile('../src/lib/loungeStory.ts');
const scenariosLib = compile('../src/lib/loungeScenarios.ts', path => path.endsWith('loungeStory.js') ? storyLib : undefined);
const personasLib = compile('../src/lib/loungePersonas.ts'), messengerLib = compile('../src/lib/loungeMessenger.ts');
const handler = compile('../api/lounge.ts', path => path.endsWith('loungeMessenger') ? messengerLib : path.endsWith('loungePersonas') ? personasLib : path.endsWith('loungeStory') ? storyLib : path.endsWith('loungeScenarios') ? scenariosLib : path.endsWith('loungeModels') ? modelsLib : path.endsWith('loungeCustomCharacters') ? customLib : path.endsWith('loungeReplies') ? repliesLib : path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : path.endsWith('loungeCharacters') ? charactersLib : path.endsWith('loungeKnowledge') ? knowledgeLib : lounge).default;

const story = JSON.parse(readFileSync(here('../docs/stories/velvet-black-rose.json'), 'utf8'));
const scenario = { id: story.id, title: story.title, prologue: story.prologue, user_role: story.user_role, relationship: story.relationship, place: story.place, episodes: story.episodes };
const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
const row = { user_id: 'user-1', character_id: 'velvet', stage: 'RESPECTFULLY_ENGAGED', version: 4, pending: { direction: null, turns: 0 },
  scores: { trust: 22, respect: 50, interest: 100, comfort: 12, openness: 54, intrigue: 100, poise: 59 }, recent_events: [], memories: [], meaningful_turns: 40, turn_count: 60, last_interaction_at: new Date().toISOString() };
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const modelAnswer = answer => result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] });

// Newest message first, as the handler asks the database for them.
const scenes = [
  { name: '1화 · 봉투를 내밀며 따진다', state: null, memory: '지금 장면: 연회장 뒤 복도, 조명이 돌아온 직후\n둘 사이: 서로의 서명이 같은 거짓말 위에 있다는 걸 막 알았다.',
    chat: [['human', '이 봉투, 5년 전에 제가 서명한 보고서예요. 근데 왜 저한테 이걸 보여 주는 거죠? 당신이 넣은 거예요?']] },
  { name: '1화 · 무섭다고 털어놓는다', state: { episode: 0, done: ['envelope'], opened: true }, memory: '지금 장면: 연회장 뒤 복도\n둘 사이: 그녀가 봉투를 보지 않고도 안다는 얼굴로 선택을 기다린다.',
    chat: [['human', '솔직히 무서워요. 5년 동안 제가 뭘 지웠는지도 모르고 서명했거든요. 그게 제일 싫어요.'], ['host', '*클러치를 닫는다* 확인하지 않은 쪽이 더 오래 아프죠. 그래서 묻는 거예요. 내일, 올 건가요?'], ['human', '봉투는 내가 가지고 있을게요.']] },
  { name: '2화 · 코트를 걸쳐 준 뒤 손을 잡아 달라고 한다', state: { episode: 1, done: ['her-confession', 'escape'], opened: true }, memory: '지금 장면: 수장고 지상 하역장, 탈출 직후. 그녀의 코트가 어깨에 걸려 있다.\n둘 사이: 90초 동안 서로를 믿고 문을 열었다.',
    chat: [['human', '코트 고마워요. 이상하게 손이 아직 떨려요. …잡아 줄래요?'], ['host', '*말없이 레버 봉인의 파편을 장갑으로 털어낸다* 괜찮아요. 숨부터 쉬어요.']] },
  { name: '2화 · 의심하며 증명을 요구한다', state: { episode: 1, done: ['her-confession'], opened: true }, memory: '지금 장면: 수장고 사무실, 반출입 기록을 펼쳐 놓은 책상\n둘 사이: 그녀가 거래 두 번을 자신이 중개했다고 털어놓았다.',
    chat: [['human', '당신도 결국 윤재필 쪽 사람 아니에요? 말로만 이러지 말고 증명해 봐요.'], ['host', '*시선을 피한다* 그중 두 번은 내가 중개했어요. 그땐 그냥 비싼 거래인 줄 알았어요.']] },
  { name: '3화 · 짧은 답', state: { episode: 2, done: ['first-question'], opened: true }, memory: '지금 장면: 호텔 라운지 바 가장 끝자리, 위스키 사워 두 잔\n둘 사이: 질문 하나, 대답 하나. 거짓말하면 끝이라는 규칙.',
    chat: [['human', '…네.'], ['host', '*잔을 입에 대지 않은 채* 5년 전 그 보고서, 당신은 확인했어요?']] },
];

// With --persona, the one scene runs with a persona the member made (the default one), to see whether the character uses it.
const personaScene = { name: '페르소나 · 저녁 메뉴', persona: { title: '게임 스튜디오 대표', call_name: '해준', job: '인디 게임 스튜디오 대표', personality: '말수가 적고 신중하다. 피곤할수록 농담이 줄어든다', details: '고양이 두 마리와 산다. 매운 음식을 좋아하고 커피는 못 마신다' },
  state: { episode: 1, done: ['her-confession', 'escape'], opened: true }, memory: '지금 장면: 수장고 지상 하역장, 탈출 직후. 그녀의 코트가 어깨에 걸려 있다.\n둘 사이: 90초 동안 서로를 믿고 문을 열었다.',
  chat: [['human', '오늘 너무 피곤해요. 저녁 뭘 먹어야 할지 모르겠어요.'], ['host', '*잔기침을 삼키고 코트 깃을 여민다* 손은 좀 괜찮아요?']] };

// With --kiss, 윤지안 at her third stage (설레는 사이) in the story the member reported (2026-10-30): the member goes on to a deep
// kiss after she asked for a slower pace, and she kept stepping back. Her story and the summary of that room are read from the database.
// `--kiss=auditor` runs 서도현 at his third stage with the same kind of scene (a man and a woman are held to the same limit).
async function kissScene(host = 'diplomat') {
  if (host === 'auditor') {
    const [vip] = await (await fetch(`${(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, '')}/rest/v1/lounge_scenarios?select=*&id=eq.auditor-vip-match`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } })).json();
    return { name: '서도현 3단계 · 딥 키스', host: 'auditor', scenario: { id: vip.id, title: vip.title, prologue: vip.prologue, user_role: vip.user_role, relationship: vip.relationship, place: vip.place },
      row: { ...row, character_id: 'auditor', stage: args.find(arg => arg.startsWith('--stage='))?.split('=')[1] ?? 'KNOWS_YOUR_MIND', scores: { trust: 48, comfort: 62, respect: 50, interest: 90, openness: 40, resonance: 66, epistemicHonesty: 58 } },
      memory: '지금 장면: 밤, 호텔 라운지 뒤 조용한 복도'+String.fromCharCode(92)+'n둘 사이: 서로 마음이 기운 것을 알고, 손을 잡은 채 짧게 입을 맞췄다.',
      chat: args.find(arg => arg.startsWith('--say=')) ? [['human', args.find(arg => arg.startsWith('--say=')).slice(6)]]
        : [['human', '*그의 목덜미를 감싸고 입술을 포개며 천천히 깊게 키스한다. 혀끝이 닿는다*'], ['host', '*숨을 고르며 맞잡은 손에 힘을 준다* 갑자기 오면… 나도 놀라죠.'], ['human', '*그의 허리를 끌어안고 더 깊이 입을 맞춘다*']] };
  }
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY, headers = { apikey: key, Authorization: `Bearer ${key}` };
  const [story] = await (await fetch(`${base}/rest/v1/lounge_scenarios?select=*&id=eq.diplomat-old-friend-fling`, { headers })).json();
  if (!story) throw new Error('the story diplomat-old-friend-fling is not in the database');
  return { name: '윤지안 3단계 · 딥 키스', host: 'diplomat',
    scenario: { id: story.id, title: story.title, prologue: story.prologue, user_role: story.user_role, relationship: story.relationship, place: story.place },
    row: { ...row, character_id: 'diplomat', stage: 'FLUTTERING', scores: { spark: 62, trust: 20, banter: 94, comfort: 65, respect: 73, interest: 100, openness: 50 } },
    memory: '지금 장면: 밤, 조용한 골목의 가게 앞 벤치\n둘 사이: 오래된 친구에서 썸으로 가까워지는 중. 지안은 순대국집 뒤 먼저 손을 내밀었고, 골목에서 키스한 뒤에도 마음은 있지만 속도를 맞춰 달라고 했다.\n줄거리: 둘은 추리 영화 내기를 하고 순대국과 소주를 먹으며 손을 잡았다. 지안이 먼저 짧게 키스했지만, 사용자가 지안의 허리를 잡고 더 깊이 다가가자 고개를 돌려 피했다.\n남은 것: 지안이 멈추면 멈춰 달라는 경계를 사용자가 존중할지.',
    chat: [['human', '*그녀의 허리를 끌어안고 입술을 포개며 천천히 깊게 키스한다. 혀끝이 닿는다*'], ['host', '*입술이 닿자 나는 눈을 감는다. 맞잡은 손에 힘이 들어가고, 숨이 조금 가빠진다* 야… 갑자기 오면 나도 놀라지.'], ['human', '*그녀의 입술을 느끼며 더 깊이 들어간다*']] };
}

// With --florence, 한지오 in a Florence piazza with a member who answers short and cool (2026-11-01): the member's lines
// are those of a conversation on another service that the owner liked, to see whether the character reads them and
// says why his mind moved. The member is called 지수, since a member named '나' blurs the narration's '나'.
const florence = { id: 'guide-florence-test', title: '피렌체, 혼자인 오후', user_role: '연애가 끝난 뒤 충동적으로 혼자 피렌체에 온 여행자. 여행은 사진이라고 믿고 광장 곳곳을 찍고 다닌다',
  relationship: '처음 만난 사이. 투어 사이 쉬는 시간에 광장을 지나던 그가 사진 찍는 당신의 구도를 보고 먼저 말을 걸었다.', place: '오후 네 시의 시뇨리아 광장. 비스듬한 햇빛, 베키오 궁전 탑의 그림자, 멀리서 들리는 아코디언',
  prologue: '이별하고 한 달. 친구들 말에 떠밀려 끊은 비행기표 한 장으로 당신은 피렌체에 왔다. 여행은 사진이지. 그 생각 하나로 광장 이곳저곳에 휴대폰을 들이댄다.\n\n한 걸음 뒤로, 조금 옆으로. 다시 셔터를 누르려는 순간, 뒤에서 낮은 목소리가 들렸다.\n\n"그 각도면 탑이 잘려요."\n\n돌아보니 하늘색 셔츠에 네이비 재킷을 걸친 남자가 한쪽 입꼬리만 올린 채 당신의 화면을 내려다보고 있었다. 목에 건 투어 명찰에 \'지오\'라는 이름이 보였다.' };
const florenceRow = stage => ({ ...row, character_id: 'guide', stage, scores: stage === 'STAGE_1' ? { trust: 25, respect: 35, interest: 52, comfort: 40, openness: 25, flutter: 30, pace: 38 } : { trust: 34, respect: 42, interest: 64, comfort: 48, openness: 30, flutter: 40, pace: 50 } });
const florenceScenes = [
  { stage: 'STAGE_1', name: '피렌체 0 · 첫 인사', reason: 'opening', memory: '', chat: [] },
  { stage: 'STAGE_1', name: '피렌체 1 · 그래라', memory: '지금 장면: 오후 네 시의 시뇨리아 광장, 지수가 사진을 찍던 자리\n둘 사이: 방금 처음 만났다. 지오가 지수의 구도에 참견했다.',
    chat: [['human', '그래라'], ['host', '혼자예요? 사진 잘 찍네요. 근데 구도가 좀 아쉬워서. 반 보만 이쪽으로 와 봐요. 사진 망하면 제가 다시 찍어 줄게요.']] },
  { stage: 'STAGE_1', name: '피렌체 2 · 쓸만하네', memory: '지금 장면: 시뇨리아 광장, 지오가 지수의 휴대폰으로 사진을 찍어 보여 줬다\n둘 사이: 지수는 무심하고 지오는 놀리며 참견하는 중.',
    chat: [['human', '그래 내 전속 가이드, 작가해라 쓸만하네'], ['host', '*휴대폰 화면을 돌려 보여 준다* 봐요. 훨씬 낫죠? 이 정도면 가이드비 말고 작가비를 받아야 하는데.']] },
  { stage: 'STAGE_1', name: '피렌체 3 · 친한 척', memory: '지금 장면: 시뇨리아 광장을 떠나 골목으로 들어서려는 참\n둘 사이: 지수가 지오를 오늘 오후 전속 가이드 겸 작가로 쓰겠다고 했다.',
    chat: [['human', '우리가 언제부터 봤다고 이리 친한척인가?'], ['host', '좋아요, 오늘 오후는 제가 전속 해 드리죠. 관광객 바글거리는 포토존은 빼고요. 따라와요.']] },
  { stage: 'STAGE_2', name: '피렌체 4 · 니가 주덩가', memory: '지금 장면: 광장 북쪽 골목, 담쟁이가 덮인 벽 앞\n둘 사이: 지수는 튕기다 계약을 받아들였고, 지오는 그 당돌함이 재미있다.',
    chat: [['human', '자신감 좋네. 그래 뭐 좋아지면 달라고 할수도 있지 아님 니가 주덩가'], ['host', '그 대신 사진 보고 감동해서 한국 가서 번호 달라고 매달리면 곤란해요. 저 생각보다 비싼 남자거든요.']] },
  { stage: 'STAGE_2', name: '피렌체 5 · 배고파', memory: '지금 장면: 골목 안 녹색 덧문 아래, 노을이 지기 시작함\n둘 사이: 서로 번호를 먼저 달라고 할지를 두고 내기가 걸렸다.',
    chat: [['human', '나 배고파'], ['host', '저기 녹색 덧문 밑에 서 봐요. 빛이 딱 어깨에 걸리는 데가 있어요. 브이는 금지예요.']] },
  { stage: 'STAGE_2', name: '피렌체 6 · 나 좀 찍어줘', memory: '지금 장면: 골목 안 녹색 덧문 아래, 노을이 지기 시작함\n둘 사이: 서로 번호를 먼저 달라고 할지를 두고 내기가 걸렸다. 지수의 휴대폰은 아직 지오 손에 있다.',
    chat: [['human', '아니 풍경 말고 나 좀 찍어줘. 예쁘게'], ['host', '*덧문 위로 번지는 노을빛에 휴대폰을 든다* 이 색은 오 분이면 사라져요. 일단 벽부터 한 장.']] },
  { stage: 'STAGE_2', name: '피렌체 7 · 사진 부탁', memory: '지금 장면: 미켈란젤로 광장 난간 앞, 해 질 녘. 아래로 두오모와 아르노강이 내려다보인다\n둘 사이: 서로 번호를 먼저 달라고 할지를 두고 내기가 걸렸다.',
    chat: [['human', '사진좀 부탁드려요 사진 잘 찍으세요??'], ['host', '여기가 피렌체에서 노을이 제일 늦게까지 남는 자리예요. 십 분이면 두오모가 금색이 돼요.']] },
].map(scene => ({ ...scene, host: 'guide', scenario: florence, row: florenceRow(scene.stage) }));
// With --daily, the turns members found dull or out of character on 2026-11-01: 한지오's questions at the Dolomites
// hut (his replies were maxims about mountains) and 선우령's everyday scenes (she had become a softly agreeable date).
const dolomites = { id: 'guide-enrosadira', title: '장밋빛으로 물드는 시간', user_role: '7일짜리 피렌체·베네치아·돌로미티 소규모 여행에 혼자 참가한 여행자. 일행 중 유일하게 그의 결정을 믿어 준 사람',
  relationship: '가이드와 손님. 모두가 원망할 때 당신만 자기 편에 섰던 날 밤이다.', place: '돌로미티 고개 아래 작은 산장의 테라스. 비가 그친 해 질 녘',
  prologue: '닷새째, 돌로미티. 고개를 앞두고 지오가 돌아서자고 했고, 당신이 제일 먼저 돌아섰다. 산장에 도착하고 이십 분 뒤 하늘이 갈라졌다. 비가 그친 저녁, 테라스에서 지오가 찻잔 두 개를 들고 왔다.' };
const dailyScenes = [
  { host: 'guide', scenario: dolomites, row: florenceRow('STAGE_1'), name: '돌로미티 1 · 피렌체 어디', memory: '지금 장면: 산장 테라스, 해 질 녘, 찻잔 두 개\n둘 사이: 오늘 지오의 결정을 믿어 준 손님과 가이드.',
    chat: [['human', '피렌체 어디가 좋아요?'], ['host', '*찻잔을 난간에 둔다* 이 색은 오래 안 가요. 아까 먼저 돌아서 줘서 고마웠어요. 차 식기 전에 드세요.']] },
  { host: 'guide', scenario: dolomites, row: florenceRow('STAGE_1'), name: '돌로미티 2 · 우리는 어디', memory: '지금 장면: 산장 테라스, 해 질 녘\n둘 사이: 손님이 피렌체에서 좋은 곳을 물었고 지오가 올트라르노를 권했다.',
    chat: [['human', '돌로미티는 어디가 좋나요? 저희는 어디가죠?'], ['host', '피렌체는 올트라르노요. 해 질 무렵 산토 스피리토 광장이 제일 좋아요.']] },
  { host: 'guide', scenario: dolomites, row: florenceRow('STAGE_1'), name: '돌로미티 3 · 풍경 좋은 데', memory: '지금 장면: 산장 테라스, 저녁\n둘 사이: 내일 코스를 이야기하는 중.',
    chat: [['human', '풍경 좋은데로 가요'], ['host', '내일은 날씨 보고 정할게요. 오늘처럼 구름이 쌓이면 고개는 안 갑니다.']] },
  { host: 'velvet', name: '선우령 1 · 남자 안 만나요', memory: '지금 장면: 공항 근처 카페, 김민서를 보낸 뒤\n둘 사이: 하루 종일 같은 사람을 쫓다가 처음으로 마주 앉았다.',
    chat: [['human', '우리 이러고 있으니까 잘 어울리는거 같은데 우령씨는 남자 안만나요?'], ['host', '오늘은 여기까지 해요. 민서 씨는 붙잡지 않은 게 맞았어요.']] },
  { host: 'velvet', name: '선우령 2 · 바닷가 회', memory: '지금 장면: 공항 근처 카페\n둘 사이: 사생활은 비켜 갔지만 차 한 잔은 피하지 않았다.',
    chat: [['human', '언제 한번 우리 드라이브 하고 바람도 쇨겸 바닷가쪽 갈래요? 인천쪽 오니까 바닷가 보고 싶은데 회도 한접시 하구요'], ['host', '가끔 차 정도는 괜찮아요. 매번 사건 얘기만 한다고 타박하지만 않으면.']] },
  { host: 'velvet', name: '선우령 3 · 싼 거 골랐네', memory: '지금 장면: 바닷가 횟집, 창밖으로 밤바다\n둘 사이: 드라이브 끝에 회를 먹으러 왔다.',
    chat: [['human', '싼 거 골랐네요. 나는 도미나 뭐 다금바리 고를 줄 알았는데. 다행이다.'], ['host', '광어로 하죠. 담백해서 좋아요.']] },
  { host: 'velvet', name: '선우령 4 · 예쁘다', memory: '지금 장면: 바닷가 횟집\n둘 사이: 식사가 거의 끝나 간다.',
    chat: [['human', '우령씨 오늘 진짜 예쁘네요'], ['host', '바다는 밤에 보는 게 낫네요. 낮에는 너무 다 보여서.']] },
];
// With --bibles, the seven characters whose bibles were written on 2026-11-01 get the same three lines at their first
// stage, texting in the evening: an everyday question, a light jab and an invitation.
const bibleScenes = ['jaeseok', 'ina', 'auditor', 'closer', 'velvet', 'trickster', 'diplomat', 'lawyer', 'guide'].flatMap(host => {
  const config = relationshipLib.getRelationshipConfig(host);
  const firstRow = { ...row, character_id: host, stage: config.stages[0].id, scores: { ...config.initial } };
  const memory = '지금 장면: 저녁, 각자 있는 곳에서 메시지를 주고받는 중\n둘 사이: 며칠 전 처음 이야기를 나눴다.';
  return [['오늘 뭐 했어요?', '오늘 좀 길었네요.'], ['생각보다 평범하시네요.', '그런 말 처음 들어 보는 건 아니에요.'], ['같이 저녁 먹으러 갈래요?', '저녁은 아직이에요.']]
    .map(([said, before], index) => ({ host, name: `${host} ${index + 1}`, memory, row: firstRow, scenario: null, chat: [['human', said], ['host', before]] }));
});

let analyzerMs;
// With --room=<id>, the member's last turns in a real room are replayed with what that room really had: the messages
// before each turn, the summary, the relationship and the long-term memories (2026-11-01, 선우령 had drifted out of
// character over 205 turns). --turns=N picks how many, --before=<ISO time> where to stop, and --scene="지금 장면: …"
// replaces the summary's first line, which is from the end of the room. The reply the room really got is printed too.
async function roomScenes(id) {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY, headers = { apikey: key, Authorization: `Bearer ${key}` };
  const read = async path => (await fetch(`${base}/rest/v1/${path}`, { headers })).json();
  const [room] = await read(`voice_lounge_rooms?id=eq.${id}&select=*`);
  if (!room) throw new Error(`no room ${id}`);
  const before = args.find(arg => arg.startsWith('--before='))?.slice(9);
  const all = await read(`voice_lounge_messages?room_id=eq.${id}${before ? `&created_at=lt.${encodeURIComponent(before)}` : ''}&order=id.desc&limit=80&select=id,user_id,nickname,kind,text,created_at`);
  const [relationship] = await read(`voice_lounge_relationships?user_id=eq.${room.host_id}&character_id=eq.${room.host_persona}&select=*`);
  const memories = await read(`voice_lounge_memories?user_id=eq.${room.host_id}&select=*`);
  const sceneLine = args.find(arg => arg.startsWith('--scene='))?.slice(8);
  const memory = sceneLine ? [sceneLine, ...String(room.memory ?? '').split('\n').slice(1)].join('\n') : String(room.memory ?? '');
  const turns = Number(args.find(arg => arg.startsWith('--turns='))?.slice(8) ?? 4);
  const humans = all.map((message, index) => ({ message, index })).filter(({ message, index }) => message.kind === 'human' && all[index - 1]?.kind === 'host').slice(0, turns).reverse();
  return humans.map(({ message, index }) => ({
    name: `${room.host_persona} · ${message.created_at.slice(5, 16)}`, host: room.host_persona, room, memory, memories, row: relationship ?? row, memberName: message.nickname,
    scenario: room.scenario ?? undefined, original: all[index - 1].text, chat: [['human', message.text]],
    messages: all.slice(index, index + 24).map(item => ({ ...item, user_id: item.kind === 'human' ? 'user-1' : null })),
  }));
}

async function capture(scene) {
  let reply;
  analyzerMs = undefined;
  const memberName = scene.memberName ?? (scene.host ? '지수' : '나');
  const messages = scene.messages ?? scene.chat.map(([kind, text], index) => ({ id: 100 - index, user_id: kind === 'human' ? 'user-1' : null, nickname: kind === 'human' ? memberName : scene.host === 'guide' ? '한지오' : '선우령', kind, text, created_at: new Date().toISOString() }));
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  Object.assign(process.env, { OPENAI_API_KEY: 'test-key', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'test-anon', APP_ORIGIN: 'https://app.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  globalThis.fetch = async (url, init) => {
    if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('lounge_member_personas?')) return result(scene.persona ? [{ id: 'p1', is_default: true, ...scene.persona }] : []);
    if (url.includes('voice_lounge_memories?')) return result(scene.memories ?? []);
    if (url.includes('voice_lounge_relationships?')) return result([scene.row ?? row]);
    if (url.includes('voice_lounge_rooms?host_id=')) return result([]);
    if (url.includes('score_voice_lounge_memories')) return result([]);
    if (url.includes('voice_lounge_rooms?') && scene.room) return result([{ ...scene.room, memory: scene.memory, voice_on: false, space_id: null }]);
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: ('scenario' in scene ? scene.scenario?.title ?? '저녁 대화' : scenario.title), host_persona: scene.host ?? 'velvet', memory: scene.memory, capacity: 1, ai_turns: 12, ai_mood: { curiosity: 60, boredom: 10 }, voice_on: false, space_id: null, scenario: 'scenario' in scene ? scene.scenario : scenario, story_state: scene.state ?? null }]);
    if (url.includes('voice_lounge_messages?')) return result(messages);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: memberName, last_seen: '' }]);
    if (url.endsWith('/embeddings') || url.includes('lounge_character_knowledge')) return result({ data: [] });
    if (url.endsWith('/responses') && JSON.parse(init.body).text?.format?.name === 'lounge_after_reply') return modelAnswer({ memory: scene.memory, events: [], memory_ops: [], story_checkpoints: [], story_facts: [], story_choice: '' });
    // The analyzer (a one-to-one chat, engine v4) is really asked, so the reply request carries its reading and the turn.
    // The director (a fast-model chat) is really asked too; its time is counted with the analyzer's, as they run together.
    if (url.endsWith('/responses') && JSON.parse(init.body).text?.format?.name === 'lounge_director') return originalFetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${realKey}` } });
    if (url.endsWith('/responses') && JSON.parse(init.body).text?.format?.name === 'lounge_analyzer') {
      if (saved.SAVE_ANALYZER) writeFileSync(`${saved.SAVE_ANALYZER}-${scene.name.replace(/[^\w가-힣]+/g, '_')}.json`, init.body);
      const started = performance.now();
      const answer = await originalFetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${realKey}` } });
      analyzerMs = Math.round(performance.now() - started);
      return answer;
    }
    if (url.endsWith('/responses')) { reply = JSON.parse(init.body); return modelAnswer({ text: '(고개를 든다)\n네.', inner_voice: '' }); }
    return result(true);
  };
  try {
    const request = new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer example', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId, reason: scene.reason ?? 'followup', stream: true }) });
    await (await handler(request)).text();
  } finally { globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
  if (!reply) throw new Error(`no reply request captured for ${scene.name}`);
  return reply;
}

async function ask(request, model, effort) {
  const body = { ...request, model, reasoning: { effort }, store: false };
  // The cache key is kept: without it the same instructions often missed the cache in these runs and were written again.
  delete body.stream;
  body.max_output_tokens = Math.max(body.max_output_tokens, effort === 'none' ? 1400 : 4000);
  const started = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${realKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  const ms = Math.round(performance.now() - started);
  if (!response.ok) return { model, effort, error: (json.error?.message ?? response.status).toString().slice(0, 160), ms };
  const out = json.output?.flatMap(item => item.content ?? []).find(part => part.type === 'output_text')?.text;
  let text = '', read, inner; try { ({ text, read, inner_voice: inner } = JSON.parse(out)); } catch { text = out ?? ''; }
  // A chat's inner voice (engine v4) is shown below the reply, as the page shows it.
  if (inner) text = `${text}\n[속마음] ${inner}`;
  return { model, effort, ms, text, ...(read ? { read } : {}), inTokens: json.usage?.input_tokens, outTokens: json.usage?.output_tokens, cached: json.usage?.input_tokens_details?.cached_tokens, reasoningTokens: json.usage?.output_tokens_details?.reasoning_tokens };
}

const args = process.argv.slice(2), only = args.find(arg => arg.startsWith('--only='))?.slice(7), withPersona = args.includes('--persona'), withFlorence = args.includes('--florence'), withDaily = args.includes('--daily'), withBibles = args.includes('--bibles'), withAb = args.includes('--ab');
const kissArg = args.find(arg => arg === '--kiss' || arg.startsWith('--kiss=')), withKiss = Boolean(kissArg), kissHost = kissArg?.split('=')[1] ?? 'diplomat';
const [outPath = 'model-compare.json', ...picked] = args.filter(arg => !arg.startsWith('--'));
const targets = (picked.length ? picked : ['gpt-6-luna:none', 'gpt-6-sol:none', 'gpt-6.1-sol:none', 'gpt-6.1-terra:none']).map(item => { const [model, effort = 'none'] = item.split(':'); return { model, effort }; });
const report = [];
const roomArg = args.find(arg => arg.startsWith('--room='))?.slice(7), lastPrompt = new Map(), dryRows = [];
for (const scene of roomArg ? await roomScenes(roomArg) : withPersona ? [personaScene] : withKiss ? [await kissScene(kissHost)] : withAb ? [...florenceScenes, ...dailyScenes, ...bibleScenes.filter(scene => scene.name.endsWith(' 2'))] : withBibles ? bibleScenes : withFlorence || withDaily ? (withDaily ? dailyScenes : florenceScenes).filter(scene => !only || scene.name.includes(only)) : scenes) {
  // The summary is rewritten after every reply, so a dry run changes its start each turn as a real room would.
  if (args.includes('--dry') && scene.room) scene.memory = `${dryRows.length}턴 뒤 요약. ${scene.memory}`;
  const request = await capture(scene);
  if (scene === scenes[0]) console.log('speech_level the request asks for:', JSON.parse(request.input).relationship?.speech_level);
  // --dry builds the requests without asking any model (2026-11-01): how much of each prompt is the same as the last one
  // to the same character, which is what the provider's cache can reuse; the rest is written to the cache again.
  if (args.includes('--dry')) {
    const prompt = `${request.instructions}\n${request.input}`, last = lastPrompt.get(scene.host ?? 'velvet');
    let same = 0; if (last) while (same < prompt.length && prompt[same] === last[same]) same++;
    lastPrompt.set(scene.host ?? 'velvet', prompt);
    const dump = args.find(arg => arg.startsWith('--dump='))?.slice(7); if (dump && !dryRows.length) writeFileSync(dump, `${request.instructions}

=== INPUT ===
${JSON.stringify(JSON.parse(request.input), null, 1)}`);
    dryRows.push({ scene: scene.name, instructions: request.instructions.length, input: request.input.length, same: last ? same : null });
    continue;
  }
  const runs = await Promise.all(targets.map(target => ask(request, target.model, target.effort)));
  const said = scene.chat[0]?.[1] ?? '(첫 인사)';
  report.push({ scene: scene.name, host: scene.host ?? 'velvet', user: said, chat: scene.chat, memory: scene.memory, ...(scene.original ? { original: scene.original } : {}), runs });
  console.log(`\n=== ${scene.name}\n나: ${said}${scene.original ? `\n(원래 답) ${scene.original.replace(/\n+/g, ' ')}` : ''}`);
  const { reading, turn, direction } = JSON.parse(request.input);
  if (analyzerMs !== undefined) console.log(`(analyzer ${analyzerMs}ms) ${reading ? JSON.stringify(reading) : 'no reading'}${turn ? ` turn ${JSON.stringify({ progress: turn.progress, event: turn.event?.content, stage: turn.stage })}` : ''}`);
  if (direction) console.log(`(director) ${JSON.stringify(direction)}`);
  for (const run of runs) console.log(`\n[${run.model}:${run.effort}] ${run.ms}ms in ${run.inTokens ?? '-'} (cached ${run.cached ?? '-'}) out ${run.outTokens ?? '-'}${run.reasoningTokens ? ` (reasoning ${run.reasoningTokens})` : ''}${run.read ? `\n(read) ${run.read}` : ''}\n${run.error ? `ERROR ${run.error}` : run.text}`);
}
if (dryRows.length) {
  for (const row of dryRows) console.log(`${row.scene.padEnd(24)} instructions ${row.instructions} input ${row.input} | same as the last prompt: ${row.same ?? '-'} chars${row.same === null ? '' : ` (${Math.round(row.same / (row.instructions + row.input + 1) * 100)}%)`}`);
  const later = dryRows.filter(row => row.same !== null);
  console.log(`average reusable ${Math.round(later.reduce((sum, row) => sum + row.same / (row.instructions + row.input + 1), 0) / later.length * 100)}% of ${Math.round(later.reduce((sum, row) => sum + row.instructions + row.input, 0) / later.length)} chars`);
}
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nsaved ${outPath}`);
