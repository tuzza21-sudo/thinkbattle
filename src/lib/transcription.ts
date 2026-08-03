const GEMINI_TRANSCRIPTION_MODEL = 'gemini-3.1-flash-lite';
const TRANSCRIPTION_TIMEOUT_MS = 60_000;
const TARGET_SAMPLE_RATE = 16_000;
const WAV_CHUNK_SECONDS = 45;

interface GeminiTranscriptionResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface TranscriptionContext {
  topic?: string;
  roundTitle?: string;
  roundInstruction?: string;
}

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const encodeWavChunk = (
  audioBuffer: AudioBuffer,
  startFrame: number,
  endFrame: number,
) => {
  const frameCount = endFrame - startFrame;
  const wavBuffer = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(wavBuffer);
  const sourceRateRatio = audioBuffer.sampleRate / TARGET_SAMPLE_RATE;

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + frameCount * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, frameCount * 2, true);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const targetFrame = startFrame + frame;
    const sourcePosition = targetFrame * sourceRateRatio;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, audioBuffer.length - 1);
    const interpolation = sourcePosition - leftIndex;
    let mixedSample = 0;

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      const channelData = audioBuffer.getChannelData(channel);
      mixedSample += channelData[leftIndex]
        + (channelData[rightIndex] - channelData[leftIndex]) * interpolation;
    }

    const normalizedSample = Math.max(
      -1,
      Math.min(1, mixedSample / audioBuffer.numberOfChannels),
    );
    view.setInt16(
      44 + frame * 2,
      normalizedSample < 0 ? normalizedSample * 0x8000 : normalizedSample * 0x7fff,
      true,
    );
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
};

const convertRecordingToWavChunks = async (recording: Blob) => {
  const context = new AudioContext();
  try {
    const audioBuffer = await context.decodeAudioData(await recording.arrayBuffer());
    const totalFrames = Math.max(1, Math.floor(audioBuffer.duration * TARGET_SAMPLE_RATE));
    const framesPerChunk = WAV_CHUNK_SECONDS * TARGET_SAMPLE_RATE;
    const chunks: Blob[] = [];

    for (let startFrame = 0; startFrame < totalFrames; startFrame += framesPerChunk) {
      chunks.push(encodeWavChunk(
        audioBuffer,
        startFrame,
        Math.min(startFrame + framesPerChunk, totalFrames),
      ));
    }
    return chunks;
  } catch {
    throw new Error('브라우저에서 녹음 파일을 처리하지 못했습니다. 최신 브라우저에서 다시 시도해 주세요.');
  } finally {
    void context.close();
  }
};

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== 'string') {
      reject(new Error('녹음 데이터를 읽지 못했습니다.'));
      return;
    }
    resolve(result.slice(result.indexOf(',') + 1));
  };
  reader.onerror = () => reject(new Error('녹음 데이터를 읽지 못했습니다.'));
  reader.readAsDataURL(blob);
});

const wait = (milliseconds: number) =>
  new Promise(resolve => window.setTimeout(resolve, milliseconds));

const createTranscriptionPrompt = ({
  topic,
  roundTitle,
  roundInstruction,
}: TranscriptionContext, segment?: { current: number; total: number; previousText?: string }) => `당신은 한국어 토론 발언 전문 전사기입니다.
아래 오디오에서 실제로 들리는 한국어 발언만 정확히 전사하세요.

[전사 원칙]
- 요약, 해설, 답변, 번역을 하지 마세요.
- 발화 내용을 임의로 보충하거나 사실관계를 수정하지 마세요.
- 자연스러운 띄어쓰기와 문장부호만 적용하세요.
- 숫자, 고유명사, 토론 용어를 문맥에 맞게 적으세요.
- 아무 음성도 들리지 않으면 빈 문자열만 출력하세요.
- "전사 결과:" 같은 머리말 없이 전사문만 출력하세요.

[토론 문맥]
논제: ${topic?.trim() || '제공되지 않음'}
현재 단계: ${roundTitle?.trim() || '자유 토론'}
단계 안내: ${roundInstruction?.trim() || '제공되지 않음'}
${segment && segment.total > 1 ? `오디오 구간: ${segment.current}/${segment.total}` : ''}
${segment?.previousText ? `직전 구간의 마지막 문맥: ${segment.previousText}` : ''}`;

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json() as GeminiTranscriptionResponse;
    return payload.error?.message;
  } catch {
    return undefined;
  }
};

const transcribeAudioChunk = async (
  audio: Blob,
  context: TranscriptionContext,
  segment: { current: number; total: number; previousText?: string },
  signal?: AbortSignal,
) => {
  const audioData = await blobToBase64(audio);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(
      () => timeoutController.abort(new DOMException('Gemini transcription timed out', 'TimeoutError')),
      TRANSCRIPTION_TIMEOUT_MS,
    );
    const abortFromCaller = () => timeoutController.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(
        `/api/gemini/v1beta/models/${GEMINI_TRANSCRIPTION_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { text: createTranscriptionPrompt(context, segment) },
                {
                  inlineData: {
                    mimeType: audio.type || 'audio/webm',
                    data: audioData,
                  },
                },
              ],
            }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2048,
            },
          }),
          signal: timeoutController.signal,
        },
      );

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        const error = new Error(detail || `Gemini 전사 요청이 실패했습니다. (${response.status})`);

        if (response.status < 500 && response.status !== 429) {
          throw error;
        }
        lastError = error;
      } else {
        const payload = await response.json() as GeminiTranscriptionResponse;
        const transcript = payload.candidates?.[0]?.content?.parts
          ?.map(part => part.text ?? '')
          .join('')
          .trim();

        return (transcript ?? '')
          .replace(/^```(?:text)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error : new Error('Gemini 음성 전사에 실패했습니다.');
      if (attempt === 0) await wait(700);
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  throw lastError ?? new Error('Gemini 음성 전사에 실패했습니다.');
};

export const transcribeDebateAudio = async (
  recording: Blob,
  context: TranscriptionContext,
  signal?: AbortSignal,
) => {
  const audioChunks = await convertRecordingToWavChunks(recording);
  const transcripts: string[] = [];

  for (let index = 0; index < audioChunks.length; index += 1) {
    if (signal?.aborted) throw signal.reason;
    const previousText = transcripts.join(' ').slice(-180);
    const transcript = await transcribeAudioChunk(
      audioChunks[index],
      context,
      {
        current: index + 1,
        total: audioChunks.length,
        ...(previousText ? { previousText } : {}),
      },
      signal,
    );
    if (transcript) transcripts.push(transcript);
  }

  const fullTranscript = transcripts.join(' ').trim();
  if (!fullTranscript) {
    throw new Error('음성이 감지되지 않았습니다. 마이크에 조금 더 가까이 말해 주세요.');
  }
  return fullTranscript;
};
