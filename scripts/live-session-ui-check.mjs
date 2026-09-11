import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const port = process.env.SESSION_CDP_PORT || 9238;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('live-session-preview'));
if (!target) throw new Error('Open the local session fixture in a Chrome CDP tab first.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map(), errors = [];
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  if (!data.id) return;
  const entry = pending.get(data.id); pending.delete(data.id);
  if (data.error) entry.reject(new Error(JSON.stringify(data.error))); else entry.resolve(data.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); };
const screenshot = async name => { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await fs.writeFile(`node_modules/.cache/session-${name}.png`, Buffer.from(result.data, 'base64')); };
const type = async (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await send('Runtime.enable'); await send('Page.enable');
try {
  for (const width of [1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/scripts/live-session-preview.html' });
    await waitFor("document.querySelectorAll('.flex-argument-log article').length === 4");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `overflow ${width}`);
    await screenshot(`live-${width}`);
  }
  await type('.flex-composer textarea', '첫 질문: 어떤 학습 효과를 측정하나요?');
  await evaluate("document.querySelector('.flex-composer form button').click()");
  await waitFor("document.querySelectorAll('.flex-argument-log article').length === 5");
  await type('.flex-composer textarea', '추가 질문: 평가 기준도 함께 공개하나요?');
  await evaluate("document.querySelector('.flex-composer form button').click()");
  await waitFor("document.querySelectorAll('.flex-argument-log article').length === 6");
  assert.equal(await evaluate("document.querySelector('.flex-current-session h2').textContent"), '찬성 교차질문');
  await type('.team-chat input', '반박에서는 평가 기준을 중심으로 이야기해요.');
  await evaluate("document.querySelector('.team-chat form button').click()");
  await waitFor("document.querySelectorAll('.team-chat-messages .own').length === 1");
  assert.equal(await evaluate("document.querySelectorAll('.flex-argument-log article').length"), 6);
  await evaluate("document.querySelector('.flex-controls button').click()");
  await waitFor("document.querySelector('.flex-timer span').textContent === '일시정지'");
  assert.equal(await evaluate("document.querySelector('.flex-composer form button').disabled"), true);
  await evaluate("document.querySelector('.flex-controls button').click()");
  await waitFor("document.querySelector('.flex-timer span').textContent === '남은 시간'");
  await evaluate("document.querySelector('.flex-controls button:last-child').click()");
  await waitFor("document.querySelector('.flex-current-session h2').textContent === '반대 교차질문'");
  await evaluate("document.querySelector('.flex-controls button:last-child').click()");
  await waitFor("document.querySelector('.flex-current-session').classList.contains('strategy')");
  assert.equal(await evaluate("document.querySelector('.flex-composer form button').disabled"), true);
  await screenshot('strategy-320');
  for (const width of [768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/scripts/live-session-preview.html?settings=1' });
    await waitFor("document.querySelector('.session-total') !== null");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `settings overflow ${width}`);
    assert.match(await evaluate("document.querySelector('.session-total').textContent"), /17분/);
    await evaluate("document.querySelector('.session-presets button').click()");
    await waitFor("document.querySelector('.session-total').textContent.includes('12분')");
    await evaluate("document.querySelector('.session-settings-heading input').click()");
    await waitFor("document.querySelectorAll('.session-time-inputs select').length === 8");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `detailed settings overflow ${width}`);
    await screenshot(`settings-${width}`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: mobile/desktop layouts, repeated cross exchanges, isolated team chat UI, pause/resume/next/strategy, presets and side-specific settings.');
} finally { socket.close(); }
