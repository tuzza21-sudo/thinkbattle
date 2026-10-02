// Local fixtures exercise real components/hooks without microphones or paid APIs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const code = { page: compile('../src/components/LoungePage.tsx') + '\nexports.TestRoom = LoungeRoomPage;', panel: compile('../src/components/LoungeSessionPanel.tsx'), session: compile('../src/lib/loungeSession.ts'), lounge: compile('../src/lib/lounge.ts'), audio: compile('../src/lib/useLoungeAudio.ts') };
const targets = await (await fetch(`http://127.0.0.1:${process.env.LOUNGE_CDP_PORT || 9258}/json`)).json();
const socket = new WebSocket(targets.find(t => t.type === 'page' && t.url.includes('5191')).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (!m.id) return; const task = pending.get(m.id); pending.delete(m.id); if (m.error) task.reject(new Error(JSON.stringify(m.error))); else task.resolve(m.result); });
const send = (method, params) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
try {
  const response = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js'), React = ReactModule.default || ReactModule;
    const JSXModule = await import('/node_modules/.vite/deps/react_jsx-runtime.js'), JSX = JSXModule.default || JSXModule;
    const DOM = await import('/node_modules/.vite/deps/react-dom_client.js'), {createRoot} = DOM.default || DOM;
    const code = ${JSON.stringify(code)};
    const evaluate = (source, require = () => ({})) => { const output = {}; new Function('exports','require',source)(output,require); return output; };
    const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
    const until = async check => { for(let i=0;i<160;i++) { if(check()) return; await wait(25); } throw new Error('Timed out in group session fixture'); };
    const check = (ok,message) => { if(!ok) throw new Error(message); };
    const sessionLib = evaluate(code.session), lounge = evaluate(code.lounge);
    const reactRequire = name => name==='react' ? React : name==='react/jsx-runtime' ? JSX : name==='lucide-react' ? new Proxy({}, {get:()=>()=>null}) : name==='../lib/loungeSession' ? sessionLib : {};
    const panel = evaluate(code.panel,reactRequire);
    const now = new Date().toISOString();
    let session = { room_id:'fixture',stage:0,state:'ready',speaker_id:'me',turn_id:'turn-a',turn_kind:'basic',round_order:['me','peer-a','peer-b'],completed:[],hand_queue:[],started_at:now,stage_started_at:now,turn_started_at:null,spoken_seconds:0,nudged:false,announced_turn:'turn-a',updated_at:now };
    const room = {id:'fixture',host_id:'me',host_persona:'ina',topic:'영화 호프',capacity:3,status:'active',guided_session:true,created_at:now,started_at:now,expires_at:new Date(Date.now()+3600000).toISOString(),ai_turns:1,last_ai_at:now};
    let floor, sequence=0;
    const api = {
      LoungeApiError: class extends Error {}, joinLounge:async()=>{}, controlLounge:async()=>{},
      loadLounge:async()=>({room:{...room},session:{...session},members:session.round_order.map(id=>({user_id:id,nickname:id==='me'?'나':id})),messages:[]}),
      requestLoungeHost:async()=>({skipped:true}),
      controlLoungeSession:async(id,action,turn)=> {
        if(['begin','done','pass','yield'].includes(action)) check(turn===session.turn_id,'Action used a stale turn');
        session={...session,completed:[...session.completed],hand_queue:[...session.hand_queue]};
        if(action==='raise'&&!session.hand_queue.includes('me')) session.hand_queue.push('me');
        if(action==='lower') session.hand_queue=session.hand_queue.filter(id=>id!=='me');
        if(action==='begin') session.state='speaking';
        if(['done','pass','yield'].includes(action)) {
          if(session.turn_kind==='basic') session.completed.push(session.speaker_id);
          if(action==='pass') session.hand_queue=session.hand_queue.filter(id=>id!=='me');
          session.speaker_id=session.round_order.find(id=>!session.completed.includes(id))||null;
          session.turn_kind='basic';
          if(!session.speaker_id&&session.hand_queue.length) {session.speaker_id=session.hand_queue.shift();session.turn_kind='extra';}
          session.state=session.speaker_id?'ready':'between';session.turn_id='turn-'+(++sequence);session.announced_turn=session.turn_id;session.nudged=false;
        }
        if(action==='next_stage') {session.stage++;session.completed=[];session.speaker_id='me';session.state='ready';session.turn_id='turn-'+(++sequence);session.announced_turn=session.turn_id;}
        return {...session};
      },
    };
    const useAudio = (id,owner,callback,capacity,value) => {
      floor=value;
      const [ready,setReady]=React.useState(false),[mic,setMic]=React.useState(false);
      const connect=React.useCallback(async()=>setReady(true),[]),startMicrophone=React.useCallback(async()=>setMic(true),[]);
      const disconnect=React.useCallback(()=>{},[]),getSpeechActivity=React.useCallback(()=>({lastVoiceAt:0,recording:false,voicedMs:0}),[]);
      return {connected:ready,connecting:false,audioReady:ready,micOn:mic,connect,startMicrophone,disconnect,getSpeechActivity,speakers:[],aiSpeaking:false,participants:ready?session.round_order.map(id=>({id,name:id,muted:true})):[]};
    };
    const page = evaluate(code.page,name=>name==='../lib/lounge'?lounge:name==='../lib/loungeApi'?api:name==='../lib/useLoungeAudio'?{useLoungeAudio:useAudio}:name==='./LoungeSessionPanel'?panel:name==='react-router-dom'?{Link:props=>React.createElement('a',props,props.children),useNavigate:()=>()=>{}}:reactRequire(name));
    const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
    root.render(React.createElement(React.StrictMode,null,React.createElement(page.TestRoom,{roomId:'fixture',user:{id:'me',nickname:'나'},onGuestRequest:async()=>{},onLoginRequest:()=>{}})));
    await until(()=>container.querySelector('.lounge-session-panel'));
    check(container.textContent.includes('참여한 이유'),'Introduction omitted participation reason');
    check(container.textContent.includes('얻고 싶은'),'Introduction omitted participant goals');
    check(floor.allowed===false,'Waiting microphone was open');
    const click = text => {const button=[...container.querySelectorAll('.lounge-session-actions button')].find(b=>b.textContent.includes(text));check(button&&!button.disabled,'Missing or disabled button: '+text);button.click();};
    click('말하기');await until(()=>floor.allowed===true);check(floor.turnId===session.turn_id,'Microphone lacked a turn identifier');
    session={...session,nudged:true,spoken_seconds:121};await until(()=>container.querySelector('.lounge-session-nudge'));
    click('추가로 이야기');await until(()=>container.querySelector('[aria-pressed=true]'));
    click('이야기 마쳤어요');await until(()=>session.speaker_id==='peer-a'&&floor.allowed===false);
    check(container.querySelector('.lounge-session-queues').textContent.includes('추가 이야기 대기'),'Hand was missing from additional queue');
    click('다음 분께');await until(()=>session.speaker_id==='peer-b');await wait(50);
    click('다음 분께');await until(()=>session.speaker_id==='me'&&session.turn_kind==='extra');await wait(50);
    click('이번에는 패스');await until(()=>session.state==='between');await wait(50);
    click('다음 이야기로');await until(()=>container.querySelector('.lounge-session-question').textContent.includes('첫인상'));
    root.unmount();container.remove();

    // The actual audio hook is tested with synthetic tracks and recorder events.
    const native = {AudioContext:globalThis.AudioContext,MediaRecorder:globalThis.MediaRecorder,fetch:globalThis.fetch};
    const sourceContext=new native.AudioContext(),mediaTrack=sourceContext.createMediaStreamDestination().stream.getAudioTracks()[0];
    const tracks=[];let liveRoom,hook;
    class FakeAudioContext {state='running';sampleRate=24000;resume=async()=>{};close=async()=>{};createMediaStreamSource(){return {connect(){},disconnect(){}};} createAnalyser(){return {fftSize:1024,disconnect(){},getFloatTimeDomainData(values){values.fill(.1);}};} }
    class FakeRecorder {static isTypeSupported(){return true;} state='inactive';mimeType='audio/webm'; start(){this.state='recording';} stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['x'.repeat(400)])});this.onstop?.();} }
    class FakeTrack {mediaStreamTrack=mediaTrack;muted=false;muteCalls=0;unmuteCalls=0;async mute(){this.muted=true;this.muteCalls++;}async unmute(){this.muted=false;this.unmuteCalls++;}stop(){} }
    class FakeRoom {
      remoteParticipants=new Map();handlers={};localParticipant={identity:'me',name:'Me',isMicrophoneEnabled:true,metadata:'{}',publishTrack:async()=>{},unpublishTrack:async()=>{},setMetadata:async()=>{}};
      constructor(){liveRoom=this;} on(name,callback){(this.handlers[name]||=[]).push(callback);}emit(name,...args){for(const cb of this.handlers[name]||[])cb(...args);}async connect(){}async disconnect(){}async startAudio(){}
    }
    const events=new Proxy({},{get:(_,name)=>name});
    const client={Room:FakeRoom,RoomEvent:events,Track:{Kind:{Audio:'audio'},Source:{Microphone:'microphone',Unknown:'unknown'}},LocalAudioTrack:FakeTrack,createLocalAudioTrack:async()=>{const track=new FakeTrack();tracks.push(track);return track;}};
    const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:null})})})})};
    const captions=[];
    try {
      globalThis.AudioContext=FakeAudioContext;globalThis.MediaRecorder=FakeRecorder;globalThis.fetch=async()=>new Response(JSON.stringify({url:'wss://mock',token:'test'}));
      const audioModule=evaluate(code.audio,name=>name==='react'?React:name==='livekit-client'?client:name==='./supabase'?{supabase}:name==='./lounge'?lounge:name==='./loungeAvatar'?{loadLoungeAvatar:async()=>({}),safeLoungeAvatarUrl:()=>undefined}:name==='./loungeApi'?api:{});
      const audioContainer=document.createElement('div');document.body.append(audioContainer);const audioRoot=createRoot(audioContainer);
      function AudioFixture({allowed,speakerId,turnId}) {hook=audioModule.useLoungeAudio('fixture','host',async(blob,turn)=>captions.push(turn),3,{allowed,speakerId,turnId});return null;}
      audioRoot.render(React.createElement(AudioFixture,{allowed:false,speakerId:null,turnId:'turn-a'}));await until(()=>hook);await hook.connect();await until(()=>hook.connected);await hook.startMicrophone();await until(()=>hook.micOn);
      check(tracks[0].muted,'Actual waiting microphone was not muted');
      const remote={kind:'audio',attach:()=>document.createElement('audio'),detach:()=>[]};
      liveRoom.emit('TrackSubscribed',remote,{source:'microphone'},{identity:'peer'});
      const remoteElement=[...document.querySelectorAll('audio')].at(-1);check(remoteElement.muted,'Off-turn remote microphone was audible');
      audioRoot.render(React.createElement(AudioFixture,{allowed:true,speakerId:'me',turnId:'turn-a'}));await until(()=>!tracks[0].muted);await wait(400);
      check(hook.getSpeechActivity().voicedMs>0,'Actual speech activity was not measured');
      audioRoot.render(React.createElement(AudioFixture,{allowed:false,speakerId:'peer',turnId:'turn-b'}));await until(()=>tracks[0].muted&&captions.length>0);
      check(captions[0]==='turn-a','Delayed recorder attached to the wrong turn');check(!remoteElement.muted,'Current remote speaker was blocked');
      audioRoot.unmount();audioContainer.remove();
    } finally {globalThis.AudioContext=native.AudioContext;globalThis.MediaRecorder=native.MediaRecorder;globalThis.fetch=native.fetch;await sourceContext.close();}
    return {ui:true,microphones:true,lateCapture:true};
  })()` });
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  assert.deepEqual(response.result.value, {ui:true,microphones:true,lateCapture:true});
  console.log('PASS: guided introduction/goals, hands, passes, rotated stage UI, gentle warning, microphone floor gating, remote speaker protection and captured-turn attribution.');
} finally {socket.close();}
