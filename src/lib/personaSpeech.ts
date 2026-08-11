import { getAiGatewayHeaders } from './aiGateway';

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

type GeminiTtsResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
};

type StreamingSpeechOptions = {
  signal?: AbortSignal;
  language?: 'ko' | 'en';
  onPlaybackStart?: () => void;
};

type BrowserSpeechOptions = {
  onStart?: () => void;
  onEnd?: () => void;
};

const base64ToBytes = (value: string) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const bytesToArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const pcm16ToWav = (pcm: Uint8Array, sampleRate: number) => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, bytesToArrayBuffer(pcm)], { type: 'audio/wav' });
};

const createTtsRequest = (
  text: string,
  voiceName: string,
  voiceStyle: string,
  language: 'ko' | 'en',
) => ({
  contents: [{
    parts: [{
      text: `${voiceStyle}\nRead only the following ${language === 'en' ? 'English' : 'Korean'} counterpart dialogue exactly as written. Do not add an introduction or explanation.\n\n${text}`,
    }],
  }],
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName },
      },
    },
  },
});

const mergeBytes = (chunks: Uint8Array[]) => {
  const merged = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return merged;
};

class PcmStreamPlayer {
  private readonly context = new AudioContext();
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly ended: Promise<void>;
  private readonly onPlaybackStart?: () => void;
  private resolveEnded!: () => void;
  private nextStartAt = 0;
  private carryByte: number | null = null;
  private inputEnded = false;
  private playbackStarted = false;
  private playbackError: unknown = null;
  private stopped = false;

  constructor(onPlaybackStart?: () => void) {
    this.onPlaybackStart = onPlaybackStart;
    this.ended = new Promise(resolve => {
      this.resolveEnded = resolve;
    });
  }

  enqueue(pcm: Uint8Array, sampleRate: number) {
    if (this.stopped || pcm.byteLength === 0) return;

    let bytes = pcm;
    if (this.carryByte !== null) {
      const joined = new Uint8Array(pcm.byteLength + 1);
      joined[0] = this.carryByte;
      joined.set(pcm, 1);
      bytes = joined;
      this.carryByte = null;
    }
    if (bytes.byteLength % 2 !== 0) {
      this.carryByte = bytes[bytes.byteLength - 1];
      bytes = bytes.subarray(0, bytes.byteLength - 1);
    }
    if (bytes.byteLength === 0) return;

    const sampleCount = bytes.byteLength / 2;
    const samples = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const buffer = this.context.createBuffer(1, sampleCount, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      this.sources.delete(source);
      this.resolveIfFinished();
    };

    const leadTime = this.playbackStarted ? 0.025 : 0.12;
    const startAt = Math.max(this.nextStartAt, this.context.currentTime + leadTime);
    this.nextStartAt = startAt + buffer.duration;
    this.sources.add(source);
    source.start(startAt);

    if (!this.playbackStarted) {
      this.playbackStarted = true;
      void this.context.resume()
        .then(() => this.onPlaybackStart?.())
        .catch(error => {
          this.playbackError = error;
          this.stop();
        });
    }
  }

  async finish() {
    this.inputEnded = true;
    this.resolveIfFinished();
    await this.ended;
    await this.closeContext();
    if (this.playbackError) throw this.playbackError;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.inputEnded = true;
    this.sources.forEach(source => {
      try {
        source.stop();
      } catch {
        // A source that already ended cannot be stopped again.
      }
    });
    this.sources.clear();
    this.resolveEnded();
    void this.closeContext();
  }

  private resolveIfFinished() {
    if (this.inputEnded && this.sources.size === 0) this.resolveEnded();
  }

  private async closeContext() {
    if (this.context.state !== 'closed') await this.context.close().catch(() => undefined);
  }
}

