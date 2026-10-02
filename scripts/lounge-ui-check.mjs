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
socket.addEventListener('message', event => {
  const result = JSON.parse(event.data);
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
try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${base}/lounge` });
    await waitFor("document.querySelectorAll('.lounge-host-option').length===4");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `lobby overflow at ${width}`);
    await screenshot(`lobby-${width}`);
    await send('Page.navigate', { url: `${base}/lounge/preview?host=ina&capacity=6` });
    await waitFor("document.querySelectorAll('.lounge-seat').length===6");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `room overflow at ${width}`);
    assert.equal(await evaluate("document.querySelectorAll('.lounge-seat.occupied').length"), 3);
    assert.match(await evaluate("document.querySelector('.lounge-preview-notice').textContent"), /실제 참가자/);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-chat-panel')).display"), 'none', 'journal starts collapsed');
    assert.equal(await evaluate("document.querySelector('.lounge-seats').getBoundingClientRect().top >= document.querySelector('.lounge-scene').getBoundingClientRect().bottom"), true, 'portraits stay below the view');
    await screenshot(`room-${width}`);
  }
  for (const theme of ['rooftop', 'river', 'forest']) {
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height:1000, deviceScaleFactor:1, mobile:false });
      await send('Page.navigate', {url:`${base}/lounge/preview?capacity=4&theme=${theme}`});
      await waitFor("document.querySelector('.lounge-room-main')!==null");
      assert.equal(await evaluate("document.querySelector('.lounge-room-main').dataset.theme"), theme);
      assert.match(await evaluate("getComputedStyle(document.querySelector('.lounge-scene'),'::before').backgroundImage"), new RegExp(theme+'-v1.webp'));
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate(`(async()=>{const image=new Image();image.src='/lounge/${theme}-v1.webp';await image.decode();return image.naturalWidth>1000;})()`), true, 'background loads');
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
  assert.match(await evaluate("document.querySelector('.lounge-builder-host strong').textContent"), /김이나/);
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
  console.log('PASS: 320–1440px, 1–6 seats, separated view and portraits, journal disclosure/focus/draft/Escape, speaker and host effects, avatars, reduced motion, repeated preview conversations, no paid preview requests or runtime errors.');
} finally { socket.close(); }
