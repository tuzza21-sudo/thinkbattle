import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Gavel,
  Headphones,
  LoaderCircle,
  LogIn,
  LogOut,
  Mic,
  Radio,
  RotateCcw,
  Send,
  Square,
  UserRound,
  Users,
} from 'lucide-react';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
} from 'livekit-client';
import { ArgumentCard } from './ArgumentCard';
import { LiveDebateEvaluationModal } from './LiveDebateEvaluationModal';
import { supabase } from '../lib/supabase';
import { transcribeDebateAudio } from '../lib/transcription';
import { formatDebateMinutes, getDebatePhaseTimings } from '../lib/debateTiming';
import { generateLiveDebateEvaluation } from '../lib/api';
import { getLiveDebateEvaluation, saveLiveDebateEvaluation } from '../lib/debateRooms';
import { saveDebateRecord } from '../lib/history';
import type { AppUser, Argument, DebateParticipantRole, DebatePosition, DebateTeamSize, LiveDebateEvaluation, Player } from '../types';

interface LiveDebateRoomProps {
  user: AppUser | null;
  onLoginRequest: () => void;
}

type LiveArgument = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  source: 'text' | 'voice';
};

type LivePacket =
  | {
      version: 1;
      type: 'argument';
      argument: LiveArgument;
    }
  | {
      version: 1;
      type: 'history';
      arguments: LiveArgument[];
    }
  | {
      version: 1;
      type: 'finish';
      finishedAt: string;
    }
  | {
      version: 1;
      type: 'evaluation-ready';
    }
  | {
      version: 1;
      type: 'evaluation-error';
      message: string;
    };

type ConnectionView = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

const LIVE_DATA_TOPIC = 'thinkbattle.debate';
const MAX_RECORDING_SECONDS = 180;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const createMessageId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatTimer = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

const getPositionLabel = (position: DebatePosition) => position === 'affirmative' ? '찬성' : '반대';
const getRoleLabel = (role: DebateParticipantRole) => ({
  debater: '토론자',
  opening: '입론 담당',
  rebuttal: '질의·반론 담당',
  closing: '최종 변론 담당',
  moderator: '진행자',
}[role]);
const getPhaseOwnerRole = (teamSize: DebateTeamSize, phaseLabel: string): DebateParticipantRole => {
  if (teamSize === 1) return 'debater';
  if (phaseLabel === '입론') return 'opening';
  if (phaseLabel === '최종 변론') return teamSize === 3 ? 'closing' : 'opening';
  return 'rebuttal';
};
const getOppositePosition = (position: DebatePosition): DebatePosition =>
  position === 'affirmative' ? 'negative' : 'affirmative';

const isLiveArgument = (value: unknown): value is LiveArgument => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LiveArgument>;
  return typeof candidate.id === 'string'
    && typeof candidate.senderId === 'string'
    && typeof candidate.senderName === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.createdAt === 'string'
    && (candidate.source === 'text' || candidate.source === 'voice');
};

const getConnectionLabel = (connection: ConnectionView) => {
  if (connection === 'connected') return '연결됨';
  if (connection === 'reconnecting') return '재연결 중';
  if (connection === 'error') return '연결 실패';
  if (connection === 'disconnected') return '연결 종료';
  return '연결 중';
};

const getConnectionView = (state: ConnectionState): ConnectionView => {
  if (state === ConnectionState.Connected) return 'connected';
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
    return 'reconnecting';
  }
  if (state === ConnectionState.Disconnected) return 'disconnected';
  return 'connecting';
};

