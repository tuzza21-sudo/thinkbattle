import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
test('the deployed ESM module loads and serves both Web and Vercel Node requests', async () => {
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  const tempRoot = resolve(workspace, 'node_modules/.tmp');
  mkdirSync(tempRoot, { recursive: true });
  const directory = mkdtempSync(resolve(tempRoot, 'lounge-interaction-runtime-'));
  try {
    writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    // The function's whole import graph, as Vercel deploys it (compiled per file, no bundling).
    const relationship = ['index', 'events', 'types', 'engine', 'persistence', 'memory', 'configs/auditor', 'configs/closer', 'configs/diplomat', 'configs/empath', 'configs/lawyer', 'configs/trickster', 'configs/velvetKnife', 'configs/wit'].map(name => `src/lib/relationship/${name}.ts`);
    for (const file of ['api/lounge-interaction.ts', 'src/lib/loungeInteraction.ts', ...relationship]) {
      const target = resolve(directory, file.replace(/\.ts$/, '.js'));
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, ts.transpileModule(readFileSync(resolve(workspace, file), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
      }).outputText);
    }
    // Real Node resolution catches imports that the CommonJS mocks and Vite accept.
    const { default: handler } = await import(pathToFileURL(resolve(directory, 'api/lounge-interaction.js')).href);
    const webResponse = await handler(new Request('https://app.test/api/lounge-interaction'));
    assert.equal(webResponse.status, 405);
    assert.equal((await handler(new Request('https://app.test/api/lounge-interaction', { method: 'POST' }))).status, 401);
    const headers = {};
    let body;
    const nodeResponse = {
      statusCode: 0,
      setHeader: (name, value) => { headers[name] = value; },
      end: value => { body = value; },
    };
    await handler({ method: 'GET', url: '/api/lounge-interaction', headers: { host: 'app.test' } }, nodeResponse);
    assert.equal(nodeResponse.statusCode, 405);
    assert.equal(headers['content-type'], 'application/json');
    assert.equal(typeof JSON.parse(new TextDecoder().decode(body)).error, 'string');
  } finally {
    const location = relative(tempRoot, directory);
    assert.ok(location && !location.startsWith('..') && !isAbsolute(location));
    rmSync(directory, { recursive: true, force: true });
  }
});
const compile = (path, require = () => {}) => {
  const exports = {};
  new Function('exports','require',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{ compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.CommonJS} }).outputText)(exports,require);
  return exports;
};
const lib = compile('../src/lib/loungeInteraction.ts');
const sessionLib = compile('../src/lib/loungeSession.ts');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const roomId='lounge-'+a;
const members=[{id:a,nickname:'민수'},{id:b,nickname:'소연'}];
const raw={moderation:'allow',moderation_confidence:'high',severity:'ordinary',reason:'none',target_id:b,target_confidence:'high',question:'어떤 문장이 기억에 남나요?'};
const output=value=>({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const result=(value,status=200)=>new Response(JSON.stringify(value),{status});
const request=body=>new Request('https://app.test/api/lounge-interaction',{method:'POST',headers:{Authorization:'Bearer session','Content-Type':'application/json'},body:JSON.stringify(body)});
const run=async(mock,task,voiceFailure=false)=>{
  const previous={...process.env},fetch=globalThis.fetch,updates=[];
  for(const [name,value] of Object.entries({OPENAI_API_KEY:'test-key',SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'private-service',LIVEKIT_URL:'wss://voice.test',LIVEKIT_API_KEY:'voice-key',LIVEKIT_API_SECRET:'voice-secret'}))process.env[name]=value;
  const handler=compile('../api/lounge-interaction.ts',path=>path.includes('loungeInteraction')?lib:{RoomServiceClient:class{
    async listParticipants(){if(voiceFailure)throw voiceFailure instanceof Error?voiceFailure:new Error('private voice failure');return [{identity:b}];}
    async updateParticipant(...args){updates.push(args);}
  }}).default;
  globalThis.fetch=mock;
  try{await task(handler,updates);}finally{globalThis.fetch=fetch;for(const name of ['OPENAI_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET']){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
};
test('only an explicit unique participant nickname and confident safe question can route a reply',()=>{
  assert.equal(lib.readLoungeInteraction(output(raw),members,a,'소연님, 어떤 문장이 기억에 남나요?').target_id,b);
  for(const [value,roster,text] of [
    [{...raw,target_id:a},members,'민수는 어떻게 생각하나요?'],
    [{...raw,target_id:'invented'},members,'소연님, 어때요?'],
    [raw,[...members,{id:'duplicate',nickname:'소 연'}],'소연님, 어때요?'],
    [raw,members,'그 분은 어떻게 생각하세요?'],
    [{...raw,target_confidence:'low'},members,'소연님, 어때요?'],
    [{...raw,moderation:'warn',reason:'harassment'},members,'소연님, 어때요?'],
  ])assert.equal(lib.readLoungeInteraction(output(value),roster,a,text).target_id,null);
});
test('a plain commentary message next to the JSON decision does not break it',()=>{
  const decision=JSON.stringify({...raw,moderation:'warn',reason:'harassment'});
  for(const messages of [
    [{phase:'commentary',content:[{type:'output_text',text:'검토해 볼게요.'}]},{phase:'final_answer',content:[{type:'output_text',text:decision}]}],
    [{phase:'commentary',content:[{type:'output_text',text:decision}]}],
  ])assert.equal(lib.readLoungeInteraction({output:messages},members,a,'내용').moderation,'warn');
  assert.throws(()=>lib.readLoungeInteraction({output:[{phase:'commentary',content:[{type:'output_text',text:'검토해 볼게요.'}]}]},members,a,'내용'),/Incomplete/);
});
test('ordinary attacks warn, severe attacks restrict immediately, and uncertainty cannot sanction anyone',()=>{
  assert.equal(lib.readLoungeInteraction(output({...raw,moderation:'restrict',reason:'threat',moderation_confidence:'low'}),members,a,'내용').moderation,'allow');
  assert.equal(lib.readLoungeInteraction(output({...raw,moderation:'restrict',reason:'harassment'}),members,a,'내용').moderation,'warn');
  assert.equal(lib.readLoungeInteraction(output({...raw,moderation:'warn',severity:'severe',reason:'harassment'}),members,a,'내용').moderation,'restrict');
  assert.equal(lib.readLoungeInteraction(output({...raw,moderation:'restrict',severity:'severe',reason:'harassment',moderation_confidence:'low'}),members,a,'내용').moderation,'allow');
  for(const reason of ['threat','hate','sexual_harassment'])assert.equal(lib.readLoungeInteraction(output({...raw,moderation:'warn',reason}),members,a,'내용').moderation,'restrict');
  assert.throws(()=>lib.readLoungeInteraction({output:[{content:[{type:'refusal'}]}]},members,a,'내용'));
  assert.throws(()=>lib.readLoungeInteraction(output({...raw,moderation:'ban'}),members,a,'내용'));
  assert.match(lib.loungeInteractionInstructions,/작품의 대사 인용/);assert.match(lib.loungeInteractionInstructions,/신뢰할 수 없는/);
});
test('flirting and mild sexual teasing between adults are allowed; only insults, harassment and the narrow cases are restricted',()=>{
  const text=lib.loungeInteractionInstructions;
  assert.match(text,/플러팅, 유혹, 성적인 농담, 약한 수준의 성적 암시나 자극, 애정 표현은 제한하지 않고 allow/);
  assert.match(text,/성적인 단어가 들어 있다는 이유만으로 warn이나 restrict를 선택하지 않는다/);
  // Sexual harassment stays, but only for what is unwelcome, degrading, graphic, about minors or coerced.
  for(const narrow of ['싫다고 하거나 불쾌감을 드러낸 뒤에도 이어지는 성적인 접근','노골적인 성행위의 상세한 묘사','미성년자와 관련된 성적 내용','강요나 협박이 섞인 성적 요구']) assert.ok(text.includes(narrow),narrow);
  // Insults and profanity at a person are still warned.
  assert.match(text,/인신공격·욕설·괴롭힘이면 warn/);
});
test('reply prompts and queues preserve the current target’s basic opportunity',()=>{
  const session={stage:2,speaker_id:b,turn_kind:'reply',reply_question:'어떤 문장이 남았나요?',round_order:[a,b],completed:[a],hand_queue:[],reply_queue:[]};
  assert.equal(sessionLib.loungeSessionPrompt(session),session.reply_question);
  assert.deepEqual(sessionLib.loungeSessionQueue(session),[b]);
  assert.deepEqual(lib.restrictedLoungeMembers([{user_id:a,speaking_restricted_until:'2000-01-01'},{user_id:b,speaking_restricted_until:'2099-01-01'}]),[b]);
});
const access=url=>url.includes('/auth/')?result({id:a}):url.includes('voice_lounge_members?')?result([{user_id:a}]):null;
test('missing server service key returns a non-retryable configuration error before any upstream request',async()=>{
  await run(async()=>{throw new Error('Unconfigured protection must not call upstream services');},async handler=>{
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    for(const action of ['sync','review']){
      const response=await handler(request({action,roomId}));
      assert.equal(response.status,503);
      const payload=await response.json();
      assert.equal(payload.code,'lounge_interaction_not_configured');
      assert.equal(payload.retryable,false);
    }
  });
});

test('interaction client retains configuration errors and allows transient failures to retry',async()=>{
  const client=compile('../src/lib/loungeApi.ts',path=>path.endsWith('/supabase')?{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'session'}}})}}}:{});
  await run(async()=>result({error:'AI 대화 보호 서버 설정을 확인해 주세요.',code:'lounge_interaction_not_configured',retryable:false},503),async()=>{
    await assert.rejects(client.syncLoungeSafety(roomId),err=>err instanceof client.LoungeApiError&&err.code==='lounge_interaction_not_configured'&&err.retryable===false);
  });
  await run(async()=>result({error:'지연',code:'lounge_interaction_sync_failed',retryable:true},502),async()=>{
    await assert.rejects(client.syncLoungeSafety(roomId),err=>err instanceof client.LoungeApiError&&err.code==='lounge_interaction_sync_failed'&&err.retryable===true);
  });
});

