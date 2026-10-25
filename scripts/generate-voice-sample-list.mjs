// One short sample of every OpenAI and Gemini voice, read plainly (no character instruction) so the timbres can be
// compared, written to docs/voice-samples with an index.html that lists them by gender (men first).
// Existing files are reused unless --overwrite is given.
import dotenv from 'dotenv';
import ts from 'typescript';
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;
if (!OPENAI_API_KEY || !GEMINI_API_KEY) throw new Error('Configure OPENAI_API_KEY and GEMINI_API_KEY before generating voice samples.');
const text = '안녕하세요. 오늘 하루는 어땠어요? 천천히 이야기해 주세요. 저는 여기서 끝까지 들을게요.';
const geminiModel = 'gemini-3.1-flash-tts-preview', openAiModel = 'gpt-4o-mini-tts';
const voices = {
  openai: {
    male: ['alloy', 'ash', 'ballad', 'echo', 'fable', 'onyx', 'verse', 'cedar'],
    female: ['coral', 'nova', 'sage', 'shimmer', 'marin'],
  },
  gemini: {
    male: ['Puck', 'Charon', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Algenib', 'Rasalgethi', 'Alnilam', 'Schedar', 'Achird', 'Zubenelgenubi', 'Sadachbia', 'Sadaltager'],
    female: ['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'],
  },
};
// Voices the characters speak with today (src/lib/lounge.ts), shown beside the sample.
const inUse = {
  openai: { onyx: '영화감독 · 탐정', marin: '심층 인터뷰어', echo: '반도체 엔지니어', ash: '협상가', sage: '선우령(OpenAI 대체 음성)', fable: '토크쇼 진행자', nova: '기자' },
  gemini: { Charon: '영화감독', Vindemiatrix: '심층 인터뷰어', Umbriel: '반도체 엔지니어', Orus: '협상가', Sulafat: '선우령', Puck: '토크쇼 진행자', Despina: '윤지안', Algenib: '탐정' },
};
const dir = new URL('../docs/voice-samples/', import.meta.url);
await mkdir(new URL('openai/', dir), { recursive: true }); await mkdir(new URL('gemini/', dir), { recursive: true });
const exists = file => access(file).then(() => true, () => false);
const wav = (pcm, rate) => {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
};
async function openAi(voice) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: openAiModel, voice, input: text, response_format: 'mp3' }), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`OpenAI ${voice}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function gemini(voice) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Read only the following Korean dialogue exactly as written, in a natural, warm tone.\n\n${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }), signal: AbortSignal.timeout(90_000),
  });
  const part = (await response.json().catch(() => null))?.candidates?.[0]?.content?.parts?.find(item => item.inlineData?.data)?.inlineData;
  if (!response.ok || !part) throw new Error(`Gemini ${voice}: HTTP ${response.status}`);
  return wav(Buffer.from(part.data, 'base64'), Number(part.mimeType?.match(/rate=(\d+)/i)?.[1]) || 24_000);
}
const rows = [];
for (const engine of ['openai', 'gemini']) for (const gender of ['male', 'female']) for (const voice of voices[engine][gender]) {
  const name = `${engine}/${voice}.${engine === 'openai' ? 'mp3' : 'wav'}`, file = new URL(name, dir);
  if (process.argv.includes('--overwrite') || !await exists(file)) {
    try { await writeFile(file, await (engine === 'openai' ? openAi(voice) : gemini(voice))); console.log('Saved', name); }
    catch (error) { console.warn('Skipped', name, error.message); continue; }
  } else console.log('Reused', name);
  rows.push({ engine, gender, voice, name, use: inUse[engine][voice] ?? '' });
}
// ElevenLabs: the library voices the characters speak with (loungeEngineVoices.eleven), named from the API.
const source = await readFile(new URL('../src/lib/lounge.ts', import.meta.url), 'utf8');
const lounge = {}; new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText)(lounge);
const hostNames = Object.fromEntries(lounge.loungeHosts.map(host => [host.id, host.name]));
const { ELEVENLABS_API_KEY } = process.env;
if (ELEVENLABS_API_KEY) {
  await mkdir(new URL('elevenlabs/', dir), { recursive: true });
  for (const [owner, id] of Object.entries(lounge.loungeEngineVoices.eleven)) {
    const headers = { 'xi-api-key': ELEVENLABS_API_KEY };
    const info = await fetch(`https://api.elevenlabs.io/v1/voices/${id}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
    const name = `elevenlabs/${id}.mp3`, file = new URL(name, dir);
    if (process.argv.includes('--overwrite') || !await exists(file)) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_64`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: lounge.loungeElevenModel, language_code: 'ko', voice_settings: { stability: 0.45, similarity_boost: 0.8 } }) });
      if (!response.ok) { console.warn('Skipped', name, response.status); continue; }
      await writeFile(file, Buffer.from(await response.arrayBuffer())); console.log('Saved', name);
    } else console.log('Reused', name);
    const gender = info?.labels?.gender === 'male' ? 'male' : 'female';
    rows.push({ engine: 'elevenlabs', gender, voice: info?.name ?? id, id, name, use: owner === 'female' || owner === 'male' ? '기본 여성/남성 목소리(캐릭터 전용 목소리가 없을 때)' : hostNames[owner] ?? owner });
  }
} else console.warn('No ELEVENLABS_API_KEY: ElevenLabs samples skipped.');
const section = (title, list) => list.length ? `<h3>${title}</h3><div class="grid">${list.map(row => `<div class="card"><b>${row.voice}</b>${row.id ? `<code>${row.id}</code>` : ''}${row.use ? `<small>${row.use}</small>` : ''}<audio controls preload="none" src="${row.name}"></audio></div>`).join('')}</div>` : '';
const block = (label, engine) => `<h2>${label}</h2>${section('남자 목소리', rows.filter(row => row.engine === engine && row.gender === 'male'))}${section('여자 목소리', rows.filter(row => row.engine === engine && row.gender === 'female'))}`;
await writeFile(new URL('index.html', dir), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>음성 샘플 목록</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;background:#14161a;color:#e9e9ee}h2{margin-top:36px;border-bottom:1px solid #333;padding-bottom:6px}h3{margin:20px 0 8px;color:#bcc}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.card{background:#1d2026;border-radius:10px;padding:10px 12px}.card b{display:block}.card small{display:block;color:#e8b98a}.card code{display:block;font-size:12px;color:#8aa;user-select:all}audio{width:100%;margin-top:6px}p{color:#aab}</style>
<h1>음성 샘플 목록</h1><p>같은 문장: “${text}”<br>OpenAI ${openAiModel} · Gemini ${geminiModel} · 캐릭터 지시 없이 기본 음색으로 읽은 샘플입니다. 주황색 글씨는 지금 캐릭터가 쓰는 목소리예요(기본은 ElevenLabs → Gemini → OpenAI 순서).</p>
${block('OpenAI', 'openai')}${block('Google Gemini', 'gemini')}${block('ElevenLabs (구독 API)', 'elevenlabs')}</html>`);
console.log('Wrote docs/voice-samples/index.html');
