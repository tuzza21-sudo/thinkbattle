import fs from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9237/json')).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('home-ui-check'));
if (!target) throw new Error('Preview tab missing');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  if (!data.id) return;
  const entry = pending.get(data.id);
  pending.delete(data.id);
  if (data.error) entry.reject(new Error(JSON.stringify(data.error))); else entry.resolve(data.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async expression => {
  for (let count = 0; count < 70; count++) { if (await evaluate(expression)) return; await delay(150); }
  throw new Error('Timed out: ' + expression);
};
const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(150); };
const dir = 'node_modules/.cache/thinkfit-ui-artifacts';
await fs.mkdir(dir, { recursive: true });
const screenshot = async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(`${dir}/${name}.png`, Buffer.from(shot.data, 'base64')); };
const layout = async name => {
  const result = await evaluate(`(() => {
    const overflow = [...document.querySelectorAll('.thinkfit-home *')].filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && s.position !== 'fixed' && (r.right > innerWidth + 1 || r.left < -1); }).map(el => ({ tag: el.tagName, cls: el.className, width: el.getBoundingClientRect().width, text: el.textContent.slice(0, 40) })).slice(0, 12);
    return { viewport: innerWidth, width: document.documentElement.scrollWidth, overflow, bg: getComputedStyle(document.querySelector('.home-route')).backgroundColor, text: getComputedStyle(document.querySelector('h1')).color };
  })()`);
  console.log(name, JSON.stringify(result));
  if (result.width > result.viewport) throw new Error(name + ' has document overflow');
};
await send('Runtime.enable');
await send('Page.enable');
for (const width of [1440, 390, 768]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 900 : 1100, deviceScaleFactor: 1, mobile: width === 390 });
  for (const page of ['gateway', 'debate', 'simulation']) {
    await send('Page.navigate', { url: `http://127.0.0.1:5187/home-ui-check.html?page=${page}` });
    await waitFor(`document.querySelector(${JSON.stringify(page === 'gateway' ? '.training-gateway-card' : page === 'debate' ? '.debate-topic-card' : '.simulation-mission-card')}) !== null`);
    await delay(350);
    await layout(`${page}-${width}`);
    if (width !== 768) await screenshot(`${page}-${width}`);
    if (page === 'gateway' && width === 390) {
      await click('.training-gateway-account button');
      await waitFor("document.querySelector('.auth-modal') !== null");
      await screenshot('auth-390');
      await layout('auth-390');
      await evaluate("document.querySelector('.auth-mode-tabs button:last-child').click()");
      await waitFor("document.querySelectorAll('.form-field input').length === 4");
      await screenshot('signup-390');
    }
    if (page === 'debate') {
      await click('.debate-category-tabs button:nth-child(2)');
      await waitFor("document.querySelector('.debate-category-tabs button:nth-child(2)').classList.contains('active')");
      await click('.debate-topic-card');
      await waitFor("document.querySelector('.debate-briefing-panel') !== null");
      await delay(450);
      await layout(`briefing-${width}`);
      if (width !== 768) await screenshot(`briefing-${width}`);
      await click('.debate-setting-option:nth-child(2)');
      if (!await evaluate("document.querySelector('.debate-setting-option:nth-child(2)').classList.contains('active')")) throw new Error('Stance selection failed');
      await click('.debate-home-primary');
      await waitFor("document.querySelector('.debate-setup-modal') !== null");
      await layout(`setup-${width}`);
      if (width !== 768) await screenshot(`setup-${width}`);
      await click('.setup-choice-grid.two button:nth-child(2)');
      await waitFor("document.querySelector('.setup-choice-grid.two button:nth-child(2)').classList.contains('selected')");
      await click('.debate-modal-head .icon-button');
    }
    if (page === 'simulation') {
      const before = await evaluate("document.querySelector('.simulation-mission-card h3').textContent");
      await click('.simulation-category-card:nth-child(2)');
      await waitFor("document.querySelector('.simulation-category-card:nth-child(2)').classList.contains('selected')");
      const after = await evaluate("document.querySelector('.simulation-mission-card h3').textContent");
      if (before === after) throw new Error('Mission category did not change');
    }
  }
}
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html?page=debate' });
await waitFor("document.querySelector('.debate-home-primary') !== null");
await click('.community-entry-button');
await waitFor("document.querySelectorAll('.community-opinion-card').length === 6");
await layout('community-390');
await screenshot('community-390');
await click('.community-write-toggle');
await waitFor("document.querySelector('.community-composer textarea') !== null");
await layout('community-compose-390');
await screenshot('community-compose-390');
await click('.community-position-picker .negative');
if (!await evaluate("document.querySelector('.community-position-picker .negative').classList.contains('active')")) throw new Error('Opinion stance failed');
await click('.community-close-button');
await click('.debate-home-hero-actions button:last-child');
await waitFor("document.querySelector('.debate-room-card') !== null");
await layout('join-390');
await screenshot('join-390');
await click('.debate-modal-head .icon-button');
await click('.debate-home-profile');
await waitFor("document.querySelector('.auth-modal') !== null");
await layout('profile-390');
await screenshot('profile-390');
await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html?failGuest=1' });
await waitFor("document.querySelector('.training-gateway-card') !== null");
await click('.training-gateway-card');
await waitFor("document.querySelector('.home-guest-error') !== null");
if (!await evaluate("!document.querySelector('.training-gateway-card').disabled")) throw new Error('Guest retry disabled');
await layout('guest-error-390');
await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html' });
await waitFor("document.querySelector('.training-gateway-card') !== null");
await click('.training-gateway-card');
await waitFor("document.querySelector('.debate-home-page') !== null");
console.log('Guest navigation passed');
for (const route of ['/', '/debate', '/simulation']) {
  await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html?page=app&route=' + encodeURIComponent(route) });
  await waitFor("document.querySelector('.training-gateway-card,.live-gate-card') !== null");
  await layout('app-route-' + route);
  if (route === '/') {
    await click('.training-gateway-account button');
    await waitFor("document.querySelector('.auth-modal') !== null");
    const bg = await evaluate("getComputedStyle(document.querySelector('.auth-modal')).backgroundColor");
    if (bg !== 'rgb(255, 255, 255)') throw new Error('App auth modal theme failed');
  }
}
console.log('Uncaught browser errors:', JSON.stringify(errors));
if (errors.length) throw new Error('Browser errors');
socket.close();
