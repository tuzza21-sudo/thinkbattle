import fs from 'node:fs/promises';
const tabs = await (await fetch('http://127.0.0.1:9237/json')).json();
const socket = new WebSocket(tabs.find(tab => tab.type === 'page' && tab.url.includes('home-ui-check')).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)(data.result); pending.delete(data.id); } });
const send = (method, params) => new Promise(resolve => { const next = ++id; pending.set(next, resolve); socket.send(JSON.stringify({ id: next, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html?page=debate' });
await new Promise(resolve => setTimeout(resolve, 1500));
console.log('nav', await evaluate(`JSON.stringify([...document.querySelectorAll('.debate-home-nav button,.debate-home-brand div')].map(el=>({text:el.textContent, width:el.getBoundingClientRect().width,display:getComputedStyle(el).display,padding:getComputedStyle(el).padding,margin:getComputedStyle(el).margin})))`));
await evaluate("document.querySelector('.debate-home-primary').click()");
await new Promise(resolve => setTimeout(resolve, 1300));
console.log('modal', await evaluate(`JSON.stringify([...document.querySelectorAll('.modal-overlay,.modal-content,.icon-button')].map(el=>({cls:el.className,bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity,filter:getComputedStyle(el).filter,animation:getComputedStyle(el).animation,pseudoBg:getComputedStyle(el,'::before').backgroundColor})))`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('node_modules/.cache/thinkfit-ui-artifacts/setup-settled-390.png', Buffer.from(shot.data, 'base64'));
for (const width of [320, 1024]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 320 });
  for (const page of ['gateway', 'debate', 'simulation']) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html?page=' + page });
    await new Promise(resolve => setTimeout(resolve, 700));
    const result = await evaluate(`({ width: document.documentElement.scrollWidth, viewport: innerWidth })`);
    console.log(page + '-' + width, JSON.stringify(result));
    if (result.width > result.viewport) throw new Error('Page overflow');
  }
}
await send('Browser.close');
socket.close();