export const LiveDebateRoom = ({ user, onLoginRequest }: LiveDebateRoomProps) => {
  const navigate = useNavigate();
  const { roomId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const topic = searchParams.get('topic')?.trim() || '사람 대 사람 토론';
  const configuredTime = Number(searchParams.get('time'));
  const timeLimit = Number.isFinite(configuredTime)
    ? Math.min(7_200, Math.max(300, configuredTime))
    : 600;
  const hostId = searchParams.get('host') || '';
  const hostPosition: DebatePosition = searchParams.get('position') === 'negative'
    ? 'negative'
    : 'affirmative';
  const configuredTeamSize = Number(searchParams.get('team'));
  const teamSize = ([1, 2, 3].includes(configuredTeamSize) ? configuredTeamSize : 1) as DebateTeamSize;
  const allowModerator = searchParams.get('moderator') === '1';
  const configuredStartedAt = searchParams.get('startedAt');
  const startedAtMs = configuredStartedAt ? Date.parse(configuredStartedAt) : Number.NaN;
  const selectedPosition = searchParams.get('myPosition');
  const myPosition: DebatePosition = selectedPosition === 'negative'
    ? 'negative'
    : selectedPosition === 'affirmative'
      ? 'affirmative'
      : user?.id === hostId
        ? hostPosition
        : getOppositePosition(hostPosition);
  const roleParam = searchParams.get('role');
  const myRole: DebateParticipantRole = ['debater', 'opening', 'rebuttal', 'closing', 'moderator'].includes(roleParam || '')
    ? roleParam as DebateParticipantRole
    : 'debater';

  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const argumentsRef = useRef<LiveArgument[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const evaluationRequestedRef = useRef(false);
  const savedEvaluationRef = useRef(false);

  const [connection, setConnection] = useState<ConnectionView>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ id: string; name: string; isSpeaking: boolean; position: DebatePosition; role: DebateParticipantRole }[]>([]);
  const [argumentsList, setArgumentsList] = useState<LiveArgument[]>([]);
  const [content, setContent] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<Blob | null>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Number.isFinite(startedAtMs)
    ? Math.min(timeLimit, Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)))
    : 0);
  const [forcedFinished, setForcedFinished] = useState(false);
  const [evaluation, setEvaluation] = useState<LiveDebateEvaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);

  const addArguments = useCallback((incoming: LiveArgument[]) => {
    setArgumentsList(previous => {
      const knownIds = new Set(previous.map(argument => argument.id));
      const additions = incoming.filter(argument => !knownIds.has(argument.id));
      if (additions.length === 0) return previous;
      const next = [...previous, ...additions]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      argumentsRef.current = next;
      return next;
    });
  }, []);

  const publishPacket = useCallback(async (packet: LivePacket, destinationIdentities?: string[]) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      throw new Error('LiveKit 방에 연결되어 있지 않습니다.');
    }
    await room.localParticipant.publishData(
      encoder.encode(JSON.stringify(packet)),
      {
        reliable: true,
        topic: LIVE_DATA_TOPIC,
        ...(destinationIdentities ? { destinationIdentities } : {}),
      },
    );
  }, []);

  const publishArgument = useCallback(async (text: string, source: LiveArgument['source']) => {
    if (!user) return;
    const trimmed = text.trim().slice(0, 1200);
    if (!trimmed) return;

    const argument: LiveArgument = {
      id: createMessageId(),
      senderId: user.id,
      senderName: user.nickname,
      content: trimmed,
      createdAt: new Date().toISOString(),
      source,
    };

    await publishPacket({ version: 1, type: 'argument', argument });
    addArguments([argument]);
  }, [addArguments, publishPacket, user]);

  useEffect(() => {
    if (!user || !roomId) return;
    let cancelled = false;
    const room = new Room({
      adaptiveStream: false,
      dynacast: true,
      disconnectOnPageLeave: true,
    });
    roomRef.current = room;

    const refreshParticipants = () => {
      setParticipants([...room.remoteParticipants.values()].map(participant => {
        let metadata: { position?: DebatePosition; role?: DebateParticipantRole } = {};
        try { metadata = JSON.parse(participant.metadata || '{}') as typeof metadata; } catch { /* ignore malformed metadata */ }
        return {
          id: participant.identity,
          name: participant.name || '토론 참가자',
          isSpeaking: participant.isSpeaking,
          position: metadata.position === 'negative' ? 'negative' : 'affirmative',
          role: ['debater', 'opening', 'rebuttal', 'closing', 'moderator'].includes(metadata.role || '') ? metadata.role as DebateParticipantRole : 'debater',
        };
      }));
    };

    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.autoplay = true;
      element.setAttribute('playsinline', 'true');
      element.className = 'livekit-remote-audio';
      audioContainerRef.current?.appendChild(element);
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach(element => element.remove());
    };

    const handleDataReceived = (
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: unknown,
      packetTopic?: string,
    ) => {
      if (packetTopic !== LIVE_DATA_TOPIC) return;
      try {
        const packet = JSON.parse(decoder.decode(payload)) as Partial<LivePacket>;
        if (packet.version !== 1) return;
        if (packet.type === 'argument' && isLiveArgument(packet.argument)) {
          addArguments([packet.argument]);
        }
        if (packet.type === 'history' && Array.isArray(packet.arguments)) {
          addArguments(packet.arguments.filter(isLiveArgument));
        }
        if (packet.type === 'finish') {
          setForcedFinished(true);
          setShowEvaluation(true);
        }
        if (packet.type === 'evaluation-ready') {
          void getLiveDebateEvaluation(roomId).then(nextEvaluation => {
            if (nextEvaluation) setEvaluation(nextEvaluation);
          }).catch(error => setEvaluationError(error instanceof Error ? error.message : 'AI 평가를 불러오지 못했습니다.'));
        }
        if (packet.type === 'evaluation-error') {
          setEvaluationError(packet.message || 'AI 평가를 생성하지 못했습니다.');
          setShowEvaluation(true);
        }
      } catch (error) {
        console.warn('LiveKit data packet parse error:', error);
      }
    };

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      refreshParticipants();
      const recentArguments = argumentsRef.current.slice(-8);
      if (recentArguments.length > 0) {
        void publishPacket(
          { version: 1, type: 'history', arguments: recentArguments },
          [participant.identity],
        ).catch(error => console.warn('LiveKit history sync error:', error));
      }
    };

    room
      .on(RoomEvent.ConnectionStateChanged, state => {
        if (!cancelled) setConnection(getConnectionView(state));
      })
      .on(RoomEvent.ParticipantConnected, handleParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, refreshParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, refreshParticipants)
      .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      .on(RoomEvent.DataReceived, handleDataReceived)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!cancelled) setIsAudioBlocked(!room.canPlaybackAudio);
      });

    const connect = async () => {
      setConnection('connecting');
      setConnectionError(null);
      let lastError: unknown;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');

          const response = await fetch('/api/livekit-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              roomName: roomId,
              maxParticipants: teamSize * 2 + (allowModerator ? 1 : 0),
              position: myPosition,
              role: myRole,
            }),
          });
          const payload = await response.json() as { token?: string; url?: string; error?: string };
          if (!response.ok || !payload.token || !payload.url) {
            throw new Error(payload.error || 'LiveKit 접속 정보를 받지 못했습니다.');
          }

          await room.connect(payload.url, payload.token, { autoSubscribe: true });
          if (cancelled) {
            await room.disconnect();
            return;
          }
          setConnection('connected');
          setIsAudioBlocked(!room.canPlaybackAudio);
          refreshParticipants();
          return;
        } catch (error) {
          lastError = error;
          console.warn(`LiveKit connection attempt ${attempt + 1} failed:`, error);
          await room.disconnect().catch(() => undefined);
          if (attempt < 2 && !cancelled) {
            await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
      }

      if (cancelled) return;
      console.error('LiveKit connection error:', lastError);
      setConnection('error');
      setConnectionError(lastError instanceof Error ? lastError.message : 'LiveKit 방에 연결하지 못했습니다.');
    };

    void connect();

    return () => {
      cancelled = true;
      discardRecordingRef.current = true;
      transcriptionControllerRef.current?.abort();
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
      room.removeAllListeners();
      room.remoteParticipants.forEach(participant => {
        participant.trackPublications.forEach(publication => {
          publication.track?.detach().forEach(element => element.remove());
        });
      });
      void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [addArguments, allowModerator, myPosition, myRole, publishPacket, roomId, teamSize, user]);

  useEffect(() => {
    if (Number.isFinite(startedAtMs)) {
      const timerId = window.setInterval(() => {
        setElapsedSeconds(Math.min(timeLimit, Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))));
      }, 1000);
      return () => window.clearInterval(timerId);
    }
    if (connection !== 'connected' || participants.length === 0) return;
    const timerId = window.setInterval(() => {
      setElapsedSeconds(previous => Math.min(timeLimit, previous + 1));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [connection, participants.length, startedAtMs, timeLimit]);

  useEffect(() => {
    if (!isSpeaking) return;
    const timerId = window.setInterval(() => {
      setRecordingSeconds(previous => previous + 1);
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [isSpeaking]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [argumentsList, isTranscribing]);

  const runTranscription = async (recording: Blob) => {
    const controller = new AbortController();
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = controller;
    setIsTranscribing(true);
    setSpeechError(null);

    try {
      const transcript = await transcribeDebateAudio(recording, {
        topic,
        roundTitle: '사람 대 사람 토론 발언',
        roundInstruction: '발언을 정확히 전사하여 상대방에게 전달합니다.',
      }, controller.signal);
      if (controller.signal.aborted) return;
      await publishArgument(transcript, 'voice');
      setPendingRecording(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setSpeechError(error instanceof Error ? error.message : '음성을 텍스트로 변환하지 못했습니다.');
    } finally {
      if (transcriptionControllerRef.current === controller) {
        transcriptionControllerRef.current = null;
        setIsTranscribing(false);
      }
    }
  };

  const stopSpeaking = async (discard = false) => {
    discardRecordingRef.current = discard;
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    setIsSpeaking(false);
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
    } catch (error) {
      console.warn('LiveKit microphone stop error:', error);
    }
  };

  const startSpeaking = async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      setSpeechError('LiveKit 연결이 완료된 뒤 마이크를 사용할 수 있습니다.');
      return;
    }
    if (!allDebatersConnected) {
      setSpeechError(`대기실 참가자들이 토론방에 연결되는 중입니다. (${connectedDebaterCount}/${requiredDebaterCount})`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSpeechError('이 브라우저는 마이크 녹음을 지원하지 않습니다.');
      return;
    }

    setSpeechError(null);
    setPendingRecording(null);
    discardRecordingRef.current = false;
    recordedChunksRef.current = [];

    try {
      const publication = await room.localParticipant.setMicrophoneEnabled(true, {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      const audioTrack = publication?.audioTrack;
      if (!audioTrack) throw new Error('LiveKit 마이크 트랙을 생성하지 못했습니다.');

      const supportedMimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        new MediaStream([audioTrack.mediaStreamTrack]),
        {
          ...(supportedMimeType ? { mimeType: supportedMimeType } : {}),
          audioBitsPerSecond: 32_000,
        },
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setSpeechError('마이크 녹음 중 오류가 발생했습니다. 다시 시도해 주세요.');
        void stopSpeaking(true);
      };
      recorder.onstop = () => {
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
      setIsSpeaking(true);
      recordingTimeoutRef.current = window.setTimeout(() => {
        void stopSpeaking();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      const errorName = error instanceof DOMException ? error.name : '';
      const microphoneErrors: Record<string, string> = {
        NotAllowedError: '마이크 권한이 차단되었습니다. 브라우저에서 마이크 접근을 허용해 주세요.',
        NotFoundError: '사용 가능한 마이크를 찾지 못했습니다.',
        NotReadableError: '다른 앱에서 마이크를 사용 중입니다.',
      };
      setSpeechError(
        microphoneErrors[errorName]
        || (error instanceof Error ? error.message : '마이크를 시작하지 못했습니다.'),
      );
    }
  };

  const handleMicrophoneClick = () => {
    if (isSpeaking) {
      void stopSpeaking();
    } else {
      void startSpeaking();
    }
  };

  const handleTextSubmit = async () => {
    if (!content.trim() || isSpeaking || isTranscribing) return;
    setSpeechError(null);
    try {
      await publishArgument(content, 'text');
      setContent('');
    } catch (error) {
      setSpeechError(error instanceof Error ? error.message : '텍스트 발언을 전송하지 못했습니다.');
    }
  };

  const handleCopyInvite = async () => {
    try {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.searchParams.delete('myPosition');
      inviteUrl.searchParams.delete('role');
      await navigator.clipboard.writeText(inviteUrl.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setSpeechError('초대 링크를 복사하지 못했습니다. 주소창의 링크를 직접 복사해 주세요.');
    }
  };

  const handleEnableAudio = async () => {
    try {
      await roomRef.current?.startAudio();
      setIsAudioBlocked(false);
    } catch {
      setSpeechError('브라우저가 오디오 재생을 차단했습니다. 다시 눌러 주세요.');
    }
  };

  const handleFinishDebate = async () => {
    if (!user || user.id !== hostId || forcedFinished) return;
    if (isSpeaking) await stopSpeaking();
    setForcedFinished(true);
    setShowEvaluation(true);
    try {
      await publishPacket({ version: 1, type: 'finish', finishedAt: new Date().toISOString() });
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : '토론 종료 상태를 공유하지 못했습니다.');
    }
  };

  const remainingSeconds = Math.max(0, timeLimit - elapsedSeconds);
  const phaseTimings = getDebatePhaseTimings(timeLimit);
  const currentPhase = phaseTimings.find((_, index) => (
    elapsedSeconds < phaseTimings.slice(0, index + 1).reduce((total, phase) => total + phase.seconds, 0)
  )) || phaseTimings[phaseTimings.length - 1];
  const currentOwnerRole = getPhaseOwnerRole(teamSize, currentPhase.label);
  const stageOwners = [
    {
      id: user?.id || '',
      name: user?.nickname || '나',
      position: myPosition,
      role: myRole,
      isLocal: true,
    },
    ...participants.map(participant => ({ ...participant, isLocal: false })),
  ].filter(participant => participant.role === currentOwnerRole);
  const affirmativeStageOwner = stageOwners.find(participant => participant.position === 'affirmative');
  const negativeStageOwner = stageOwners.find(participant => participant.position === 'negative');
  const sessionFinished = forcedFinished || remainingSeconds === 0;
  const isMyStage = !sessionFinished && myRole === currentOwnerRole;
  const isRoomReady = connection === 'connected';
  const requiredDebaterCount = teamSize * 2;
  const connectedDebaterCount = (myRole === 'moderator' ? 0 : 1)
    + participants.filter(participant => participant.role !== 'moderator').length;
  const allDebatersConnected = connectedDebaterCount >= requiredDebaterCount;
  const composerDisabled = !isRoomReady || !allDebatersConnected || sessionFinished;
  const connectedParticipantIds = [user?.id || '', ...participants.map(participant => participant.id)].filter(Boolean);
  const evaluationLeaderId = connectedParticipantIds.includes(hostId)
    ? hostId
    : [...connectedParticipantIds].sort()[0];
  const isEvaluationLeader = !!user && user.id === evaluationLeaderId;

  const runEvaluation = useCallback(async () => {
    if (!user || evaluationRequestedRef.current) return;
    evaluationRequestedRef.current = true;
    setShowEvaluation(true);
    setEvaluationError(null);
    try {
      // Allow the last voice transcription/data packet to arrive before judging.
      await new Promise(resolve => window.setTimeout(resolve, 3500));
      const evaluationParticipants = [
        { userId: user.id, nickname: user.nickname, position: myPosition, role: myRole },
        ...participants.map(participant => ({
          userId: participant.id,
          nickname: participant.name,
          position: participant.position,
          role: participant.role,
        })),
      ];
      const nextEvaluation = await generateLiveDebateEvaluation(topic, evaluationParticipants, argumentsRef.current);
      const saved = await saveLiveDebateEvaluation(roomId, nextEvaluation);
      const finalEvaluation = saved ? nextEvaluation : await getLiveDebateEvaluation(roomId);
      if (!finalEvaluation) throw new Error('저장된 AI 평가를 불러오지 못했습니다.');
      setEvaluation(finalEvaluation);
      await publishPacket({ version: 1, type: 'evaluation-ready' }).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 평가를 생성하지 못했습니다.';
      setEvaluationError(message);
      await publishPacket({ version: 1, type: 'evaluation-error', message }).catch(() => undefined);
    }
  }, [myPosition, myRole, participants, publishPacket, roomId, topic, user]);

  useEffect(() => {
    if (!sessionFinished) return;
    if (isEvaluationLeader && !evaluation && !evaluationError) {
      const evaluationTimer = window.setTimeout(() => void runEvaluation(), 0);
      return () => window.clearTimeout(evaluationTimer);
    }
  }, [evaluation, evaluationError, isEvaluationLeader, runEvaluation, sessionFinished]);

  useEffect(() => {
    if (!sessionFinished || evaluation) return;
    const pollingId = window.setInterval(() => {
      void getLiveDebateEvaluation(roomId).then(nextEvaluation => {
        if (nextEvaluation) setEvaluation(nextEvaluation);
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(pollingId);
  }, [evaluation, roomId, sessionFinished]);

  const displayArguments = useMemo(() => argumentsList.map<Argument>(argument => ({
    id: argument.id,
    playerId: argument.senderId,
    isAi: argument.senderId !== user?.id,
    content: argument.content,
    timestamp: new Date(argument.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    roundTitle: argument.source === 'voice' ? '음성 전사' : '텍스트 발언',
  })), [argumentsList, user?.id]);

  useEffect(() => {
    if (!evaluation || !user || savedEvaluationRef.current) return;
    const personal = evaluation.participantReports.find(participant => participant.userId === user.id);
    if (!personal) return;
    savedEvaluationRef.current = true;
    void saveDebateRecord({
      id: crypto.randomUUID(),
      userId: user.id,
      topic,
      matchType: `${teamSize}:${teamSize} 사람 대 사람 토론`,
      gameMode: 'pvp',
      userPosition: personal.position,
      aiPosition: personal.position === 'affirmative' ? 'negative' : 'affirmative',
      debateLevel: 'intermediate',
      debateFocus: 'fact',
      durationSeconds: Math.min(timeLimit, elapsedSeconds),
      completedAt: evaluation.generatedAt,
      arguments: displayArguments,
      report: personal.report,
    }).catch(error => {
      savedEvaluationRef.current = false;
      console.error('Live debate report save error:', error);
    });
  }, [displayArguments, elapsedSeconds, evaluation, teamSize, timeLimit, topic, user]);

  const getPlayer = (argument: Argument): Player => {
    const liveArgument = argumentsList.find(item => item.id === argument.id);
    const isLocal = liveArgument?.senderId === user?.id;
    const remoteParticipant = participants.find(participant => participant.id === liveArgument?.senderId);
    const participantPosition = isLocal ? myPosition : remoteParticipant?.position ?? getOppositePosition(myPosition);
    const participantRole = isLocal ? myRole : remoteParticipant?.role ?? 'debater';
    const name = liveArgument?.senderName || (isLocal ? user?.nickname : remoteParticipant?.name) || '토론 참가자';
    return {
      id: argument.playerId,
      name: `${name} · ${participantRole === 'moderator' ? '진행자' : `${getPositionLabel(participantPosition)} · ${getRoleLabel(participantRole)}`}`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(argument.playerId)}`,
      level: 1,
      rankBadge: isLocal ? '나' : '상대방',
      score: 0,
      streak: 0,
      isAi: false,
    };
  };

  if (!user) {
    return (
      <div className="app-container live-login-gate">
        <div className="live-gate-card">
          <Users size={38} />
          <h1>{topic}</h1>
          <p>초대받은 사람 대 사람 음성 토론방입니다. 로그인하면 방에 바로 참가합니다.</p>
          <button type="button" className="btn btn-primary" onClick={onLoginRequest}>
            <LogIn size={18} /> 로그인하고 참가
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container live-debate-room">
      <header className="live-room-header">
        <div>
          <span className="badge">LIVE · {teamSize}:{teamSize} {teamSize === 1 ? '개인' : '팀'} 토론{allowModerator ? ' · 진행자 허용' : ''}</span>
          <h1>{topic}</h1>
        </div>
        <div className="live-room-header-actions">
          {user.id === hostId && !sessionFinished && (
            <button type="button" className="btn btn-primary" onClick={() => void handleFinishDebate()}>
              <Gavel size={17} /> 토론 종료·AI 평가
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleCopyInvite}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? '복사됨' : '초대 링크'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            <LogOut size={17} /> 나가기
          </button>
        </div>
      </header>

      <section className="session-strip live-session-strip">
        <div className="participant-strip">
          <div className={`compact-player user ${isMyStage ? 'responsible' : ''}`}>
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.id)}`} alt="" />
            <div>
              <strong>{user.nickname}</strong>
              <span>나 · {myRole === 'moderator' ? '진행자' : `${getPositionLabel(myPosition)} · ${getRoleLabel(myRole)}`}</span>
            </div>
            {isSpeaking ? <em>발언 중</em> : isMyStage && <em>현재 담당</em>}
          </div>
          {participants.length ? participants.map(participant => (
            <div key={participant.id} className={`compact-player user ${!sessionFinished && participant.role === currentOwnerRole ? 'responsible' : ''}`}>
              <UserRound size={30} />
              <div>
                <strong>{participant.name}</strong>
                <span>{participant.role === 'moderator' ? '진행자' : `${getPositionLabel(participant.position)} · ${getRoleLabel(participant.role)}`}</span>
              </div>
              {participant.isSpeaking ? <em>발언 중</em> : !sessionFinished && participant.role === currentOwnerRole && <em>현재 담당</em>}
            </div>
          )) : (
            <div className="compact-player">
              <UserRound size={30} /><div><strong>토론방 연결 중</strong><span>대기실 참가자를 불러오고 있습니다</span></div>
            </div>
          )}
        </div>

        <div className={`live-connection-chip ${connection}`}>
          <Radio size={16} />
          <span>{isRoomReady && !allDebatersConnected
            ? `참가자 연결 중 ${connectedDebaterCount}/${requiredDebaterCount}`
            : getConnectionLabel(connection)}</span>
        </div>

        <div className={`compact-timer ${remainingSeconds <= 60 ? 'urgent' : ''}`}>
          <Clock size={16} />
          <strong>{formatTimer(remainingSeconds)}</strong>
          <span>{sessionFinished ? '토론 시간 종료' : `${currentPhase.label} · 남은 시간`}</span>
        </div>
      </section>

      <section className={`live-stage-owner-banner ${sessionFinished ? 'ended' : ''}`} aria-live="polite">
        <div className="live-stage-title">
          <span>{sessionFinished ? '토론 종료' : '현재 단계'}</span>
          <strong>{sessionFinished ? 'AI 심판이 토론을 분석합니다' : currentPhase.label}</strong>
          {!sessionFinished && <small>{getRoleLabel(currentOwnerRole)} 담당 순서</small>}
        </div>
        {!sessionFinished && (
          <div className="live-stage-owners">
            <article className="affirmative">
              <span>찬성팀 담당</span>
              <strong>{affirmativeStageOwner?.name || '담당자 확인 중'}</strong>
              <small>{affirmativeStageOwner?.isLocal ? '나 · 지금 담당' : getRoleLabel(currentOwnerRole)}</small>
            </article>
            <div><Radio size={19} /><span>발언 단계</span></div>
            <article className="negative">
              <span>반대팀 담당</span>
              <strong>{negativeStageOwner?.name || '담당자 확인 중'}</strong>
              <small>{negativeStageOwner?.isLocal ? '나 · 지금 담당' : getRoleLabel(currentOwnerRole)}</small>
            </article>
          </div>
        )}
      </section>

      {connectionError && (
        <div className="live-room-alert error" role="alert">
          <AlertCircle size={18} />
          <span>{connectionError}</span>
        </div>
      )}

      {isAudioBlocked && (
        <button type="button" className="live-room-alert audio" onClick={handleEnableAudio}>
          <Headphones size={18} />
          상대방 음성을 들으려면 오디오 재생을 허용해 주세요.
        </button>
      )}

      <main className="live-room-workspace">
        <section className="chat-panel" aria-label="실시간 토론 대화">
          <div className="conversation-list">
            {displayArguments.length === 0 && (
              <div className="live-room-empty">
                <Mic size={28} />
                <strong>{allDebatersConnected
                  ? '모든 토론자가 연결되었습니다. 첫 발언을 시작하세요.'
                  : `대기실 참가자를 토론방에 연결하고 있습니다. (${connectedDebaterCount}/${requiredDebaterCount})`}</strong>
                <span>{allDebatersConnected
                  ? '말하는 동안 상대방에게 음성이 전달되고, 중지하면 Gemini 전사문이 양쪽 화면에 등록됩니다.'
                  : '대기실에서 준비를 마친 참가자는 자동으로 이 화면에 연결됩니다.'}</span>
              </div>
            )}

            {displayArguments.map(argument => (
              <ArgumentCard key={argument.id} argument={argument} player={getPlayer(argument)} />
            ))}

            <div className={`input-zone ${isRoomReady && allDebatersConnected ? 'my-turn' : ''}`}>
              <div className="input-container">
                <div className="composer-head">
                  <span>
                    <Radio size={17} />
                    {allDebatersConnected ? '내 발언' : `참가자 연결 중 ${connectedDebaterCount}/${requiredDebaterCount}`}
                  </span>
                  <small>{content.length}/1200</small>
                </div>
                <div className="composer-row">
                  <textarea
                    className={`input-textarea ${isSpeaking ? 'is-listening' : ''}`}
                    value={content}
                    maxLength={1200}
                    disabled={composerDisabled}
                    placeholder={allDebatersConnected
                      ? '텍스트로 발언하거나 마이크 버튼을 누르고 말하세요.'
                      : '대기실 참가자가 모두 연결되면 바로 발언할 수 있습니다.'}
                    onChange={event => setContent(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleTextSubmit();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`btn microphone-button ${isSpeaking ? 'is-listening' : ''}`}
                    onClick={handleMicrophoneClick}
                    disabled={composerDisabled || isTranscribing}
                    aria-pressed={isSpeaking}
                    title={isSpeaking ? '발언 종료 후 텍스트 변환' : '누르고 발언 시작'}
                  >
                    {isTranscribing
                      ? <LoaderCircle className="spin" size={20} />
                      : isSpeaking
                        ? <Square size={18} fill="currentColor" />
                        : <Mic size={20} />}
                    <span>{isTranscribing ? '변환 중' : isSpeaking ? '발언 종료' : '발언 시작'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary send-button"
                    onClick={() => void handleTextSubmit()}
                    disabled={composerDisabled || isSpeaking || isTranscribing || !content.trim()}
                  >
                    <Send size={18} />
                    <span>전송</span>
                  </button>
                </div>

                {(isSpeaking || isTranscribing || speechError) && (
                  <div className={`speech-status ${speechError ? 'error' : ''}`} role={speechError ? 'alert' : 'status'}>
                    {isSpeaking && <span className="speech-pulse" aria-hidden="true" />}
                    {isTranscribing && <LoaderCircle className="spin" size={14} />}
                    <span>
                      {speechError
                        || (isTranscribing
                          ? 'Gemini가 발언을 변환하고 있습니다. 완료되면 양쪽 화면에 자동 등록됩니다.'
                          : `LiveKit으로 발언 전달 중 ${formatTimer(recordingSeconds)} · 중지하면 텍스트로 변환됩니다.`)}
                    </span>
                    {speechError && pendingRecording && !isTranscribing && (
                      <button
                        type="button"
                        className="speech-retry-button"
                        onClick={() => void runTranscription(pendingRecording)}
                      >
                        <RotateCcw size={13} /> 다시 전사
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div ref={scrollAnchorRef} />
          </div>
        </section>

        <aside className="coach-panel live-room-guide">
          <div className="coach-section">
            <h2><Users size={18} /> 이용 방법</h2>
            <ol>
              <li>대기실에서 준비를 마친 참가자는 자동으로 연결됩니다.</li>
              <li>발언 시작을 누르면 상대방에게 음성이 전달됩니다.</li>
              <li>발언 종료를 누르면 음성이 Gemini로 전사됩니다.</li>
              <li>전사 결과는 양쪽 토론 기록에 자동 등록됩니다.</li>
            </ol>
          </div>
          <div className="coach-section">
            <h2><Radio size={18} /> 현재 상태</h2>
            <dl className="live-room-status-list">
              <div><dt>LiveKit</dt><dd>{getConnectionLabel(connection)}</dd></div>
              <div><dt>토론자 연결</dt><dd>{connectedDebaterCount} / {requiredDebaterCount}명</dd></div>
              <div><dt>현재 단계</dt><dd>{currentPhase.label} · {formatDebateMinutes(currentPhase.seconds)}</dd></div>
              <div><dt>내 마이크</dt><dd>{isSpeaking ? '송출 중' : '꺼짐'}</dd></div>
              <div><dt>녹음 저장</dt><dd>저장 안 함</dd></div>
            </dl>
          </div>
        </aside>
      </main>

      {(showEvaluation || sessionFinished) && (
        <LiveDebateEvaluationModal
          evaluation={evaluation}
          user={user}
          error={evaluationError}
          onRetry={isEvaluationLeader ? () => {
            evaluationRequestedRef.current = false;
            setEvaluationError(null);
            void runEvaluation();
          } : undefined}
          onClose={() => navigate(searchParams.get('audience') === 'organization' ? '/institution' : '/')}
        />
      )}

      <div ref={audioContainerRef} className="livekit-audio-container" aria-hidden="true" />
    </div>
  );
};
