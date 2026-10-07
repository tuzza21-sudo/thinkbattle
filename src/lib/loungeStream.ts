import { LoungeApiError, loungeConnectionError } from './loungeApi';

export type LoungeStreamEvent =
  | { type: 'host'; text: string; timings: Record<string, number> }
  | { type: 'audio'; audio: string }
  | { type: 'done' }
  | { type: 'error'; error: string; code?: string; retryable?: boolean; retryAfterSeconds?: number };

// NDJSON frames may split anywhere, including inside a Korean UTF-8 character.
export async function* readLoungeStream(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const reader = stream.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const decoder = new TextDecoder();
  let pending = '', done = false;
  try {
    while (!done) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        if (newline > 256_000) throw new LoungeApiError('사회자 음성 응답이 올바르지 않아요.', 'lounge_invalid_stream');
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        if (!line.trim()) continue;
        let event: LoungeStreamEvent;
        try { event = JSON.parse(line); } catch { throw new LoungeApiError('사회자 음성 응답이 끊겼어요. 다시 시도해 주세요.', 'lounge_invalid_stream'); }
        if (!event || !['host', 'audio', 'done', 'error'].includes(event.type)) throw new LoungeApiError('사회자 음성 응답이 올바르지 않아요.', 'lounge_invalid_stream');
        if (event.type === 'error') throw new LoungeApiError(event.error, event.code, event.retryable !== false, event.retryAfterSeconds);
        if (event.type === 'audio' && typeof event.audio !== 'string') throw new LoungeApiError('사회자 음성 응답이 올바르지 않아요.', 'lounge_invalid_stream');
        yield event;
        if (event.type === 'done') { done = true; break; }
      }
      if (pending.length > 256_000) throw new LoungeApiError('사회자 음성 응답이 올바르지 않아요.', 'lounge_invalid_stream');
      if (chunk.done && !done) throw new LoungeApiError('사회자 음성 연결이 중간에 끊겼어요. 다시 시도해 주세요.', 'lounge_stream_interrupted');
    }
  } catch (error) { if (signal?.aborted) throw error; throw loungeConnectionError(error, '사회자 음성 서버'); }
  finally { signal?.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// PCM16 is mono, little endian, 24 kHz. Preserve an odd trailing byte across packets.
export class Pcm16Decoder {
  private trailing: number | undefined;
  decode(bytes: Uint8Array): Float32Array {
    const merged = this.trailing === undefined ? bytes : Uint8Array.from([this.trailing, ...bytes]);
    const count = Math.floor(merged.length / 2);
    const samples = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      const value = merged[index * 2] | merged[index * 2 + 1] << 8;
      samples[index] = (value >= 32768 ? value - 65536 : value) / 32768;
    }
    this.trailing = merged.length % 2 ? merged[merged.length - 1] : undefined;
    return samples;
  }
  finish() {
    if (this.trailing !== undefined) throw new LoungeApiError('사회자 음성 데이터가 중간에 끊겼어요.', 'lounge_invalid_audio');
  }
}

// Boost quiet TTS by 6 dB before both local playback and the shared LiveKit
// track. Compress loud peaks so the gain does not simply clip the waveform.
// `loudness` multiplies the boost for voices the speech model renders quietly.
export function createLoungeHostOutput(context: AudioContext, destinations: AudioNode[], loudness = 1) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(2 * loudness, context.currentTime);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-6, context.currentTime);
  compressor.knee.setValueAtTime(6, context.currentTime);
  compressor.ratio.setValueAtTime(12, context.currentTime);
  compressor.attack.setValueAtTime(0.003, context.currentTime);
  compressor.release.setValueAtTime(0.12, context.currentTime);
  gain.connect(compressor);
  destinations.forEach(destination => compressor.connect(destination));
  return { input: gain, disconnect: () => { gain.disconnect(); compressor.disconnect(); } };
}

// Buffer the onset and recover from jitter without replaying consumed samples.
export class PcmAudioQueue {
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private draining: (() => void) | undefined;
  private stopped = false;
  private context: AudioContext;
  private gain: GainNode;
  private pending = new Float32Array(0);
  private fadeStart = 0;
  private finished = false;
  constructor(context: AudioContext, destinations: AudioNode[]) {
    this.context = context;
    this.gain = context.createGain();
    destinations.forEach(destination => this.gain.connect(destination));
  }
  push(samples: Float32Array): boolean {
    if (this.stopped || this.finished || !samples.length) return false;
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending); merged.set(samples, this.pending.length);
    this.pending = merged;
    // A 100 ms onset could run dry before the next network packet arrived.
    // Keep 400 ms at startup, 300 ms after an underrun, and 60 ms while flowing.
    const minimum = !this.nextStart ? 9600 : this.context.currentTime >= this.fadeStart ? 7200 : 1440;
    if (merged.length < minimum) return false;
    // Keep 10 ms for a smooth ending, including EOF on a packet boundary.
    const ready = merged.slice(0, -240);
    this.pending = merged.slice(-240);
    return this.schedule(ready);
  }
  finish(): boolean {
    if (this.stopped || this.finished) return false;
    this.finished = true;
    const tail = this.pending; this.pending = new Float32Array(0);
    return tail.length ? this.schedule(tail) : false;
  }
  private schedule(samples: Float32Array): boolean {
    const buffer = this.context.createBuffer(1, samples.length, 24_000);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource(); source.buffer = buffer;
    source.connect(this.gain);
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); if (!this.sources.size) this.draining?.(); };
    const continuous = this.nextStart > 0 && this.context.currentTime < this.fadeStart;
    // Publication/subscription and audio devices need a little time to settle.
    const start = continuous ? this.nextStart : Math.max(this.nextStart, this.context.currentTime + 0.12);
    const fade = Math.min(0.008, buffer.duration / 2);
    if (continuous) {
      this.gain.gain.cancelScheduledValues(this.fadeStart);
      this.gain.gain.setValueAtTime(1, this.fadeStart);
    } else {
      this.gain.gain.setValueAtTime(0, start);
      this.gain.gain.linearRampToValueAtTime(1, start + fade);
    }
    this.nextStart = start + buffer.duration;
    // The next timely packet cancels this provisional fade, preserving speech.
    this.fadeStart = this.nextStart - fade;
    this.gain.gain.setValueAtTime(1, this.fadeStart);
    this.gain.gain.linearRampToValueAtTime(0, this.nextStart);
    source.start(start);
    return true;
  }
  drain(): Promise<void> {
    return this.sources.size ? new Promise(resolve => { this.draining = resolve; }) : Promise.resolve();
  }
  stop() {
    this.stopped = true;
    this.sources.forEach(source => { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); });
    this.sources.clear(); this.draining?.();
    this.pending = new Float32Array(0); this.gain.disconnect();
  }
}
