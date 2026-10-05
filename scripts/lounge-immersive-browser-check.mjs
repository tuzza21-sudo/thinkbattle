// Check the actual preview UI without connecting microphones or paid APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const targets = await (await fetch(`http://127.0.0.1:${process.env.LOUNGE_CDP_PORT || 9258}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('5191'));
assert.ok(target, 'Open the lounge on port 5191 in a CDP browser');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map(), errors = [], requests = [];
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  if (data.method === 'Network.requestWillBeSent' && /\/api\/(lounge|livekit-token)/.test(data.params.request.url)) requests.push(data.params.request.url);
  if (!data.id) return;
  const task = pending.get(data.id); pending.delete(data.id);
  if (data.error) task.reject(new Error(JSON.stringify(data.error))); else task.resolve(data.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 40)); } throw new Error('Timed out: ' + expression); };
const artifacts = 'node_modules/.cache/lounge-artifacts';
await fs.mkdir(artifacts, { recursive: true });
const screenshot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(`${artifacts}/${name}.png`, Buffer.from(result.data, 'base64')); };
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  let cases = 0;
  for (const [width, height] of [[1440,900],[1280,720],[1024,768],[768,1024],[390,844],[375,667],[320,568],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const capacity of [1,6]) {
      await send('Page.navigate', { url: `http://127.0.0.1:5191/lounge/preview?theme=hotel&host=ina&capacity=${capacity}` });
      await waitFor(`document.querySelectorAll('.lounge-seat').length===${capacity}`);
      const dimensions = await evaluate(`(() => {
        const scene=document.querySelector('.lounge-scene').getBoundingClientRect();
        const host=document.querySelector('.lounge-moderator').getBoundingClientRect();
        const people=document.querySelector('.lounge-participant-roster').getBoundingClientRect();
        const topicOnTop=document.querySelector('.lounge-table-topic').getBoundingClientRect().bottom<=host.top+1;
        const controls=document.querySelector('.lounge-participant-controls');
        controls.scrollIntoView({block:'nearest'});
        const control=controls.getBoundingClientRect();
        const mic=document.querySelector('.lounge-mic-button'),hand=document.querySelector('.lounge-session-actions button[aria-label^="손"]');
        const actions=[...document.querySelectorAll('.lounge-room-top-actions button,.lounge-room-controls button,.lounge-session-actions button')].filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect());
        const queue=document.querySelector('.lounge-session-queue-summary')?.getBoundingClientRect();
        const inside=r=>r.top>=scene.top-1&&r.bottom<=scene.bottom+1&&r.left>=scene.left-1&&r.right<=scene.right+1;
        return { pageFits:document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth,
          controlsVisible:inside(control)&&actions.every(inside)&&(!queue||inside(queue)),hostVisible:inside(host),peopleOnRight:people.left>host.left,
          topicOnTop,controlsUnderProfiles:control.top>=document.querySelector('.lounge-participant-roster').getBoundingClientRect().bottom-1,
          controlsUnderSpeech:control.top>=document.querySelector('.lounge-participant-speech').getBoundingClientRect().bottom-1,
          micWithHands:!hand||(mic.parentElement===hand.parentElement&&Math.abs(mic.getBoundingClientRect().top-hand.getBoundingClientRect().top)<1),
          transparentMic:getComputedStyle(mic).backgroundColor==='rgba(0, 0, 0, 0)',
          noFooter:document.querySelector('.lounge-control-dock')===null&&document.querySelector('.lounge-scene>.lounge-participant-controls')===null,
          transparentPanels:[document.querySelector('.lounge-moderator'),controls,document.querySelector('.lounge-participant-speech')].every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),
          headingTransparent:getComputedStyle(document.querySelector('.lounge-scene-heading')).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.querySelector('.lounge-scene-heading')).backdropFilter==='none',
          localBlur:getComputedStyle(document.querySelector('.lounge-host-bubble')).backdropFilter.includes('blur')&&getComputedStyle(document.querySelector('.lounge-scene'),'::before').filter==='none',
          sceneHeight:scene.height,bodyHeight:document.querySelector('.lounge-conversation-space').getBoundingClientRect().height };
      })()`);
      assert.equal(dimensions.pageFits, true, `page overflow at ${width}x${height}/${capacity}: ${JSON.stringify(dimensions)}`);
      if (!dimensions.controlsVisible) await screenshot('mobile-density-failure');
      assert.equal(dimensions.controlsVisible, true, `controls clipped at ${width}x${height}/${capacity}: ${JSON.stringify(dimensions)}`);
      if (width > 760) {
        assert.equal(dimensions.hostVisible, true, `host clipped at ${width}x${height}/${capacity}: ${JSON.stringify(dimensions)}`);
        assert.equal(dimensions.peopleOnRight, true);
      } else {
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-conversation-space')).overflowY"),'hidden');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-host-bubble')).overflowY"),'visible', 'the full speech reads naturally without a nested scrollbar');
      }
      const scrollResult = await evaluate(`(() => {
        const roster=document.querySelector('.lounge-participant-roster'),controls=document.querySelector('.lounge-participant-controls'),log=document.querySelector('.lounge-participant-log');
        const before=[roster.getBoundingClientRect().top,controls.getBoundingClientRect().top];
        const filler=document.createElement('p');filler.textContent='긴 대화 내용 '.repeat(500);log.append(filler);log.scrollTo(0,10000);
        const result={scrolled:log.scrollTop>0,fixed:before.every((value,index)=>Math.abs(value-[roster.getBoundingClientRect().top,controls.getBoundingClientRect().top][index])<1),height:log.clientHeight};
        filler.remove();log.scrollTo(0,0);return result;
      })()`);
      assert.equal(scrollResult.scrolled,true,'the conversation itself must scroll');
      assert.equal(scrollResult.fixed,true,'profiles and microphone controls moved while the conversation scrolled');
      if(scrollResult.height<=40) await screenshot('conversation-density-failure');
      assert.ok(scrollResult.height>40,`conversation compressed at ${width}x${height}/${capacity}: ${JSON.stringify(scrollResult)}`);
      assert.equal(dimensions.topicOnTop, true);
      assert.equal(dimensions.controlsUnderProfiles,true,'microphone and hands sit below the participant profiles');
      assert.equal(dimensions.controlsUnderSpeech,true,'controls sit below the speech pane');
      assert.equal(await evaluate("document.querySelector('.lounge-participant-log .lounge-session-heading,.lounge-participant-log .lounge-session-current,.lounge-participant-log .lounge-session-queue-summary,.lounge-participant-log .lounge-session-panel h3')"),null,'conversation repeats the stage or turn indicators');
      assert.ok(await evaluate("document.querySelector('.lounge-participant-speech').getBoundingClientRect().left<=document.querySelector('.lounge-moderator').getBoundingClientRect().left"),'desktop conversation must use the space below all profiles too');
      assert.equal(dimensions.micWithHands,true,'microphone and hands share one action row');
      assert.equal(dimensions.transparentMic,true,'microphone button stays transparent');
      assert.equal(dimensions.noFooter,true,'no bottom control box remains');
      assert.equal(dimensions.transparentPanels,true,'speech and controls have transparent backgrounds');
      assert.equal(dimensions.headingTransparent, true, 'the header no longer has a dark glass box');
      assert.equal(dimensions.localBlur, true);
      await evaluate('scrollTo(0,10000)');
      assert.equal(await evaluate('scrollY'), 0, 'the scenery cannot be scrolled away');
      assert.equal(await evaluate("document.querySelector('.lounge-stage-composer,.lounge-write-button')"), null, 'text entry was removed');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"발언 대기 명단\"]')!==null"), capacity > 1, 'group queues stay visible without expanding the guidance');
      assert.equal(await evaluate("document.querySelectorAll('.lounge-participant-log article').length"),capacity>1?2:0,'recent participant speech is visible without opening records');
      if(capacity>1) {
        assert.equal(await evaluate("document.querySelector('.lounge-session-actions button').textContent"),'말하기','speaking must be the first action');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.lounge-session-actions button')).backgroundColor"),'rgb(255, 223, 101)','speaking must be emphasized');
      }
      if ([1440,390,320].includes(width)) await screenshot(`immersive-${capacity}-${width}`);
      cases++;
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width:320, height:568, deviceScaleFactor:1, mobile:false });
  await send('Page.navigate', { url:'http://127.0.0.1:5191/lounge/preview?theme=hotel&capacity=6' });
  await waitFor("document.querySelectorAll('.lounge-seat').length===6");
  await waitFor("document.querySelector('[aria-label=\"발언 효과 미리보기 일시정지\"]')!==null");
  await evaluate("document.querySelector('[aria-label=\"발언 효과 미리보기 일시정지\"]').click()");
  for(let i=0;i<2;i++) {
    await waitFor("!document.querySelector('[aria-label=\"다음 분께 차례 넘기기\"]').disabled");
    await evaluate("document.querySelector('[aria-label=\"다음 분께 차례 넘기기\"]').click()");
    await waitFor(`document.querySelectorAll('.lounge-seat')[${i+1}].classList.contains('has-floor')`);
  }
  await waitFor(`(() => {const strip=document.querySelector('.lounge-seats').getBoundingClientRect(),seat=document.querySelector('.lounge-seat.has-floor').getBoundingClientRect();return seat.left>=strip.left-1&&seat.right<=strip.right+1;})()`);
  assert.ok(await evaluate("document.querySelector('.lounge-seats').scrollLeft")>0,'current profile must follow a turn outside the visible strip');
  await send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  for (const theme of ['rooftop','river','forest','hotel','cafe','seaside']) {
    await send('Page.navigate', { url:`http://127.0.0.1:5191/lounge/preview?theme=${theme}&capacity=4` });
    await waitFor(`document.querySelector('.lounge-room-main')?.dataset.theme==='${theme}'`);
    assert.match(await evaluate("getComputedStyle(document.querySelector('.lounge-scene'),'::before').backgroundImage"), /\.webp/);
  }
  const before = await evaluate("document.querySelector('.lounge-scene').getBoundingClientRect().top");
  await evaluate("document.querySelector('.lounge-journal-toggle').click()");
  await waitFor("document.querySelector('.lounge-chat-panel').hidden===false");
  await evaluate("document.querySelector('.lounge-chat-log').scrollTo(0,10000)");
  assert.equal(await evaluate("document.querySelector('.lounge-scene').getBoundingClientRect().top"), before);
  await evaluate("document.querySelector('.lounge-chat-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await evaluate("document.activeElement===document.querySelector('.lounge-journal-toggle')"), true);
  await evaluate("document.querySelector('.lounge-session-actions button[aria-label^=\"손\"]').click()");
  await waitFor("document.querySelector('.lounge-session-actions button[aria-label=\"손 내리기\"]')!==null");
  assert.match(await evaluate("document.querySelector('.lounge-session-queue-summary').textContent"), /손들기 대기나/);
  await evaluate("document.querySelector('.lounge-session-actions button[aria-label^=\"손\"]').click()");
  await waitFor("document.querySelector('.lounge-session-actions button[aria-label=\"손 내리기\"]')===null");
  assert.equal(await evaluate('scrollY'), 0);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log(`PASS: ${cases} room layouts, six themes, transparent speech, profile-side controls and queues, visible participant speech, hand raise/lower and independent records scrolling; no paid calls.`);
} finally { socket.close(); }
