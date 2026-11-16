const tabs = await (await fetch('http://127.0.0.1:9237/json')).json();
const socket = new WebSocket(tabs.find(tab => tab.type === 'page' && tab.url.includes('home-ui-check')).webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)(data.result); pending.delete(data.id); } });
const send = (method, params) => new Promise(resolve => { const next = ++id; pending.set(next, resolve); socket.send(JSON.stringify({ id: next, method, params })); });
function audit() {
  const parse = color => (color.match(/[\d.]+/g) ?? []).map(Number);
  const blend = (front, back) => front.slice(0,3).map((v,i) => v*(front[3] ?? 1) + back[i]*(1-(front[3] ?? 1)));
  const lum = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i], 0);
  const failures = [];
  for (const el of document.querySelectorAll('.thinkfit-home *')) {
    if (!el.getBoundingClientRect().width || ![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) || el.closest('button:disabled')) continue;
    const style = getComputedStyle(el);
    const ancestors = []; let current = el;
    while(current) { ancestors.unshift(current); current = current.parentElement; }
    if(ancestors.some(node => +getComputedStyle(node).opacity < 1)) continue;
    let bg = [255,255,255];
    for (const node of ancestors) bg = blend(parse(getComputedStyle(node).backgroundColor),bg);
    const fg = blend(parse(style.color), bg);
    const ratio = (Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
    const size = parseFloat(style.fontSize);
    const required = size >= 24 || (size >= 18.66 && parseFloat(style.fontWeight) >= 700) ? 3 : 4.5;
    if (ratio < required) failures.push({ cls: String(el.className), tag: el.tagName, text: el.textContent.trim().slice(0,40), fg: style.color, bg: bg.map(Math.round), ratio: +ratio.toFixed(2), size });
  }
  return failures;
}
for (const page of ['gateway', 'debate', 'simulation']) {
  await send('Page.navigate', { url: 'http://127.0.0.1:5187/home-ui-check.html?page=' + page });
  await new Promise(resolve => setTimeout(resolve, 1000));
  const result = await send('Runtime.evaluate', { expression: `(${audit.toString()})()`, returnByValue: true });
  console.log(page, JSON.stringify(result.result.value));
}
socket.close();
