// Test actual browser Web Audio playback with synthetic PCM; no paid API calls.
import assert from 'node:assert/strict';
const port = process.env.LOUNGE_CDP_PORT || 9242;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('5191'));
assert.ok(target, 'Open the local lounge on port 5191 in a CDP browser');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const task = pending.get(message.id); pending.delete(message.id);
  if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
});
const send = (method, params) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
try {
  const response = await send('Runtime.evaluate', { userGesture: true, awaitPromise: true, returnByValue: true, expression: `(async () => {
    const { Pcm16Decoder, PcmAudioQueue, readLoungeStream } = await import('/src/lib/loungeStream.ts?check=' + Date.now());
    const context = new AudioContext({sampleRate: 24000}); await context.resume();
    const decoder = new Pcm16Decoder();
    const queue = new PcmAudioQueue(context, [context.destination]);
    const encoder = new TextEncoder();
    let upstream, firstScheduled = false, firstEnded = false, completed = false;
    const createSource = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const source = createSource(); source.addEventListener('ended', () => { firstEnded = true; }); return source;
    };
    const bytes = new Uint8Array(24000); // 500 ms at 24 kHz PCM16.
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < 12000; index++) view.setInt16(index * 2, Math.sin(index * 2 * Math.PI * 440 / 24000) * 1000, true);
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    const stream = new ReadableStream({ start(controller) { upstream = controller; } });
    const consuming = (async () => {
      for await (const event of readLoungeStream(stream)) {
        if (event.type === 'audio') {
          const binary = atob(event.audio);
          queue.push(decoder.decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
          firstScheduled = true;
        }
        if (event.type === 'done') completed = true;
      }
      decoder.finish(); queue.finish(); await queue.drain();
    })();
    upstream.enqueue(encoder.encode(JSON.stringify({ type: 'audio', audio: btoa(binary) }) + '\\n'));
    await new Promise(resolve => setTimeout(resolve, 800));
    const playedBeforeComplete = firstScheduled && firstEnded && !completed;
    upstream.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\\n')); upstream.close();
    await consuming; queue.stop(); await context.close();
    const abort = new AbortController(); let cancelled = false;
    const blocked = new ReadableStream({ cancel() { cancelled = true; } });
    const wait = (async () => { try { for await (const event of readLoungeStream(blocked, abort.signal)) void event; } catch {} })();
    abort.abort(); await wait;
    // Render a deliberately nonzero onset: a hard start would jump by 0.5.
    const offline = new OfflineAudioContext(1, 24000, 24000);
    const smooth = new PcmAudioQueue(offline, [offline.destination]);
    smooth.push(new Float32Array(9600).fill(.5));
    smooth.push(new Float32Array(2400).fill(.5)); smooth.finish();
    const rendered = (await offline.startRendering()).getChannelData(0);
    let biggestStep = 0;
    for (let index=1; index<rendered.length; index++) biggestStep=Math.max(biggestStep,Math.abs(rendered[index]-rendered[index-1]));
    const join = Math.round(.51 * 24000);
    const smoothEdges = biggestStep < .006 && rendered[0]===0 && rendered.at(-1)===0;
    const continuousJoin = rendered[join-1]===.5 && rendered[join]===.5 && rendered[join+1]===.5;
    smooth.stop();
    // Reproduce slow onset delivery using real audio-clock pauses at 200/360 ms.
    const jitterContext = new OfflineAudioContext(1, 28800, 24000);
    const starts = [], nativeSource = jitterContext.createBufferSource.bind(jitterContext);
    jitterContext.createBufferSource = () => {
      const source = nativeSource(), start = source.start.bind(source);
      source.start = time => { starts.push(time); start(time); };
      return source;
    };
    const jitterQueue = new PcmAudioQueue(jitterContext, [jitterContext.destination]);
    const original = Float32Array.from({length:12000},(_,i)=>i/24000);
    const startupHeld = !jitterQueue.push(original.slice(0,2400));
    const pauses = [.2,.36,.5].map(time=>jitterContext.suspend(time));
    const rendering = jitterContext.startRendering();
    await pauses[0];
    const secondHeld = !jitterQueue.push(original.slice(2400,4800)) && starts.length===0;
    void jitterContext.resume(); await pauses[1];
    jitterQueue.push(original.slice(4800,9600));
    void jitterContext.resume(); await pauses[2];
    jitterQueue.push(original.slice(9600)); jitterQueue.finish();
    void jitterContext.resume();
    const jitterAudio = (await rendering).getChannelData(0), onset = Math.round(starts[0]*24000);
    let biggestError = 0;
    for(let i=240;i<original.length-240;i++) biggestError=Math.max(biggestError,Math.abs(jitterAudio[onset+i]-original[i]));
    const intactOnset = startupHeld && secondHeld && biggestError<.00001;
    jitterQueue.stop();
    if (!intactOnset) throw new Error(JSON.stringify({startupHeld,secondHeld,biggestError,starts,onset,firstActual:jitterAudio[onset+240],firstExpected:original[240]}));
    return { playedBeforeComplete, completed, cancelled, smoothEdges, continuousJoin, intactOnset };
  })()` });
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  assert.deepEqual(response.result.value, { playedBeforeComplete: true, completed: true, cancelled: true, smoothEdges:true, continuousJoin:true, intactOnset:true });
  console.log('PASS: real Web Audio preserves the onset under delayed packets without duplicate samples or gaps; streaming and cancellation remain intact.');
} finally { socket.close(); }
