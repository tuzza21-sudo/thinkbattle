import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const port = process.env.LOUNGE_CDP_PORT || 9241;
const base = process.env.LOUNGE_PREVIEW_URL || 'http://127.0.0.1:5191';
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('5191'));
if (!target) throw new Error('Open the local lounge in a Chrome CDP tab first.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map(), errors = [], paidRequests = [];
const openRooms = [
  { id: 'lounge-00000000-0000-4000-8000-000000000001', topic: '영화 호프를 보고 남은 이야기', host_persona: 'ina', theme: 'hotel', capacity: 4, status: 'lobby', participant_count: 2 },
  { id: 'lounge-00000000-0000-4000-8000-000000000002', topic: '여행과 산행에서 만난 멋진 풍경', host_persona: 'dodi', theme: 'forest', capacity: 6, status: 'active', participant_count: 3 },
  { id: 'lounge-00000000-0000-4000-8000-000000000003', topic: '한 번 더 가고 싶은 맛집과 먹거리', host_persona: 'jaeseok', theme: 'rooftop', capacity: 2, status: 'lobby', participant_count: 2 },
];
let roomResponse = openRooms, roomResponseCode = 200;
socket.addEventListener('message', event => {
  const result = JSON.parse(event.data);
  if (result.method === 'Fetch.requestPaused') {
    void send('Fetch.fulfillRequest', { requestId: result.params.requestId, responseCode: roomResponseCode, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from(JSON.stringify(roomResponse)).toString('base64') }).catch(error => errors.push(error.message));
  }
  if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.exception?.description || result.params.exceptionDetails.text);
  if (result.method === 'Network.requestWillBeSent' && /\/api\/(lounge|livekit-token)/.test(result.params.request.url)) paidRequests.push(result.params.request.url);
  if (!result.id) return;
  const entry = pending.get(result.id); pending.delete(result.id);
  if (result.error) entry.reject(new Error(JSON.stringify(result.error))); else entry.resolve(result.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); };
const type = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const directory = 'node_modules/.cache/lounge-artifacts'; await fs.mkdir(directory, { recursive: true });
const screenshot = async name => { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await fs.writeFile(`${directory}/${name}.png`, Buffer.from(result.data, 'base64')); };
await send('Runtime.discardConsoleEntries'); await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*/rest/v1/rpc/list_open_voice_lounges*', requestStage: 'Request' }] });
try {
  await send('Page.navigate', { url: `${base}/lounge` });
  await waitFor("document.querySelectorAll('.lounge-open-card').length===3");
  assert.equal(await evaluate("document.querySelectorAll('.lounge-open-card a').length"), 2, 'full rooms cannot be joined from the list');
  assert.equal(await evaluate("document.querySelector('.lounge-open-card a').getAttribute('href')"), `/lounge/${openRooms[0].id}`);
  roomResponse = [];
  await evaluate("document.querySelector('.lounge-rooms-refresh').click()");
  await waitFor("document.querySelector('.lounge-rooms-empty a')!==null");
  roomResponseCode = 503;
  await evaluate("document.querySelector('.lounge-rooms-refresh').click()");
  await waitFor("document.querySelector('.lounge-open-rooms [role=alert]')!==null");
  roomResponseCode = 200; roomResponse = openRooms;
  await evaluate("document.querySelector('.lounge-rooms-refresh').click()");
  await waitFor("document.querySelectorAll('.lounge-open-card').length===3");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${base}/lounge` });
    await waitFor("document.querySelectorAll('.lounge-host-option').length===4");
    await waitFor("document.querySelectorAll('.lounge-open-card').length===3");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `lobby overflow at ${width}`);
    assert.equal(await evaluate("document.querySelector('.lounge-lobby').firstElementChild.className"), 'lounge-hero');
    assert.equal(await evaluate("document.querySelector('.lounge-hero').nextElementSibling.className"), 'lounge-open-rooms');
    assert.equal(await evaluate("document.querySelector('.lounge-invite')===null"), true);
    assert.equal(await evaluate("document.querySelector('.lounge-selections .lounge-section-title span').textContent"), '01 · TALK ABOUT');
    assert.match(await evaluate("document.querySelector('.lounge-topic-options').textContent"), /여행과 산행 풍경/);
    assert.match(await evaluate("document.querySelector('.lounge-topic-options').textContent"), /먹거리와 맛집/);
    assert.equal(await evaluate("document.querySelectorAll('.lounge-theme-options button').length"), 6);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-theme-options')).gridTemplateColumns.split(' ').length"), width > 600 ? 3 : 2, 'three scenery cards per desktop row; readable mobile cards');
    assert.equal(await evaluate("document.querySelectorAll('.lounge-host-option .lounge-host-photo img').length"), 4);
    assert.equal(await evaluate("(async()=>{const images=[...document.querySelectorAll('.lounge-host-option .lounge-host-photo img')];await Promise.all(images.map(i=>i.decode()));return images.every(i=>i.naturalWidth===512);})()"), true, 'four generated portraits load');
    assert.equal(await evaluate("document.querySelectorAll('.lounge-voice-preview').length"), 4);
    assert.equal(await evaluate("(async()=>{const i=document.querySelector('.lounge-hero-visual img');await i.decode();return i.naturalWidth>=1200;})()"), true, 'club lounge hero photo loads');
    assert.equal(await evaluate("document.querySelector('.lounge-hero h1').textContent"), '문득 사람과의 대화가 하고 싶은 순간이 찾아올 때...');
    assert.equal(await evaluate("document.querySelector('.lounge-hero-visual').offsetWidth===document.querySelector('.lounge-hero').clientWidth"), true, 'photo covers the hero');
    assert.equal(await evaluate("[...document.querySelectorAll('.lounge-host-option .lounge-host-photo')].every(p=>p.getBoundingClientRect().width>=104)"), true, 'enlarged host portraits');
    assert.equal(await evaluate("document.querySelectorAll('.lounge-host-option strong')[3].textContent"), '발랄한 진행자');
    await screenshot(`lobby-${width}`);
    await send('Page.navigate', { url: `${base}/lounge/preview?host=ina&capacity=6` });
    await waitFor("document.querySelectorAll('.lounge-seat').length===6");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `room overflow at ${width}`);
    assert.equal(await evaluate("document.querySelectorAll('.lounge-seat.occupied').length"), 3);
    assert.match(await evaluate("document.querySelector('.lounge-preview-notice').textContent"), /실제 참가자/);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-chat-panel')).display"), 'none', 'journal starts collapsed');
    assert.ok(await evaluate("document.querySelector('.lounge-scene').getBoundingClientRect().height") >= (width > 800 ? 650 : width > 600 ? 590 : 540), 'immersive scenery height');
    assert.equal(await evaluate("(()=>{const face=document.querySelector('.lounge-seat-avatar').getBoundingClientRect(),scene=document.querySelector('.lounge-scene').getBoundingClientRect(),intro=document.querySelector('.lounge-scene-intro').getBoundingClientRect();return face.top<scene.bottom&&face.top>intro.bottom+8;})()"), true, 'portraits overlap the softened lower scenery without covering its caption');
    await screenshot(`room-${width}`);
    const sceneWidth = await evaluate("document.querySelector('.lounge-scene').getBoundingClientRect().width");
    const scrollBefore = await evaluate('scrollY');
    await evaluate("document.querySelector('.lounge-records-tab').click()");
    await waitFor("document.querySelector('.lounge-records-tab').getAttribute('aria-expanded')==='true'");
    assert.equal(await evaluate('scrollY'), scrollBefore, 'records open without scrolling away from the scenery');
    assert.equal(await evaluate("document.querySelector('.lounge-scene').getBoundingClientRect().width"), sceneWidth, 'records do not resize the view');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-chat-panel')).position"), 'fixed');
    await waitFor("(()=>{const b=document.querySelector('.lounge-chat-panel').getBoundingClientRect();return b.right<=innerWidth+1&&b.left>=-1&&b.top>=-1&&b.bottom<=innerHeight+1;})()");
    assert.equal(await evaluate("document.activeElement===document.querySelector('.lounge-chat-panel')"), true);
    assert.ok(await evaluate("document.querySelectorAll('.lounge-chat-log article').length")>0, 'shared messages are visible');
    await screenshot(`records-${width}`);
    await evaluate("document.querySelector('.lounge-chat-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.equal(await evaluate("document.activeElement===document.querySelector('.lounge-records-tab')"), true, 'closing restores the side tab focus');
  }
  await send('Page.navigate', { url: `${base}/lounge` });
  await waitFor("document.querySelectorAll('.lounge-voice-preview').length===4");
  for (const file of ['host-witty-v1', 'host-empathetic-v1', 'host-lively-v1', 'host-bubbly-v1']) {
    const duration = await evaluate(`new Promise((resolve,reject)=>{const a=new Audio('/lounge/${file}.mp3');a.onloadedmetadata=()=>resolve(a.duration);a.onerror=()=>reject(new Error('voice sample did not load'));a.load();})`);
    assert.ok(duration > 3 && duration < 45, 'short Korean voice sample decodes');
  }
  await evaluate("window.hostSampleAudio=[];window.originalHostAudio=window.Audio;window.Audio=function(...args){const a=new window.originalHostAudio(...args);window.hostSampleAudio.push(a);return a;}");
  await send('Runtime.evaluate', { expression: "document.querySelectorAll('.lounge-voice-preview')[0].click()", userGesture: true });
  await waitFor("window.hostSampleAudio.length===1 && !window.hostSampleAudio[0].paused");
  await send('Runtime.evaluate', { expression: "document.querySelectorAll('.lounge-voice-preview')[1].click()", userGesture: true });
  await waitFor("window.hostSampleAudio.length===2 && !window.hostSampleAudio[1].paused");
  assert.equal(await evaluate("window.hostSampleAudio[0].paused"), true, 'starting another style stops the previous sample');
  assert.equal(await evaluate("document.querySelectorAll('.lounge-voice-preview[aria-pressed=true]').length"), 1);
  await evaluate("document.querySelector('.lounge-preview-button').click()");
  await waitFor("document.querySelector('.lounge-room-main')!==null");
  assert.equal(await evaluate("window.hostSampleAudio[1].paused"), true, 'leaving the choices stops sample playback');
  assert.match(await evaluate("document.querySelector('.lounge-moderator-avatar img').getAttribute('src')"), /host-witty-v2/);
  await evaluate("window.Audio=window.originalHostAudio");
  for (const [theme, asset] of [['rooftop', 'rooftop-city-v2'], ['river', 'river-v1'], ['forest', 'forest-v1'], ['hotel', 'hotel-lounge-v1'], ['cafe', 'rainy-cafe-v1'], ['seaside', 'seaside-terrace-v1']]) {
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height:1000, deviceScaleFactor:1, mobile:false });
      await send('Page.navigate', {url:`${base}/lounge/preview?capacity=4&theme=${theme}`});
      await waitFor("document.querySelector('.lounge-room-main')!==null");
      assert.equal(await evaluate("document.querySelector('.lounge-room-main').dataset.theme"), theme);
      assert.match(await evaluate("getComputedStyle(document.querySelector('.lounge-scene'),'::before').backgroundImage"), new RegExp(asset+'\\.webp'));
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate(`(async()=>{const image=new Image();image.src='/lounge/${asset}.webp';await image.decode();return image.naturalWidth>1000;})()`), true, 'background loads');
      await screenshot(`theme-${theme}-${width}`);
    }
  }
  for (const capacity of [1, 2, 3, 4, 5, 6]) {
    for (const width of [320, 390, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height:1000, deviceScaleFactor:1, mobile:false });
      await send('Page.navigate', { url:`${base}/lounge/preview?capacity=${capacity}` });
      await waitFor(`document.querySelectorAll('.lounge-seat').length===${capacity}`);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `capacity ${capacity} overflow at ${width}`);
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.lounge-seat-avatar')).every(el=>el.getBoundingClientRect().width>=80)"), true, 'portraits remain readable');
    }
  }
  await send('Page.navigate', { url: `${base}/lounge/preview?capacity=4` });
  await waitFor("document.querySelector('.lounge-moderator.speaking')!==null");
  await waitFor("document.querySelector('.lounge-seat.speaking')!==null");
  assert.match(await evaluate("document.querySelector('.lounge-seat.speaking').textContent"), /지금 이야기 중/);
  await evaluate("document.querySelector('.lounge-on-air button').click()");
  await waitFor("document.querySelectorAll('.lounge-seat.speaking,.lounge-moderator.speaking').length===0");
  await evaluate("document.querySelector('.lounge-avatar-toggle').click()");
  await waitFor("document.querySelectorAll('.lounge-avatar-picker button').length===6");
  await evaluate("document.querySelectorAll('.lounge-avatar-picker button')[4].click()");
  await waitFor("document.querySelector('.lounge-avatar-picker')===null");
  assert.equal(await evaluate("document.querySelector('.lounge-seat.self .lounge-portrait-sprite').style.left"), '-100%');
  assert.equal(await evaluate("document.querySelector('.lounge-seat.self .lounge-portrait-sprite').style.transform"), 'translateY(-50%)');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate("document.querySelector('.lounge-on-air button').click()");
  await waitFor("document.querySelector('.lounge-seat.speaking,.lounge-moderator.speaking')!==null");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-voice-bars.active i')).animationName"), 'none');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Page.navigate', { url: `${base}/lounge` });
  await waitFor("document.querySelectorAll('.lounge-host-option').length===4");
  await evaluate("document.querySelectorAll('.lounge-host-option')[1].click(); document.querySelectorAll('.lounge-capacities button')[5].click(); document.querySelectorAll('.lounge-theme-options button')[1].click()");
  assert.match(await evaluate("document.querySelector('.lounge-builder-host strong').textContent"), /공감하는 진행자/);
  await type('.lounge-custom-topic input', '퇴근 후 나만의 작은 즐거움');
  await evaluate("document.querySelector('.lounge-preview-button').click()");
  await waitFor("document.querySelector('.lounge-room-main')!==null");
  assert.equal(await evaluate('location.pathname'), '/lounge/preview');
  assert.equal(await evaluate("document.querySelector('.lounge-room-main').dataset.theme"), 'river', 'selected theme survives preview navigation');
  assert.match(await evaluate("document.querySelector('.lounge-table-topic h2').textContent"), /퇴근 후/);
  assert.equal(await evaluate("document.querySelectorAll('.lounge-seat').length"), 6);
  await evaluate("scrollTo(0,0); document.querySelector('.lounge-journal-toggle').click()");
  await waitFor("document.querySelector('.lounge-journal-toggle').getAttribute('aria-expanded')==='true'");
  assert.equal(await evaluate("(()=>{const r=document.querySelector('.lounge-chat-panel').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()"), true, 'opening records brings them into view');
  await evaluate("document.querySelector('.lounge-journal-close').click()");
  await evaluate("document.querySelector('.lounge-write-button').click()");
  assert.equal(await evaluate("document.activeElement === document.querySelector('.lounge-chat-form input')"), true, 'writing opens and focuses input');
  await type('.lounge-chat-form input', '작성 중인 이야기');
  await evaluate("document.querySelector('.lounge-journal-close').click()");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-chat-panel')).display"), 'none');
  assert.equal(await evaluate("document.activeElement === document.querySelector('.lounge-journal-toggle')"), true, 'closing restores focus');
  await evaluate("document.querySelector('.lounge-write-button').click()");
  assert.equal(await evaluate("document.querySelector('.lounge-chat-form input').value"), '작성 중인 이야기', 'draft survives collapse');
  await evaluate("document.querySelector('.lounge-chat-form input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('.lounge-journal-toggle').getAttribute('aria-expanded')"), 'false');
  await evaluate("document.querySelector('.lounge-write-button').click()");
  for (const text of ['퇴근 후 산책하면 기분이 좋아요', '친구와 맛있는 음식을 먹었어요']) {
    const count = await evaluate("document.querySelectorAll('.lounge-chat-log article').length");
    await type('.lounge-chat-form input', text);
    await evaluate("document.querySelector('.lounge-chat-form button').click()");
    await waitFor(`document.querySelectorAll('.lounge-chat-log article').length===${count + 2}`);
    assert.match(await evaluate("document.querySelector('.lounge-chat-log article:last-child p').textContent"), /기억에 남는 순간/);
  }
  await send('Page.navigate', { url: `${base}/lounge` });
  await waitFor("document.querySelectorAll('.lounge-capacities button').length===6");
  await evaluate("document.querySelector('.lounge-capacities button').click()");
  assert.match(await evaluate("document.querySelector('.lounge-primary').textContent"), /1:1/);
  assert.match(await evaluate("document.querySelector('.lounge-builder-footnote').textContent"), /입장하면 음성과 마이크/);
  await evaluate("document.querySelector('.lounge-preview-button').click()");
  await waitFor("document.querySelectorAll('.lounge-seat').length===1");
  assert.match(await evaluate("document.querySelector('.lounge-stage-label').textContent"), /AI와 1:1/);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'solo overflow');
  await evaluate("document.querySelector('.lounge-write-button').click()");
  await type('.lounge-chat-form input', '영화 보고 기분이 좋아졌어요');
  await evaluate("document.querySelector('.lounge-chat-form button').click()");
  await waitFor("document.querySelectorAll('.lounge-chat-log article').length===3");
  assert.doesNotMatch(await evaluate("document.querySelector('.lounge-chat-log article:last-child p').textContent"), /다른 분들/);
  await screenshot('solo-room-320');
  await send('Page.navigate', { url: `${base}/` });
  await waitFor("location.pathname==='/lounge' && document.querySelector('.lounge-account')!==null");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'home overflow');
  await screenshot('lounge-home-320');
  await evaluate("document.querySelector('.lounge-account-signup').click()");
  await waitFor("document.querySelector('.auth-mode-tabs button.active')?.textContent.includes('가입')");
  assert.equal(await evaluate("document.querySelector('input[type=checkbox]')!==null"), true, 'signup opens directly');
  await evaluate("document.querySelector('.auth-modal-header .icon-button').click()");
  await waitFor("document.querySelector('.auth-modal')===null");
  await evaluate("[...document.querySelectorAll('.lounge-account button')].find(b=>b.textContent==='로그인').click()");
  await waitFor("document.querySelector('.auth-mode-tabs button.active')?.textContent.includes('로그인')");
  await evaluate("document.querySelector('.auth-modal-header .icon-button').click()");
  assert.deepEqual(errors, []);
  assert.deepEqual(paidRequests, []);
  console.log('PASS: 320–1440px, full photo hero, 1–6 seats with blended scenery, right-side records/focus/draft/Escape, speaker effects, avatars, reduced motion, repeated preview conversations, no paid preview requests or runtime errors.');
} finally { await send('Fetch.disable'); socket.close(); }