const parseSseResponse = async (
  response: Response,
  onPayload: (payload: GeminiTtsResponse) => void,
) => {
  if (!response.body) throw new Error('Gemini TTS stream did not return a response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let dataLines: string[] = [];

  const dispatchEvent = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') return;
    onPayload(JSON.parse(data) as GeminiTtsResponse);
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      dispatchEvent();
      return;
    }
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuffer += decoder.decode(value, { stream: true });
    let newlineIndex = lineBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      processLine(lineBuffer.slice(0, newlineIndex));
      lineBuffer = lineBuffer.slice(newlineIndex + 1);
      newlineIndex = lineBuffer.indexOf('\n');
    }
  }

  lineBuffer += decoder.decode();
  if (lineBuffer) processLine(lineBuffer);
  dispatchEvent();
};

export const synthesizePersonaSpeech = async (
  text: string,
  voiceName: string,
  voiceStyle: string,
  signal?: AbortSignal,
  language: 'ko' | 'en' = 'ko',
): Promise<Blob> => {
  const response = await fetch(`/api/gemini/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`, {
    method: 'POST',
    headers: await getAiGatewayHeaders(),
    signal,
    body: JSON.stringify(createTtsRequest(text, voiceName, voiceStyle, language)),
  });

  if (!response.ok) throw new Error(`Gemini TTS 요청에 실패했습니다. (${response.status})`);
  const payload = await response.json() as GeminiTtsResponse;
  const audioPart = payload.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
  if (!audioPart?.data) throw new Error('Gemini TTS가 음성 데이터를 반환하지 않았습니다.');

  const bytes = base64ToBytes(audioPart.data);
  const mimeType = audioPart.mimeType || 'audio/L16;codec=pcm;rate=24000';
  if (/wav|mpeg|mp3|ogg|webm|mp4/i.test(mimeType)) return new Blob([bytesToArrayBuffer(bytes)], { type: mimeType });

  const sampleRate = Number(mimeType.match(/rate=(\d+)/i)?.[1]) || 24_000;
  return pcm16ToWav(bytes, sampleRate);
};

export const streamPersonaSpeech = async (
  text: string,
  voiceName: string,
  voiceStyle: string,
  options: StreamingSpeechOptions = {},
): Promise<Blob> => {
  const { signal, language = 'ko', onPlaybackStart } = options;
  if (signal?.aborted) throw signal.reason ?? new DOMException('Speech playback aborted', 'AbortError');

  const player = new PcmStreamPlayer(onPlaybackStart);
  const pcmChunks: Uint8Array[] = [];
  let sampleRate = 24_000;
  const handleAbort = () => player.stop();
  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    const response = await fetch(`/api/gemini/v1beta/models/${GEMINI_TTS_MODEL}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: await getAiGatewayHeaders(),
      signal,
      body: JSON.stringify(createTtsRequest(text, voiceName, voiceStyle, language)),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Gemini streaming TTS request failed. (${response.status})`);
    }

    await parseSseResponse(response, payload => {
      payload.candidates?.[0]?.content?.parts?.forEach(part => {
        const audio = part.inlineData;
        if (!audio?.data) return;
        const bytes = base64ToBytes(audio.data);
        const detectedRate = Number(audio.mimeType?.match(/rate=(\d+)/i)?.[1]);
        if (detectedRate) sampleRate = detectedRate;
        pcmChunks.push(bytes);
        player.enqueue(bytes, sampleRate);
      });
    });

    if (pcmChunks.length === 0) throw new Error('Gemini streaming TTS returned no audio data.');
    await player.finish();
    return pcm16ToWav(mergeBytes(pcmChunks), sampleRate);
  } catch (error) {
    player.stop();
    throw error;
  } finally {
    signal?.removeEventListener('abort', handleAbort);
  }
};

export const speakWithBrowserFallback = (
  text: string,
  rate = 1,
  language: 'ko' | 'en' = 'ko',
  options: BrowserSpeechOptions = {},
) => {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'en' ? 'en-US' : 'ko-KR';
  utterance.rate = rate;
  const matchingVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith(language));
  if (matchingVoice) utterance.voice = matchingVoice;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onEnd?.();
  window.speechSynthesis.speak(utterance);
  return true;
};