test('forged browser decisions are ignored: only persisted text and authenticated actor reach inference and service RPC',async()=>{
  let committed;
  await run(async(url,init)=>{
    const permitted=access(url);if(permitted)return permitted;
    if(url.includes('/rpc/')){
      assert.equal(init.headers.apikey,'private-service');const args=JSON.parse(init.body);
      if(url.includes('claim_voice_lounge_interaction')){assert.equal(args.p_actor,a);return result({ticket:'ticket',message_id:1,speaker_id:a,text:'소연님, 어떤 문장이 남았나요?',members,topic:'책',recent:[]});}
      if(url.includes('finish_voice_lounge_interaction')){committed=args.p_decision;return result({warnings:0});}
      if(url.includes('pending_voice_lounge_voice_sync'))return result([]);
    }
    if(url.endsWith('/responses')){const body=JSON.parse(init.body);assert.equal(body.text.format.strict,true);assert.equal(JSON.parse(body.input).text,'소연님, 어떤 문장이 남았나요?');assert.equal(body.store,false);return result(output(raw));}
    throw new Error('Unexpected call');
  },async handler=>{
    const response=await handler(request({action:'review',roomId,messageId:1,actor:b,moderation:'restrict',text:'forged'}));assert.equal(response.status,200);
    assert.deepEqual(committed,{moderation:'allow',reason:'none',target_id:b,question:raw.question});
  });
});
test('speaking restrictions are paused unless LOUNGE_MODERATION=on',async()=>{
  const previous=process.env.LOUNGE_MODERATION;
  try{
    for(const setting of [undefined,'on']){
      if(setting===undefined)delete process.env.LOUNGE_MODERATION;else process.env.LOUNGE_MODERATION=setting;
      let committed;
      await run(async(url,init)=>{
        const permitted=access(url);if(permitted)return permitted;
        if(url.includes('claim_voice_lounge_interaction'))return result({ticket:'ticket',message_id:1,speaker_id:a,text:'공격',members,topic:'책',recent:[]});
        if(url.endsWith('/responses'))return result(output({...raw,moderation:'restrict',reason:'threat',target_id:null,question:null}));
        if(url.includes('finish_voice_lounge_interaction')){committed=JSON.parse(init.body).p_decision;return result({warnings:0});}
        if(url.includes('pending_voice_lounge_voice_sync'))return result([]);
        throw new Error('Unexpected');
      },async handler=>{assert.equal((await handler(request({action:'review',roomId}))).status,200);});
      assert.deepEqual([committed.moderation,committed.reason],setting==='on'?['restrict','threat']:['allow','none']);
    }
  }finally{if(previous===undefined)delete process.env.LOUNGE_MODERATION;else process.env.LOUNGE_MODERATION=previous;}
});
test('alone with the character and restrictions paused, a message is accepted without an inference call',async()=>{
  const previous=process.env.LOUNGE_MODERATION;delete process.env.LOUNGE_MODERATION;
  let committed;
  try{
    await run(async(url,init)=>{
      const permitted=access(url);if(permitted)return permitted;
      if(url.includes('claim_voice_lounge_interaction'))return result({ticket:'ticket',message_id:1,speaker_id:a,text:'*손을 잡는다* 오늘 밤은 안 보내 줄 거예요.',members:[members[0]],topic:'자유',recent:[],group:false});
      if(url.includes('finish_voice_lounge_interaction')){committed=JSON.parse(init.body).p_decision;return result({warnings:0});}
      throw new Error('Must not spend inference');
    },async handler=>{assert.equal((await handler(request({action:'review',roomId}))).status,200);});
    assert.deepEqual(committed,{moderation:'allow',reason:'none',target_id:null,question:null});
  }finally{if(previous!==undefined)process.env.LOUNGE_MODERATION=previous;}
});
test('a chat room without a voice room still finishes its safety sync',async()=>{
  const missing=Object.assign(new Error('requested room does not exist'),{status:404,code:'not_found'});
  let acked=false;
  await run(async url=>{
    const permitted=access(url);if(permitted)return permitted;
    if(url.includes('pending_voice_lounge_voice_sync'))return result([{user_id:a,speaking_restricted_until:null,safety_updated_at:'2026-10-21'}]);
    if(url.includes('ack_voice_lounge_voice_sync')){acked=true;return new Response(null,{status:204});}
    throw new Error('Unexpected');
  },async handler=>{assert.equal((await handler(request({action:'sync',roomId}))).status,200);},missing);
  assert.equal(acked,true);
});
test('unauthorized reviewers and duplicate claims never spend inference',async()=>{
  for(const unauthorized of [true,false])await run(async url=>{
    if(url.includes('/auth/'))return result({id:a});
    if(url.includes('voice_lounge_members?'))return result(unauthorized?[]:[{user_id:a}]);
    if(url.includes('claim_voice_lounge_interaction'))return result(null);
    throw new Error('Must not spend inference');
  },async handler=>{const response=await handler(request({action:'review',roomId}));assert.equal(response.status,unauthorized?403:200);});
});
test('inference failure releases a claim and cannot invent a restriction or leak provider errors',async()=>{
  let failed=false;
  await run(async url=>{
    const permitted=access(url);if(permitted)return permitted;
    if(url.includes('claim_voice_lounge_interaction'))return result({ticket:'ticket',message_id:1,speaker_id:a,text:'소연님?',members,topic:'책',recent:[]});
    if(url.endsWith('/responses'))return result({error:'private provider detail'},429);
    if(url.includes('fail_voice_lounge_interaction')){failed=true;return new Response(null,{status:204});}
    throw new Error('Must not commit a restriction');
  },async handler=>{const response=await handler(request({action:'review',roomId}));assert.equal(response.status,502);assert.equal(failed,true);assert.doesNotMatch(await response.text(),/private provider|private-service|test-key/);});
});
test('voice publishing is revoked while listening remains available; only host can release',async()=>{
  await run(async(url,init)=>{
    const permitted=access(url);if(permitted)return permitted;
    if(url.includes('pending_voice_lounge_voice_sync'))return result([{user_id:b,speaking_restricted_until:'2099-01-01',safety_updated_at:'2026-10-03'}]);
    if(url.includes('ack_voice_lounge_voice_sync'))return new Response(null,{status:204});
    if(url.includes('release_voice_lounge_restriction')){assert.equal(JSON.parse(init.body).p_actor,a);return result(false);}
    throw new Error('Unexpected');
  },async(handler,updates)=>{
    assert.equal((await handler(request({action:'sync',roomId}))).status,200);assert.equal(updates[0][2].permission.canPublish,false);assert.equal(updates[0][2].permission.canSubscribe,true);
    assert.equal((await handler(request({action:'release',roomId,targetId:b}))).status,403);
  });
});
test('a committed restriction survives a voice outage without duplicate punishment',async()=>{
  let failed=false;
  await run(async url=>{
    const permitted=access(url);if(permitted)return permitted;
    if(url.includes('claim_voice_lounge_interaction'))return result({ticket:'ticket',message_id:1,speaker_id:a,text:'攻撃',members,topic:'책',recent:[]});
    if(url.endsWith('/responses'))return result(output({...raw,moderation:'restrict',reason:'threat',target_id:null,question:null}));
    if(url.includes('finish_voice_lounge_interaction'))return result({moderation:'restrict',warnings:1});
    if(url.includes('pending_voice_lounge_voice_sync'))return result([{user_id:b,speaking_restricted_until:'2099-01-01',safety_updated_at:'2026-10-03'}]);
    if(url.includes('fail_voice_lounge_interaction')){failed=true;throw new Error('Should not re-open a committed decision');}
    throw new Error('Unexpected');
  },async handler=>{const response=await handler(request({action:'review',roomId}));assert.equal(response.status,200);assert.equal((await response.json()).voiceSyncPending,true);assert.equal(failed,false);},true);
});
