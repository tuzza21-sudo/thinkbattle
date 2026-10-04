// Local fixtures exercise real components/hooks without microphones or paid APIs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { filmStudyFixture } from './lounge-film-fixtures.mjs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const code = { interaction: compile('../src/lib/loungeInteraction.ts'), portrait: compile('../src/components/LoungeHostPortrait.tsx'), page: compile('../src/components/LoungePage.tsx') + '\nexports.TestRoom = LoungeRoomPage; exports.TestRoomView = RoomView; exports.TestLobby = LoungeLobby;', panel: compile('../src/components/LoungeSessionPanel.tsx'), session: compile('../src/lib/loungeSession.ts'), lounge: compile('../src/lib/lounge.ts'), audio: compile('../src/lib/useLoungeAudio.ts'), transcription: compile('../src/lib/loungeTranscription.ts'), stream: compile('../src/lib/loungeStream.ts'), audioApi: compile('../src/lib/loungeApi.ts') };
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
    const filmStudy = ${JSON.stringify(filmStudyFixture)};
    const evaluate = (source, require = () => ({})) => { const output = {}; new Function('exports','require',source)(output,require); return output; };
    const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
    const until = async check => { for(let i=0;i<160;i++) { if(check()) return; await wait(25); } throw new Error('Timed out in group session fixture'); };
    const check = (ok,message) => { if(!ok) throw new Error(message); };
    const sessionLib = evaluate(code.session), lounge = evaluate(code.lounge), interaction = evaluate(code.interaction);
    const reactRequire = name => name==='react' ? React : name==='react/jsx-runtime' ? JSX : name==='lucide-react' ? new Proxy({}, {get:()=>()=>null}) : name==='../lib/loungeInteraction' ? interaction : name==='../lib/loungeSession' ? sessionLib : name==='../lib/lounge' ? lounge : {};
    const panel = evaluate(code.panel,reactRequire);
    const portrait = evaluate(code.portrait,reactRequire);
    const now = new Date().toISOString();
    let session = { room_id:'fixture',stage:0,state:'ready',speaker_id:'me',turn_id:'turn-a',turn_kind:'basic',round_order:['me','peer-a','peer-b'],completed:[],hand_queue:[],started_at:now,stage_started_at:now,turn_started_at:null,spoken_seconds:0,nudged:false,announced_turn:'turn-a',updated_at:now };
    const room = {id:'fixture',host_id:'me',host_persona:'ina',topic:'영화 호프',capacity:3,status:'active',guided_session:true,created_at:now,started_at:now,expires_at:new Date(Date.now()+3600000).toISOString(),ai_turns:1,last_ai_at:now};
    let messages=[{id:1,user_id:'me',nickname:'나',kind:'human',text:'저는 주인공의 선택이 마음에 남았어요.'},{id:2,user_id:'peer-a',nickname:'친구',kind:'human',text:'저는 마지막 장면의 분위기가 인상적이었어요.'},{id:3,user_id:null,nickname:'사회자',kind:'host',text:'서로 다른 첫인상을 나눠 주세요.'}];
    let floor, sequence=0, transcriptCallback, fixtureFlush=async()=>{};
    const api = {
      syncLoungeSafety:async()=>({}), reviewLoungeInteraction:async()=>({}), releaseLoungeRestriction:async()=>({}), LoungeApiError: class extends Error {}, joinLounge:async()=>{}, controlLounge:async()=>{},
      loadLounge:async()=>({room:{...room},session:{...session},members:session.round_order.map(id=>({user_id:id,nickname:id==='me'?'나':id})),messages:[...messages]}),
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
          if(!session.speaker_id&&session.hand_queue.length&&![1,2,3,4].includes(session.stage)) {session.speaker_id=session.hand_queue.shift();session.turn_kind='extra';}
          session.state=session.speaker_id?'ready':[1,2,3,4].includes(session.stage)?'free':'between';session.turn_id='turn-'+(++sequence);session.announced_turn=session.turn_id;session.nudged=false;
        }
        if(action==='next_stage') {session.stage++;session.completed=[];session.speaker_id='me';session.state='ready';session.turn_id='turn-'+(++sequence);session.announced_turn=session.turn_id;}
        return {...session};
      },
    };
    const useAudio = (id,owner,callback,capacity,value) => {
      floor=value;transcriptCallback=callback;
      const [ready,setReady]=React.useState(false),[mic,setMic]=React.useState(false);
      const connect=React.useCallback(async()=>setReady(true),[]),startMicrophone=React.useCallback(async()=>setMic(true),[]);
      const disconnect=React.useCallback(()=>{},[]),getSpeechActivity=React.useCallback(()=>({lastVoiceAt:0,recording:false,voicedMs:0}),[]);
      return {connected:ready,connecting:false,audioReady:ready,micOn:mic,connect,startMicrophone,stopMicrophone:()=>setMic(false),stopHost:()=>{},flushUtterance:()=>fixtureFlush(),disconnect,getSpeechActivity,speakers:[],aiSpeaking:false,participants:ready?session.round_order.map(id=>({id,name:id,muted:true})):[]};
    };
    let createdArgs, navigated;
    api.createLounge=async(...args)=>{createdArgs=args;return 'created-fixture';};
    const page = evaluate(code.page,name=>name==='../lib/lounge'?lounge:name==='../lib/loungeApi'?api:name==='../lib/useLoungeAudio'?{useLoungeAudio:useAudio}:name==='./LoungeHostPortrait'?portrait:name==='./LoungeSessionPanel'?panel:name==='./LoungeHostOptions'?{LoungeHostOptions:()=>null}:name==='./LoungeOpenRooms'?{LoungeOpenRooms:()=>null}:name==='react-router-dom'?{Link:props=>React.createElement('a',props,props.children),useNavigate:()=>url=>{navigated=url;}}:reactRequire(name));
    const lobbyContainer=document.createElement('div');document.body.append(lobbyContainer);const lobbyRoot=createRoot(lobbyContainer);
    lobbyRoot.render(React.createElement(page.TestLobby,{user:{id:'me',nickname:'나'},onGuestRequest:async()=>{throw new Error('An authenticated host must not request a guest account');},onLoginRequest:()=>{}}));
    await until(()=>lobbyContainer.querySelector('#lounge-topic-input'));
    check(lobbyContainer.querySelectorAll('.lounge-media-toggle button').length===2,'Media selector included TV/OTT');
    check(!lobbyContainer.textContent.includes('수다'),'Old customer-facing terminology remains');
    const change=async(selector,value)=>{const el=lobbyContainer.querySelector(selector);Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));await wait(30);};
    await change('#lounge-topic-input','서로 다르게 읽은 작품 이야기');
    check(lobbyContainer.querySelector('.lounge-primary').disabled,'Title alone bypassed the host brief');
    await change('#lounge-work-title','Nocturnal Animals');await change('#lounge-creator','Tom Ford');
    await change('#lounge-topic-reason','인물의 선택을 다르게 읽어서');await change('#lounge-topic-discussion','책임과 자유를 보는 각자의 기준을 나눠요.');
    check(!lobbyContainer.querySelector('.lounge-primary').disabled,'Complete film brief could not create a room');
    lobbyContainer.querySelector('.lounge-primary').click();await until(()=>createdArgs && navigated==='/lounge/created-fixture');
    check(createdArgs[1]==='서로 다르게 읽은 작품 이야기' && createdArgs[5].category==='media' && createdArgs[5].subcategory==='film' && createdArgs[5].creator==='Tom Ford' && createdArgs[5].reason.includes('다르게'),'Creation omitted the actual controlled form values');
    [...lobbyContainer.querySelectorAll('.lounge-media-toggle button')].find(button=>button.textContent==='책').click();await wait(30);
    check(lobbyContainer.querySelector('.lounge-primary').disabled && !lobbyContainer.querySelector('#lounge-creator').value,'Switching subtype retained a stale creator');
    await change('#lounge-work-title','데미안');await change('#lounge-creator','헤르만 헤세');
    createdArgs=null;lobbyContainer.querySelector('.lounge-primary').click();await until(()=>createdArgs);
    check(createdArgs[5].subcategory==='book' && createdArgs[5].creator==='헤르만 헤세','Book identification was not forwarded');
    for(let index=1;index<6;index++) {
      lobbyContainer.querySelectorAll('.lounge-topic-options button')[index].click();await wait(30);
      check(!lobbyContainer.querySelector('#lounge-work-title'),'Non-media categories required irrelevant work metadata');
      check(!lobbyContainer.querySelector('select'),'Non-media category still required a subtype selection');
      await change('#lounge-topic-reason','해당 분야를 이야기하고 싶은 구체적인 배경');await change('#lounge-topic-discussion','서로 다른 경험과 선택 기준을 나눠요.');
      createdArgs=null;lobbyContainer.querySelector('.lounge-primary').click();await until(()=>createdArgs);
      check(createdArgs[5].category===lounge.loungeTopics[index].id && createdArgs[5].subcategory==='general' && createdArgs[5].creator==='' && createdArgs[5].work_title==='','Non-media creation retained stale film data');
    }
    lobbyRoot.unmount();lobbyContainer.remove();
    const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
    root.render(React.createElement(React.StrictMode,null,React.createElement(page.TestRoom,{roomId:'fixture',user:{id:'me',nickname:'나'},onGuestRequest:async()=>{},onLoginRequest:()=>{}})));
    await until(()=>container.querySelector('.lounge-session-panel'));
    check(container.textContent.includes('참여한 이유'),'Introduction omitted participation reason');
    check(container.textContent.includes('얻고 싶은'),'Introduction omitted participant goals');
    check(floor.allowed===false,'Waiting microphone was open');
    check(container.querySelector('.lounge-participant-log article.self').textContent.includes('주인공의 선택'),'My speech missing from participant pane');
    check(container.querySelector('.lounge-participant-log').textContent.includes('마지막 장면'),'Other participant speech missing');
    check(!container.querySelector('.lounge-participant-log').textContent.includes('서로 다른 첫인상'),'AI speech duplicated in participant pane');
    messages.push({id:4,user_id:'peer-b',nickname:'다른 친구',kind:'human',text:'다른 분의 이야기를 듣고 다시 생각하게 됐어요.'});
    await until(()=>container.querySelector('.lounge-participant-log').textContent.includes('다시 생각하게'));
    const participantLog=container.querySelector('.lounge-participant-log');
    participantLog.style.cssText='height:80px;flex:none;overflow:auto';
    participantLog.scrollTo(0,participantLog.scrollHeight);participantLog.dispatchEvent(new Event('scroll'));
    messages.push({id:5,user_id:'peer-a',nickname:'친구',kind:'human',text:'새로운 발언을 덧붙였어요. '.repeat(20)});
    await until(()=>participantLog.textContent.includes('덧붙였어요'));
    check(participantLog.scrollHeight-participantLog.scrollTop-participantLog.clientHeight<2,'New speech did not follow the bottom of the log');
    participantLog.scrollTo(0,0);participantLog.dispatchEvent(new Event('scroll'));
    messages.push({id:6,user_id:'peer-b',nickname:'다른 친구',kind:'human',text:'지난 발언을 읽는 동안 추가된 이야기예요.'});
    await until(()=>participantLog.textContent.includes('읽는 동안'));
    check(participantLog.scrollTop===0,'New speech interrupted reading earlier messages');
    const click = text => {const button=[...container.querySelectorAll('.lounge-session-actions button')].find(b=>b.textContent.includes(text));check(button&&!button.disabled,'Missing or disabled button: '+text);button.click();};
    click('말하기');await until(()=>floor.allowed===true);check(floor.turnId===session.turn_id,'Microphone lacked a turn identifier');
    session={...session,nudged:true,spoken_seconds:121};await until(()=>container.querySelector('.lounge-session-nudge'));
    click('손들기');await until(()=>container.querySelector('[aria-label="손 내리기"]'));
    check(container.querySelector('.lounge-participant-controls .lounge-session-queue-summary').textContent.includes('손들기 대기나'),'Hand queue missing below profiles');
    click('이야기 마쳤어요');await until(()=>session.speaker_id==='peer-a'&&floor.allowed===false);
    check(container.querySelector('.lounge-session-queues').textContent.includes('추가 이야기 대기'),'Hand was missing from additional queue');
    click('다음 분께');await until(()=>session.speaker_id==='peer-b');await wait(50);
    click('다음 분께');await until(()=>session.speaker_id==='me'&&session.turn_kind==='extra');await wait(50);
    click('이번에는 패스');await until(()=>session.state==='between');await wait(50);
    click('다음 이야기로');await until(()=>container.querySelector('.lounge-session-panel h3').textContent.includes('주제의 첫인상'));
    check(container.querySelector('.lounge-session-question').textContent.includes('가장 먼저 어떤 느낌'),'First-impression question omitted the participant reaction');
    await until(()=>floor?.allowed===false);
    check(container.querySelector('.lounge-session-progress').textContent.includes('순서 발언'),'New topic did not begin with a basic round');
    check(container.querySelector('.lounge-seat.self.has-floor'),'Current participant was not highlighted in the topic round');
    click('말하기');await until(()=>floor.allowed===true);
    click('이야기 마쳤어요');await until(()=>session.speaker_id==='peer-a'&&floor.allowed===false);
    click('다음 분께');await until(()=>session.speaker_id==='peer-b');await wait(50);
    click('다음 분께');await until(()=>session.state==='free');
    await until(()=>floor===undefined);
    check(!container.querySelector('[aria-label="이야기 마쳤어요"]'),'Free conversation still required an end-speaking button');
    check(![...container.querySelectorAll('.lounge-session-actions button')].some(button=>button.textContent==='말하기'),'Free conversation still reserved a speaking turn');
    check(container.textContent.includes('AI의 답을 기다리지 않고'),'Free conversation guide missing');
    check([...container.querySelectorAll('button')].some(button=>button.textContent.includes('사회자에게 도움 요청')),'Moderator request button missing');
    check(container.querySelector('.lounge-session-progress').textContent.includes('자유 대화'),'Free phase was not identified');
    click('다음 이야기로');await until(()=>session.stage===2&&floor?.allowed===false);
    check(container.querySelector('.lounge-session-progress').textContent.includes('순서 발언'),'Next topic left all microphones open');
    root.unmount();container.remove();

    // Deliberately keep moderation unresolved. Ordered STT, display and the
    // ending button must finish first; warnings and restrictions apply later.
    const fastSaved={load:api.loadLounge,review:api.reviewLoungeInteraction,transcribe:api.transcribeLoungeAudio,messages,session,interval:globalThis.setInterval};
    const fastContainer=document.createElement('div');document.body.append(fastContainer);const fastRoot=createRoot(fastContainer,{onUncaughtError:err=>{fastContainer.textContent=err.stack;}});
    const decisions=[];let captured=0,warnings=0,restrictedUntil=null;
    const fastQueue=evaluate(code.transcription).createLoungeTranscriptionQueue(()=>10_000,async()=>{});
    fixtureFlush=()=>fastQueue.flush();
    // Disable the periodic display refresh so it cannot hide a delayed direct refresh.
    globalThis.setInterval=(callback,ms,...args)=>fastSaved.interval.call(globalThis,ms===1000?()=>{}:callback,ms,...args);
    try {
      session={...session,stage:5,state:'speaking',speaker_id:'me',turn_id:'fast-turn',turn_kind:'basic',round_order:['me','peer-a'],completed:[],hand_queue:[],announced_turn:'fast-turn',announced_stage:5,nudged:false};
      messages=[];
      api.loadLounge=async()=>{
        const state=await fastSaved.load();
        return {...state,members:state.members.map(member=>member.user_id==='me'?{...member,moderation_warnings:warnings,speaking_restricted_until:restrictedUntil}:member)};
      };
      api.transcribeLoungeAudio=async(id,blob,signal,turn)=>{
        check(turn==='fast-turn','Fast transcript lost captured turn');
        const idValue=700+(++captured);
        messages.push({id:idValue,user_id:'me',nickname:'나',kind:'human',text:'저장 직후 표시되는 발언 '+captured});
        return {posted:true};
      };
      api.reviewLoungeInteraction=async()=>{
        const index=decisions.length;
        await new Promise(resolve=>decisions.push(resolve));
        warnings=index+1;restrictedUntil=index===1?'2099-01-01':null;
        messages=messages.map(message=>message.id===701+index?{...message,text:'대화 보호를 위해 이 발언의 기록을 숨겼어요.'}:message);
        return {moderation:index===0?'warn':'restrict'};
      };
      fastRoot.render(React.createElement(React.StrictMode,null,React.createElement(page.TestRoom,{roomId:'fixture',user:{id:'me',nickname:'나'},onGuestRequest:async()=>{},onLoginRequest:()=>{}})));
      await until(()=>fastContainer.querySelector('.lounge-session-actions button')).catch(err=>{throw new Error(err.message+': '+fastContainer.textContent);});
      const capturedCallback=transcriptCallback;
      let flushed=false;
      void fastQueue.enqueue(()=>capturedCallback(new Blob(['audio']), 'fast-turn'),()=>true);
      void fastQueue.enqueue(()=>capturedCallback(new Blob(['audio']), 'fast-turn'),()=>true);
      void fastQueue.flush().then(()=>{flushed=true;});
      await until(()=>flushed&&captured===2&&decisions.length===2);
      await until(()=>fastContainer.querySelector('.lounge-participant-log').textContent.includes('저장 직후 표시되는 발언 2'));
      check(fastContainer.querySelector('.lounge-participant-log').textContent.includes('저장 직후 표시되는 발언 1'),'Earlier stored speech was lost');
      check(!fastContainer.querySelector('.lounge-safety-notice'),'Unfinished inference invented a warning');
      const done=[...fastContainer.querySelectorAll('.lounge-session-actions button')].find(button=>button.textContent.includes('이야기 마쳤어요'));
      check(done&&!done.disabled,'Ending control missing in fast fixture');done.click();
      await until(()=>session.speaker_id==='peer-a');
      decisions[0]();
      await until(()=>fastContainer.querySelector('.lounge-safety-notice')?.textContent.includes('1차 경고'));
      check(fastContainer.querySelector('.lounge-participant-log').textContent.includes('기록을 숨겼어요'),'Reviewed violation record was not hidden');
      decisions[1]();
      await until(()=>fastContainer.querySelector('.lounge-safety-notice')?.textContent.includes('잠시 발언이 제한'));
      check(fastContainer.querySelector('.lounge-mic-button').disabled,'Delayed restriction did not disable publishing controls');
    } finally {
      fastRoot.unmount();fastContainer.remove();decisions.forEach(resolve=>resolve());fixtureFlush=async()=>{};
      api.loadLounge=fastSaved.load;api.reviewLoungeInteraction=fastSaved.review;api.transcribeLoungeAudio=fastSaved.transcribe;
      messages=fastSaved.messages;session=fastSaved.session;globalThis.setInterval=fastSaved.interval;
    }

    // Permanent setup failures stop both polling and transcript review, while
    // temporary failures recover and regular transcription remains usable.
    const savedApi={sync:api.syncLoungeSafety,review:api.reviewLoungeInteraction,transcribe:api.transcribeLoungeAudio};
    const savedMessages=messages, nativeInterval=globalThis.setInterval;
    globalThis.setInterval=(callback,ms,...args)=>nativeInterval(callback,ms===5000?40:ms,...args);
    try {
      for(const permanent of [true,false]) {
        let syncCalls=0,reviewCalls=0,transcribeCalls=0;
        const notice='AI 대화 보호 서버 설정을 확인해 주세요.';
        api.syncLoungeSafety=async()=>{
          syncCalls++;
          if(permanent||syncCalls===1) throw Object.assign(new api.LoungeApiError(permanent?notice:'일시적인 연결 지연'),{code:permanent?'lounge_interaction_not_configured':'lounge_interaction_sync_failed',retryable:!permanent});
          return {};
        };
        api.reviewLoungeInteraction=async()=>{reviewCalls++;return {};};
        api.transcribeLoungeAudio=async()=>{transcribeCalls++;return {posted:true};};
        messages=[{id:7,user_id:'me',nickname:'나',kind:'human',text:'새 발언',reviewed_at:null,review_attempts:0,created_at:new Date().toISOString()}];
        const pollingContainer=document.createElement('div');document.body.append(pollingContainer);const pollingRoot=createRoot(pollingContainer);
        try {
          pollingRoot.render(React.createElement(React.StrictMode,null,React.createElement(page.TestRoom,{roomId:'fixture',user:{id:'me',nickname:'나'},onGuestRequest:async()=>{},onLoginRequest:()=>{}})));
          await until(()=>syncCalls>=1);await wait(180);
          if(permanent) {
            check(syncCalls===1,'Permanent setup failure kept polling');
            check(reviewCalls===0,'Unconfigured sync was followed by a review request');
            check(pollingContainer.textContent.includes(notice),'Protection failure notice was hidden');
            await transcriptCallback(new Blob(['audio'],{type:'audio/webm'}));
            check(transcribeCalls===1,'Unavailable protection stopped regular transcription');
            check(reviewCalls===0,'Transcript retried a permanent setup failure');
          } else {
            check(syncCalls>=2&&reviewCalls>=1,'Temporary protection failure did not recover');
            check(!pollingContainer.textContent.includes('일시적인 연결 지연'),'Recovered error stayed on screen');
          }
        } finally {pollingRoot.unmount();pollingContainer.remove();}
      }
    } finally {
      api.syncLoungeSafety=savedApi.sync;api.reviewLoungeInteraction=savedApi.review;api.transcribeLoungeAudio=savedApi.transcribe;
      messages=savedMessages;globalThis.setInterval=nativeInterval;
    }

    // Real room controls reflect restrictions and separate answer turns.
    const safetyContainer=document.createElement('div');document.body.append(safetyContainer);const safetyRoot=createRoot(safetyContainer);
    let released;
    const safetyProps={now:Date.now(),theme:'river',hostId:'ina',topic:'책 이야기',study:filmStudy,topicBrief:{category:'media',subcategory:'book',work_title:'데미안',creator:'헤르만 헤세',reason:'지금의 고민과 연결되는 책이라서',discussion:'나답게 선택하는 기준을 함께 이야기해요.'},capacity:3,messages:[],speakers:[],aiSpeaking:false,pending:false,status:'active',remaining:'약 30분',micOn:false,connected:true,audioReady:true,isHost:true,error:'',currentUserId:'me',
      members:[{id:'me',name:'민수',muted:true,warnings:2,restrictedUntil:'2099-01-01'},{id:'peer-a',name:'소연',muted:true}],
      session:{...session,stage:0,state:'ready',speaker_id:'me',turn_kind:'reply',reply_question:'소연님의 질문: 어떤 문장이 마음에 남았나요?',reply_from:'peer-a',completed:[],hand_queue:[],reply_queue:[{target:'peer-a'}]},
      onSessionAction:async()=>{},onReleaseRestriction:async id=>{released=id;},onConnect:()=>{},onMic:()=>{},onAsk:()=>{},onStart:()=>{},onLeave:()=>{}};
    safetyRoot.render(React.createElement(page.TestRoomView,safetyProps));
    await until(()=>safetyContainer.querySelector('.lounge-safety-notice'));
    const description=safetyContainer.querySelector('.lounge-topic-description');
    check(description && !description.open,'Host introduction must start collapsed to keep the scenery clear');
    description.querySelector('summary').click();
    check(description.open && description.textContent.includes('헤르만 헤세') && description.textContent.includes('지금의 고민') && description.textContent.includes('나답게 선택'),'Participants cannot read the host work metadata, reason and conversation direction');
    const sceneCard=safetyContainer.querySelector('.lounge-film-card');check(sceneCard && !sceneCard.open,'Scene card must start collapsed');sceneCard.querySelector('summary').click();
    check(sceneCard.open && sceneCard.textContent.includes('결말 · 반전') && sceneCard.textContent.includes('확인한 장면') && sceneCard.textContent.includes('평론가의 해석') && sceneCard.textContent.includes('AI의 해석 가능성'),'Ending card lost scene facts or interpretation attribution');
    check(sceneCard.querySelector('a').href===filmStudy.sources[0].url,'Scene evidence must have a readable source link');
    check(safetyContainer.querySelector('.lounge-mic-button').disabled,'Restricted microphone remained enabled');
    check(safetyContainer.querySelector('[aria-label="손들기 · 추가로 이야기할게요"]').disabled,'Restricted member could raise a hand');
    check(safetyContainer.querySelector('.lounge-session-question').textContent.includes('어떤 문장이'),'Directed question disappeared');
    check(safetyContainer.querySelector('.lounge-session-current').textContent.includes('소연님의 질문에 답변'),'Question author missing');
    check(safetyContainer.querySelector('.lounge-session-queue-summary').textContent.includes('질문 답변 대기'),'Answer waiting list missing');
    safetyContainer.querySelector('.lounge-release-restriction').click();await until(()=>released==='me');
    safetyRoot.render(React.createElement(page.TestRoomView,{...safetyProps,members:safetyProps.members.map(m=>({...m,warnings:0,restrictedUntil:null}))}));
    await until(()=>!safetyContainer.querySelector('.lounge-safety-notice'));
    check(!safetyContainer.querySelector('.lounge-mic-button').disabled,'Released microphone stayed disabled');
    check(!safetyContainer.querySelector('[aria-label="손들기 · 추가로 이야기할게요"]').disabled,'Released hand stayed disabled');
    for(const [category,subcategory,title] of [
      ['media','film','기억에 남는 장면'],['media','book','마음에 남은 문장과 대목'],
      ['hobby','general','나의 경험과 발견'],['love','general','마음이 어려웠던 상황'],
      ['career','general','일하며 겪은 경험'],['finance','general','투자·소비 경험 돌아보기'],
      ['education','general','실제 육아·교육 경험'],
    ]) {
      safetyRoot.render(React.createElement(page.TestRoomView,{...safetyProps,study:null,
        topicBrief:{category,subcategory,work_title:category==='media'?'작품':'',creator:category==='media'?'창작자':'',reason:'함께 경험을 나누고 싶어서',discussion:'각자의 선택 기준을 이야기해요.'},
        session:{...safetyProps.session,stage:2,state:'free',speaker_id:null,turn_kind:'basic',reply_question:null},
        members:safetyProps.members.map(m=>({...m,warnings:0,restrictedUntil:null})),
      }));
      await until(()=>safetyContainer.querySelector('.lounge-session-panel h3')?.textContent===title);
      check(safetyContainer.querySelector('.lounge-session-progress').textContent.includes(title),'Room progress did not receive the selected topic');
      if(category!=='media') check(!/장면|대사|결말|반전/.test(safetyContainer.querySelector('.lounge-session-question').textContent),'Non-media room still asked a film question');
      check(!safetyContainer.querySelector('.lounge-seat.has-floor'),'Topic-specific free discussion reserved a floor');
    }
    safetyRoot.unmount();safetyContainer.remove();

    // The actual audio hook is tested with synthetic tracks and recorder events.
    const native = {AudioContext:globalThis.AudioContext,MediaRecorder:globalThis.MediaRecorder,fetch:globalThis.fetch};
    const sourceContext=new native.AudioContext(),mediaTrack=sourceContext.createMediaStreamDestination().stream.getAudioTracks()[0];
    const tracks=[],scheduled=[];let liveRoom,hook;
    class FakeAudioContext {
      state='running';sampleRate=24000;epoch=performance.now();destination={};resume=async()=>{};close=async()=>{};
      get currentTime(){return (performance.now()-this.epoch)/1000;}
      createMediaStreamSource(){return {connect(){},disconnect(){}};}
      createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[mediaTrack]}};}
      createAnalyser(){return {fftSize:1024,disconnect(){},getFloatTimeDomainData(values){values.fill(.1);}};}
      createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}}};}
      createBuffer(_,size,rate){const samples=new Float32Array(size);return {duration:size/rate,getChannelData:()=>samples};}
      createBufferSource(){const context=this;return {connect(){},disconnect(){},stop(){clearTimeout(this.timer);this.stopped=true;},start(time){scheduled.push(this);this.timer=setTimeout(()=>{this.ended=true;this.onended?.();},Math.max(0,time-context.currentTime)*1000+this.buffer.duration*1000);}};}
    }
    class FakeRecorder extends EventTarget {static isTypeSupported(){return true;} state='inactive';mimeType='audio/webm'; start(){this.state='recording';} stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['x'.repeat(400)])});this.onstop?.();this.dispatchEvent(new Event('stop'));} }
    class FakeTrack {mediaStreamTrack=mediaTrack;muted=false;muteCalls=0;unmuteCalls=0;async mute(){this.muted=true;this.muteCalls++;}async unmute(){this.muted=false;this.unmuteCalls++;}stop(){} }
    class FakeRoom {
      remoteParticipants=new Map();handlers={};localParticipant={identity:'me',name:'Me',isMicrophoneEnabled:true,metadata:'{}',publishTrack:async()=>{},unpublishTrack:async()=>{},publishData:async()=>{},setMetadata:async()=>{}};
      constructor(){liveRoom=this;} on(name,callback){(this.handlers[name]||=[]).push(callback);}emit(name,...args){for(const cb of this.handlers[name]||[])cb(...args);}async connect(){}async disconnect(){}async startAudio(){}
    }
    const events=new Proxy({},{get:(_,name)=>name});
    const client={Room:FakeRoom,RoomEvent:events,Track:{Kind:{Audio:'audio'},Source:{Microphone:'microphone',Unknown:'unknown'}},LocalAudioTrack:FakeTrack,createLocalAudioTrack:async()=>{const track=new FakeTrack();tracks.push(track);return track;}};
    const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:null})})})})};
    const captions=[];
    try {
      globalThis.AudioContext=FakeAudioContext;globalThis.MediaRecorder=FakeRecorder;globalThis.fetch=async()=>new Response(JSON.stringify({url:'wss://mock',token:'test'}));
      const streamApi=evaluate(code.audioApi),streamModule=evaluate(code.stream,()=>streamApi);
      const audioModule=evaluate(code.audio,name=>name==='react'?React:name==='livekit-client'?client:name==='./supabase'?{supabase}:name==='./lounge'?lounge:name==='./loungeStream'?streamModule:name==='./loungeTranscription'?evaluate(code.transcription):name==='./loungeAvatar'?{loadLoungeAvatar:async()=>({}),safeLoungeAvatarUrl:()=>undefined}:name==='./loungeApi'?streamApi:{});
      const audioContainer=document.createElement('div');document.body.append(audioContainer);const audioRoot=createRoot(audioContainer);
      function AudioFixture({allowed,speakerId,turnId,restricted=[]}) {hook=audioModule.useLoungeAudio('fixture','host',async(blob,turn)=>{await wait(30);captions.push(turn);},3,allowed===undefined?undefined:{allowed,speakerId,turnId},restricted);return null;}
      audioRoot.render(React.createElement(AudioFixture,{allowed:false,speakerId:null,turnId:'turn-a'}));await until(()=>hook);await hook.connect();await until(()=>hook.connected);await hook.startMicrophone();await until(()=>hook.micOn);
      check(tracks[0].muted,'Actual waiting microphone was not muted');
      const remote={kind:'audio',attach:()=>document.createElement('audio'),detach:()=>[]};
      liveRoom.emit('TrackSubscribed',remote,{source:'microphone'},{identity:'peer'});
      const remoteElement=[...document.querySelectorAll('audio')].at(-1);check(remoteElement.muted,'Off-turn remote microphone was audible');
      const audioCount=document.querySelectorAll('audio').length;
      liveRoom.emit('TrackSubscribed',remote,{source:'microphone'},{identity:'peer'});
      check(document.querySelectorAll('audio').length===audioCount,'Repeated subscription created duplicate audio playback');
      audioRoot.render(React.createElement(AudioFixture,{allowed:true,speakerId:'me',turnId:'turn-a'}));await until(()=>!tracks[0].muted);await wait(400);
      check(hook.getSpeechActivity().voicedMs>0,'Actual speech activity was not measured');
      await hook.flushUtterance();check(captions.length===1,'Ending a turn did not await its final transcript');
      audioRoot.render(React.createElement(AudioFixture,{allowed:false,speakerId:'peer',turnId:'turn-b'}));await until(()=>tracks[0].muted&&captions.length>0);
      check(captions[0]==='turn-a','Delayed recorder attached to the wrong turn');check(!remoteElement.muted,'Current remote speaker was blocked');
      audioRoot.render(React.createElement(AudioFixture,{allowed:true,speakerId:'peer',turnId:'turn-b',restricted:['me','peer']}));await until(()=>tracks[0].muted&&remoteElement.muted);
      liveRoom.emit('ActiveSpeakersChanged',[{identity:'peer'}]);await wait(50);check(!hook.speakers.includes('peer'),'Restricted participant displayed as speaking');
      audioRoot.render(React.createElement(AudioFixture,{allowed:false,speakerId:'peer',turnId:'turn-b'}));await until(()=>!remoteElement.muted);
      check(tracks[0].muted,'Release incorrectly unmuted an off-turn local microphone');
      audioRoot.render(React.createElement(AudioFixture,{speakerId:null}));await until(()=>!tracks[0].muted&&!remoteElement.muted);
      check(!tracks[0].muted&&!remoteElement.muted,'Free conversation did not open both local and remote microphones');
      audioRoot.render(React.createElement(AudioFixture,{speakerId:null,restricted:['peer']}));await until(()=>remoteElement.muted);
      check(!tracks[0].muted&&remoteElement.muted,'Free conversation removed the safety restriction');
      hook.stopMicrophone();
      const speechStream=(sampleCount,last)=>{
        const bytes=new Uint8Array(sampleCount*2).fill(32);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        return new Response([JSON.stringify({type:'host',text:'긴 사회자 발언',timings:{}}),JSON.stringify({type:'audio',audio:btoa(binary)}),JSON.stringify(last)].join('\\n')+'\\n').body;
      };
      for(const samples of [2400,12000]){
        const before=scheduled.length;let started=0,settled=false;
        const playback=hook.playHostStream(speechStream(samples,{type:'error',error:'upstream timed out',code:'lounge_audio_timeout',retryable:true}),()=>started++,()=>{},()=>true).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
        await until(()=>scheduled.length>before);await wait(30);
        check(!settled,'A late stream error stopped buffered audio before playback ended');
        const error=await playback;
        check(error?.code==='lounge_audio_timeout','Playback lost the original stream failure');
        check(started===1,'Buffered speech started more than once');
        const played=scheduled.slice(before);
        check(played.every(source=>source.ended),'Scheduled speech was discarded by the error');
        check(Math.round(played.reduce((sum,source)=>sum+source.buffer.duration*24000,0))===samples,'The buffered tail was duplicated or dropped');
      }
      let quiet=false,waitingDone=false,delayedStarts=0;
      const beforeWaiting=scheduled.length;
      const waitingPlayback=hook.playHostStream(speechStream(9600,{type:'done'}),()=>delayedStarts++,()=>{},()=>quiet,()=>true).then(()=>{waitingDone=true;});
      await wait(100);check(!waitingDone&&scheduled.length===beforeWaiting,'A momentary speech/transcription overlap discarded or interrupted AI audio');
      quiet=true;await waitingPlayback;
      check(delayedStarts===1&&scheduled.length>beforeWaiting,'Prepared audio did not resume after participants became quiet');
      let validTurn=true;
      const beforeTurnChange=scheduled.length;
      const obsolete=hook.playHostStream(speechStream(9600,{type:'done'}),()=>{throw new Error('Obsolete turn played');},()=>{},()=>false,()=>validTurn);
      await wait(80);validTurn=false;await obsolete;
      check(scheduled.length===beforeTurnChange,'Audio played after its target turn changed');
      const waitingStop=hook.playHostStream(speechStream(9600,{type:'done'}),()=>{throw new Error('Cancelled waiting audio played');},()=>{},()=>false,()=>true);
      await wait(80);hook.stopHost();await waitingStop;
      check(scheduled.length===beforeTurnChange,'Stopping during a quiet wait played buffered audio');
      const originalNow=Date.now;let testNow=originalNow();
      try {
        Date.now=()=>testNow;
        const excessiveWait=hook.playHostStream(speechStream(9600,{type:'done'}),()=>{throw new Error('Audio interrupted continuous speech');},()=>{},()=>false,()=>true).then(()=>null,error=>error);
        await wait(80);testNow+=9000;
        const error=await excessiveWait;
        check(error?.code==='lounge_audio_deferred','A continuous-speaker cancellation was silent');
        check(scheduled.length===beforeTurnChange,'Long human speech was interrupted by the moderator');
      } finally {Date.now=originalNow;}
      const beforeActualStop=scheduled.length;
      const cancelledPlayback=hook.playHostStream(speechStream(24000,{type:'error',error:'late error',code:'lounge_audio_timeout'}),()=>{},()=>{},()=>true);
      await until(()=>scheduled.length>beforeActualStop);hook.stopHost();await cancelledPlayback;
      check(scheduled.slice(beforeActualStop).every(source=>source.stopped),'Explicit stop waited for queued speech');
      audioRoot.unmount();audioContainer.remove();
    } finally {globalThis.AudioContext=native.AudioContext;globalThis.MediaRecorder=native.MediaRecorder;globalThis.fetch=native.fetch;await sourceContext.close();}
    return {ui:true,microphones:true,lateCapture:true};
  })()` });
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  assert.deepEqual(response.result.value, {ui:true,microphones:true,lateCapture:true});
  console.log('PASS: immediate transcripts, moderation, guided turns, microphones, TTS quiet-wait/resume, changed-turn cancellation, continuous-speech notice, buffered errors and immediate stop.');
} finally {socket.close();}
