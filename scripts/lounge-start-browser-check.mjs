// Exercise the real room component in React StrictMode with local audio/API mocks.
// This never creates Supabase rooms or sends paid model requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/LoungePage.tsx', import.meta.url), 'utf8') + '\nexport { LoungeRoomPage };', { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const portraitCode = ts.transpileModule(readFileSync(new URL('../src/components/LoungeHostPortrait.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const loungeCode = ts.transpileModule(readFileSync(new URL('../src/lib/lounge.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
const sessionCode = ts.transpileModule(readFileSync(new URL('../src/lib/loungeSession.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
const targets = await (await fetch(`http://127.0.0.1:${process.env.LOUNGE_CDP_PORT || 9243}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('5191'));
assert.ok(target, 'Open the lounge on port 5191 in a CDP browser');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const task = pending.get(message.id); pending.delete(message.id);
  if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
});
const send = (method, params) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
try {
  const response = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default || reactModule;
    const jsxModule = await import('/node_modules/.vite/deps/react_jsx-runtime.js'); const JSX = jsxModule.default || jsxModule;
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js'); const { createRoot } = domModule.default || domModule;
    const lounge = {}; new Function('exports', ${JSON.stringify(loungeCode)})(lounge);
    const session = {}; new Function('exports', ${JSON.stringify(sessionCode)})(session);
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async check => { for (let i = 0; i < 100; i++) { if (check()) return; await wait(25); } throw new Error('Timed out in auto-start fixture'); };
    const results = [];
    for (const scenario of ['normal', 'blocked', 'denied', 'connection-failure', 'ended', 'group', 'study', 'study-billing']) {
      const calls = { connect: 0, mic: 0, start: 0 };
      let preparationCalls = 0, hostCalls = 0;
      const studying = scenario.startsWith('study');
      const brief = { title: '영화 자료', confidence: 'verified', overview: '스포일러 없는 소개', facts: ['확인된 작품 정보'], angles: ['해석 관점'], questions: ['첫 인상은 어땠나요?'], clarification: '', sources: [{title:'공식 소개',url:'https://film.test/'}] };
      let state = { id: 'test-room', host_id: 'me', host_persona: 'ina', topic: 'Movie talk', study_required: studying, topic_study: null, capacity: scenario === 'group' ? 4 : 1, status: scenario === 'ended' ? 'ended' : 'lobby', ai_turns: 1, last_ai_at: new Date().toISOString(), created_at: new Date().toISOString(), started_at: null, expires_at: null };
      const api = {
        LoungeApiError: class extends Error { constructor(message) { super(message); this.retryable = false; this.retryAfterSeconds = 60; } },
        joinLounge: async () => {},
        loadLounge: async () => ({ room: { ...state }, members: [{ user_id: 'me', nickname: 'Me' }], messages: [{ id: 1, kind: 'host', text: 'Hello', created_at: state.last_ai_at }] }),
        controlLounge: async (id, action) => { if (action === 'start') { calls.start++; state = { ...state, status: 'active', started_at: new Date().toISOString() }; } },
        prepareLoungeTopic: async () => {
          preparationCalls++; await wait(150);
          if (scenario === 'study-billing') throw new api.LoungeApiError('크레딧을 확인해 주세요.');
          state = { ...state, topic_study: brief }; return { study: brief };
        },
        requestLoungeHost: async () => { hostCalls++; if (studying && !state.topic_study) throw new Error('Host ran before research'); return { skipped: true }; },
      };
      const useAudio = () => {
        const [audio, setAudio] = React.useState({ connected: false, connecting: false, audioReady: false, micOn: false, error: '' });
        const connect = React.useCallback(async () => {
          calls.connect++;
          if (scenario === 'connection-failure' && calls.connect === 1) { setAudio(previous => ({ ...previous, error: 'Connection failed' })); return; }
          setAudio(previous => ({ ...previous, connected: true, audioReady: scenario !== 'blocked' }));
        }, []);
        const startMicrophone = React.useCallback(async () => { calls.mic++; setAudio(previous => ({ ...previous, micOn: scenario !== 'denied', error: scenario === 'denied' ? 'Microphone permission denied' : '' })); }, []);
        const enableAudio = React.useCallback(() => setAudio(previous => ({ ...previous, audioReady: true })), []);
        const disconnect = React.useCallback(() => {}, []);
        const getSpeechActivity = React.useCallback(() => ({ lastVoiceAt: 0, recording: false }), []);
        return { ...audio, connect, startMicrophone, enableAudio, disconnect, getSpeechActivity, participants: audio.connected ? [{ id: 'me', name: 'Me', muted: !audio.micOn }] : [], speakers: [], aiSpeaking: false };
      };
      const output = {};
      const require = name => name === 'react' ? React : name === 'react/jsx-runtime' ? JSX : name === 'lucide-react' ? new Proxy({}, { get: () => () => null }) : name === 'react-router-dom' ? { Link: props => React.createElement('a', props, props.children), useNavigate: () => () => {} } : name === './LoungeHostPortrait' ? portrait : name === '../lib/lounge' ? lounge : name === '../lib/loungeSession' ? session : name === '../lib/loungeApi' ? api : name === '../lib/useLoungeAudio' ? { useLoungeAudio: useAudio } : {};
      const portrait = {}; new Function('exports','require', ${JSON.stringify(portraitCode)})(portrait, require);
      new Function('exports', 'require', ${JSON.stringify(compiled)})(output, require);
      const container = document.createElement('div'); document.body.appendChild(container);
      const root = createRoot(container);
      root.render(React.createElement(React.StrictMode, null, React.createElement(output.LoungeRoomPage, { roomId: 'test-room', user: { id: 'me', nickname: 'Me' }, onGuestRequest: async () => {}, onLoginRequest: () => {} })));
      await until(() => container.querySelector('.lounge-room-main'));
      if (scenario === 'ended') { await wait(150); }
      else if (scenario === 'blocked') {
        await until(() => calls.mic === 1);
        if (calls.start !== 0) throw new Error('Started before playback permission');
        container.querySelector('.lounge-room-top-actions .lounge-connect-button').click();
        await until(() => calls.start === 1 && container.querySelector('.lounge-mic-button'));
      } else if (scenario === 'connection-failure') {
        await until(() => calls.connect === 1);
        await wait(150);
        if (calls.connect !== 1) throw new Error('Automatic connect retry loop');
        container.querySelector('.lounge-room-top-actions .lounge-connect-button').click();
        await until(() => calls.start === 1 && container.querySelector('.lounge-mic-button'));
      } else if (scenario === 'group') {
        await until(() => calls.mic === 1); await wait(100);
        if (!container.querySelector('.lounge-room-top-actions .lounge-start-button')) throw new Error('Group start button missing from header');
        if (!container.querySelector('.lounge-session-waiting .lounge-session-actions button:disabled')) throw new Error('Pre-session hand control missing');
        if (container.querySelector('.lounge-room-controls .lounge-start-button,.lounge-room-controls .lounge-connect-button')) throw new Error('Connection/start duplicated in dock');
      }
      else { await until(() => calls.start === 1 && container.querySelector('.lounge-mic-button')); }
      if (studying) {
        container.querySelector('.lounge-ask-button').click();
        await until(() => container.textContent.includes('주제 자료를 찾아보고'));
        if (scenario === 'study') {
          await until(() => container.querySelector('.lounge-study-notes'));
          container.querySelector('.lounge-study-notes summary').click();
          const source = container.querySelector('.lounge-study-notes a');
          if (source?.href !== 'https://film.test/' || source.target !== '_blank') throw new Error('Missing clickable study source');
          await until(() => hostCalls === 1);
        } else {
          await until(() => container.querySelector('.lounge-error')?.textContent.includes('크레딧'));
          if (hostCalls !== 0) throw new Error('Generated host speech after failed research');
        }
        if (preparationCalls !== 1) throw new Error('Duplicate preparation');
      }
      if (state.capacity === 1 && container.querySelector('.lounge-start-button')) throw new Error('Extra solo start button');
      results.push({ scenario, ...calls, status: state.status });
      root.unmount(); container.remove();
    }
    return results;
  })()` });
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  assert.deepEqual(response.result.value, [
    { scenario: 'normal', connect: 1, mic: 1, start: 1, status: 'active' },
    { scenario: 'blocked', connect: 1, mic: 1, start: 1, status: 'active' },
    { scenario: 'denied', connect: 1, mic: 1, start: 1, status: 'active' },
    { scenario: 'connection-failure', connect: 2, mic: 1, start: 1, status: 'active' },
    { scenario: 'ended', connect: 0, mic: 0, start: 0, status: 'ended' },
    { scenario: 'group', connect: 1, mic: 1, start: 0, status: 'lobby' },
    { scenario: 'study', connect: 1, mic: 1, start: 1, status: 'active' },
    { scenario: 'study-billing', connect: 1, mic: 1, start: 1, status: 'active' },
  ]);
  console.log('PASS: StrictMode audio/start flows, topic preparation before host requests, visible research progress and source links, and research billing failure.');
} finally { socket.close(); }
