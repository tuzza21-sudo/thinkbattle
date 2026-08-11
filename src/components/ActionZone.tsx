import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Lock, Zap, Lightbulb, Mic, Square, LoaderCircle, RotateCcw } from 'lucide-react';
import type { DebateStep } from '../types';
import { transcribeDebateAudio } from '../lib/transcription';

interface ActionZoneProps {
  currentRound?: DebateStep;
  roundProgress?: {
    current: number;
    total: number;
  };
  timing?: {
    recommendedSeconds: number;
    elapsedSeconds: number;
    remainingSeconds: number;
    overtimeSeconds: number;
  };
  isPlayerTurn: boolean;
  isAiThinking: boolean;
  isAiSpeaking?: boolean;
  isPaused?: boolean;
  topic?: string;
  onSubmit: (content: string) => void;
  language?: 'ko' | 'en';
}

const MAX_RECORDING_SECONDS = 180;

const formatTimer = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ActionZone: React.FC<ActionZoneProps> = ({ currentRound, roundProgress, timing, isPlayerTurn, isAiThinking, isAiSpeaking = false, isPaused = false, topic, onSubmit, language = 'ko' }) => {
  const isEnglish = language === 'en';
  const [content, setContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<Blob | null>(null);
  const contentRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

  const isOpeningRound = currentRound?.title === '입론';
  const isInputDisabled = isPaused || !isPlayerTurn || isAiThinking;
  const inputDisabledRef = useRef(isInputDisabled);

  useEffect(() => {
    inputDisabledRef.current = isInputDisabled;
  }, [isInputDisabled]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const releaseMicrophone = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopRecording = useCallback((discard = false) => {
    discardRecordingRef.current = discard;
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    releaseMicrophone();
    setIsRecording(false);
  }, [releaseMicrophone]);

  useEffect(() => {
    if (isInputDisabled) {
      if (mediaRecorderRef.current?.state !== 'inactive') stopRecording(true);
      transcriptionControllerRef.current?.abort();
    }
  }, [isInputDisabled, stopRecording]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    releaseMicrophone();
    transcriptionControllerRef.current?.abort();
  }, [releaseMicrophone]);

  useEffect(() => {
    if (!isRecording) return;
    const intervalId = window.setInterval(() => {
      setRecordingSeconds(seconds => seconds + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isRecording]);

  const handleSubmit = () => {
    if (!isPaused && !isRecording && !isTranscribing && content.trim()) {
      onSubmit(content);
      contentRef.current = '';
      setContent('');
      setPendingRecording(null);
      setSpeechError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const totalLength = content.length;

  const isSubmitDisabled = isPaused || !isPlayerTurn || isRecording || isTranscribing || !content.trim();

  const runTranscription = async (recording: Blob) => {
    const controller = new AbortController();
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = controller;
    setIsTranscribing(true);
    setSpeechError(null);
    try {
      const transcript = await transcribeDebateAudio(recording, {
        topic,
        roundTitle: currentRound?.title,
        roundInstruction: currentRound?.instruction,
        language,
      }, controller.signal);
      if (controller.signal.aborted) return;

      const existingContent = contentRef.current.trim();
      const submittedContent = `${existingContent}${existingContent ? ' ' : ''}${transcript}`
        .trim()
        .slice(0, 1200);
      if (!submittedContent) throw new Error('전송할 음성 발언이 없습니다.');

      contentRef.current = '';
      setContent('');
      setPendingRecording(null);
      onSubmit(submittedContent);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Gemini 음성 전사에 실패했습니다.';
      setSpeechError(`${message} 녹음은 보관 중이므로 다시 시도할 수 있습니다.`);
    } finally {
      if (transcriptionControllerRef.current === controller) {
        transcriptionControllerRef.current = null;
        setIsTranscribing(false);
      }
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSpeechError('이 브라우저는 마이크 녹음을 지원하지 않습니다. 최신 Chrome, Edge 또는 Safari를 이용해 주세요.');
      return;
    }

    setSpeechError(null);
    setPendingRecording(null);
    discardRecordingRef.current = false;
    recordedChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (inputDisabledRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      mediaStreamRef.current = stream;

      const supportedMimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(supportedMimeType ? { mimeType: supportedMimeType } : {}),
        audioBitsPerSecond: 32_000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        discardRecordingRef.current = true;
        if (recordingTimeoutRef.current !== null) {
          window.clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
        setSpeechError('마이크 녹음 중 오류가 발생했습니다. 다시 시도해 주세요.');
        releaseMicrophone();
        setIsRecording(false);
      };
      recorder.onstop = () => {
        releaseMicrophone();
        mediaRecorderRef.current = null;
        if (discardRecordingRef.current) {
          recordedChunksRef.current = [];
          return;
        }

        const recording = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || supportedMimeType || 'audio/webm',
        });
        recordedChunksRef.current = [];
        if (recording.size === 0) {
          setSpeechError('녹음된 음성이 없습니다. 다시 시도해 주세요.');
          return;
        }
        setPendingRecording(recording);
        void runTranscription(recording);
      };

      recorder.start(1000);
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      releaseMicrophone();
      const errorName = error instanceof DOMException ? error.name : '';
      const errorMessages: Record<string, string> = {
        NotAllowedError: '마이크 권한이 차단되었습니다. 브라우저 설정에서 마이크 접근을 허용해 주세요.',
        NotFoundError: '사용 가능한 마이크를 찾지 못했습니다. 마이크 연결 상태를 확인해 주세요.',
        NotReadableError: '다른 앱에서 마이크를 사용 중입니다. 해당 앱을 닫고 다시 시도해 주세요.',
      };
      setSpeechError(errorMessages[errorName] ?? '마이크를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleMicrophoneClick = () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  };

  return (
    <div className={`input-zone ${isPlayerTurn ? 'my-turn' : ''}`}>
      <div className="input-container">
        <div className="composer-head">
          <span>
            {isPlayerTurn ? (
              <><Zap size={18} /> {isEnglish ? 'Your turn' : '내 차례'}</>
            ) : isPaused ? (
              <><Lock size={16} /> {isEnglish ? 'Paused' : '일시정지 중입니다'}</>
            ) : isAiSpeaking ? (
              <><Lock size={16} /> {isEnglish ? 'Your opponent is speaking…' : '상대방이 발언 중입니다...'}</>
            ) : isAiThinking ? (
              <><Lock size={16} /> {isEnglish ? 'Your opponent is thinking…' : '상대방이 생각 중입니다...'}</>
            ) : (
              <><Lock size={16} /> {isEnglish ? 'Waiting for your opponent…' : '상대방 응답 대기 중...'}</>
            )}
          </span>
          {isPlayerTurn && (
            <small>
              {totalLength}/1200
            </small>
          )}
        </div>
        {currentRound && (
          <div className="composer-round">
            <strong>
              {roundProgress ? `${roundProgress.current}/${roundProgress.total} · ` : ''}{isEnglish ? 'Structured debate phase' : currentRound.title}
            </strong>
            <span>{isEnglish ? 'Make a clear claim, explain your reasoning and respond directly to the opposing case.' : currentRound.instruction}</span>
            {timing && (
              <span className={`stage-timer-chip ${timing.overtimeSeconds > 0 ? 'overtime' : timing.remainingSeconds <= 30 ? 'warning' : ''}`}>
                {timing.overtimeSeconds > 0
                  ? isEnglish ? `${formatTimer(timing.overtimeSeconds)} over the suggested time` : `권장 시간 +${formatTimer(timing.overtimeSeconds)} 초과`
                  : isEnglish ? `Suggested time remaining ${formatTimer(timing.remainingSeconds)}` : `남은 권장 시간 ${formatTimer(timing.remainingSeconds)}`}
              </span>
            )}
          </div>
        )}
        
        {isOpeningRound && isPlayerTurn && (
          <div className="opening-guide-tip">
            <div className="opening-guide-tip-header">
              <Lightbulb size={15} />
              <span>{isEnglish ? 'Opening speech guide' : '입론 작성 가이드'}</span>
            </div>
            <div className="opening-guide-tip-body">
              <p>{isEnglish ? <><strong>Explain</strong> your reason and provide <strong>supporting evidence</strong>.</> : <><strong>이유</strong>와 <strong>근거</strong>를 구분하여 작성해 보세요!</>}</p>
              <ul>
                <li><strong>{isEnglish ? 'Reason' : '이유'}</strong> — {isEnglish ? 'the causal explanation supporting your position' : <>나의 입장을 뒷받침하는 <em>핵심 주장</em> (왜 그렇게 생각하는가?)</>}</li>
                <li><strong>{isEnglish ? 'Evidence' : '근거'}</strong> — {isEnglish ? 'a concrete example, fact or comparison supporting that reason' : <>이유를 증명하는 <em>구체적 사례·통계·사실</em></>}</li>
              </ul>
              <p className="opening-guide-example">{isEnglish ? 'Example: Claim → reason → concrete example → impact.' : '예) 이유: "원격 수업은 학습 효율을 높인다" → 근거: "OO 연구에 따르면 자기주도 학습 시간이 30% 증가했다"'}</p>
            </div>
          </div>
        )}

        <div className="composer-row">
          <textarea
            className={`input-textarea ${isRecording ? 'is-listening' : ''}`}
            style={isOpeningRound ? { minHeight: '120px' } : undefined}
            placeholder={isEnglish ? (isPaused ? 'Resume the debate to continue writing.' : isPlayerTurn ? 'Write your argument or a direct response to the opposing case…' : isAiSpeaking ? 'Listen to your opponent before the next phase begins…' : isAiThinking ? 'Your opponent is preparing a response…' : 'Waiting…') : isPaused ? "진행 버튼을 누르면 이어서 작성할 수 있습니다." : isPlayerTurn ? (isOpeningRound ? "이유와 근거를 구분하여 입론을 작성해 주세요...\n\n예)\n[이유] 원격 수업은 학습 효율을 높인다.\n[근거] OO 연구에 따르면 자기주도 학습 시간이 30% 증가했다." : currentRound?.inputPlaceholder ?? "주장에 대한 반박이나 질문을 입력하세요...") : isAiSpeaking ? "상대방 발언이 끝나면 다음 단계가 시작됩니다..." : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
            value={content}
            onChange={(e) => {
              contentRef.current = e.target.value;
              setContent(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            disabled={isInputDisabled}
            maxLength={1200}
          />

          <button
            type="button"
            className={`btn microphone-button ${isRecording ? 'is-listening' : ''}`}
            onClick={handleMicrophoneClick}
            disabled={isInputDisabled || isTranscribing}
            aria-label={isEnglish ? (isRecording ? 'Finish and submit speech' : 'Start speaking') : (isRecording ? '발언 종료 후 자동 전송' : '발언하기')}
            aria-pressed={isRecording}
            title={isEnglish ? (isRecording ? 'Finish and submit automatically' : 'Start speaking') : (isRecording ? '발언 종료 후 자동으로 전송합니다' : '마이크로 발언하기')}
          >
            {isTranscribing
              ? <LoaderCircle className="spin" size={20} />
              : isRecording
                ? <Square size={18} fill="currentColor" />
                : <Mic size={20} />}
            <span>{isEnglish ? (isTranscribing ? 'Sending' : isRecording ? 'Finish' : 'Speak') : (isTranscribing ? '전송 중' : isRecording ? '발언 종료' : '발언하기')}</span>
          </button>

          <button 
            className="btn btn-primary send-button" 
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            title={isEnglish ? 'Submit' : '제출'}
          >
            <Send size={18} />
            <span>{isEnglish ? 'Submit' : '제출'}</span>
          </button>
        </div>
        {(isRecording || isTranscribing || speechError) && (
          <div
            className={`speech-status ${speechError ? 'error' : ''}`}
            role={speechError ? 'alert' : 'status'}
            aria-live="polite"
          >
            {isRecording && <span className="speech-pulse" aria-hidden="true" />}
            {isTranscribing && <LoaderCircle className="spin" size={14} aria-hidden="true" />}
            <span>
              {speechError
                ?? (isTranscribing
                  ? isEnglish ? 'Transcribing and submitting your speech automatically…' : '발언을 변환한 뒤 자동으로 전송하고 있습니다...'
                  : isEnglish ? `Speaking ${formatTimer(recordingSeconds)} · Finish to submit automatically. (3-minute maximum)` : `발언 중 ${formatTimer(recordingSeconds)} · 종료하면 자동 전송됩니다. (최대 3분)`)}
            </span>
            {speechError && pendingRecording && !isTranscribing && (
              <button
                type="button"
                className="speech-retry-button"
                onClick={() => void runTranscription(pendingRecording)}
              >
                <RotateCcw size={13} />
                {isEnglish ? 'Try again' : '다시 시도'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
