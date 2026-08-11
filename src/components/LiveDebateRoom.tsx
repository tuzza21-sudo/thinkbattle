import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Gavel,
  Headphones,
  LoaderCircle,
  Lightbulb,
  LogIn,
  LogOut,
  Mic,
  Radio,
  RotateCcw,
  Send,
  Square,
  UserRound,
  Users,
  Volume2,
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
import { TopicBriefingDetails } from './TopicBriefingDetails';
import { supabase } from '../lib/supabase';
import { transcribeDebateAudio } from '../lib/transcription';
import { formatDebateMinutes } from '../lib/debateTiming';
import { getLiveDebateCourse, getLiveDebateProgress, getLiveDebateStageId, getLiveDebateStageOptions } from '../lib/liveDebateCourse';
import { generateLiveDebateEvaluation } from '../lib/api';
import { getDebateRoom, getLiveDebateArguments, getLiveDebateEvaluation, getLobbyParticipants, saveLiveDebateArgument, saveLiveDebateEvaluation } from '../lib/debateRooms';
import { saveDebateRecord } from '../lib/history';
import type { AppUser, Argument, DebateLevel, DebateParticipantRole, DebatePosition, DebateRecord, DebateStageId, DebateTeamSize, LiveDebateArgument, LiveDebateEvaluation, Player, TopicBriefing } from '../types';

interface LiveDebateRoomProps {
  user: AppUser | null;
  onLoginRequest: () => void;
}

type LivePacket =
  | {
      version: 1;
      type: 'argument';
      argument: LiveDebateArgument;
    }
  | {
      version: 1;
      type: 'history';
      arguments: LiveDebateArgument[];
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

type LiveParticipantView = {
  id: string;
  name: string;
  isSpeaking: boolean;
  position: DebatePosition;
  role: DebateParticipantRole;
  phaseIds: DebateStageId[];
  isAi: boolean;
};

const LIVE_DATA_TOPIC = 'thinkbattle.debate';
const MAX_VOICE_RECORDING_SECONDS = 180;
const EMPTY_STAGE_IDS: DebateStageId[] = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type PendingRecording = {
  blob: Blob;
  phaseId?: string;
  phaseLabel?: string;
};

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
const getOppositePosition = (position: DebatePosition): DebatePosition =>
  position === 'affirmative' ? 'negative' : 'affirmative';

const isLiveArgument = (value: unknown): value is LiveDebateArgument => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LiveDebateArgument>;
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
  const debateLevel: DebateLevel = searchParams.get('level') === 'intermediate' ? 'intermediate' : 'beginner';
  const voiceEnabled = searchParams.get('voice') === '1';
  const configuredStartedAt = searchParams.get('startedAt');
  const startedAtMs = configuredStartedAt ? Date.parse(configuredStartedAt) : Number.NaN;
  const selectedPosition = searchParams.get('myPosition');
  const routePosition: DebatePosition = selectedPosition === 'negative'
    ? 'negative'
    : selectedPosition === 'affirmative'
      ? 'affirmative'
      : user?.id === hostId
        ? hostPosition
        : getOppositePosition(hostPosition);
  const roleParam = searchParams.get('role');
  const routeRole: DebateParticipantRole = ['debater', 'opening', 'rebuttal', 'closing', 'moderator'].includes(roleParam || '')
    ? roleParam as DebateParticipantRole
    : 'debater';
  const [confirmedSeat, setConfirmedSeat] = useState<{
    position?: DebatePosition;
    role: DebateParticipantRole;
    phaseIds: DebateStageId[];
  } | null>(null);
  const myPosition = confirmedSeat?.position ?? routePosition;
  const myRole = confirmedSeat?.role ?? routeRole;
  const myPhaseIds = confirmedSeat?.phaseIds ?? EMPTY_STAGE_IDS;

  const roomRef = useRef<Room | null>(null);
  const textChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const argumentsRef = useRef<LiveDebateArgument[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const discardRecordingRef = useRef(false);
  const recordingPhaseRef = useRef<Pick<PendingRecording, 'phaseId' | 'phaseLabel'> | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const evaluationRequestedRef = useRef(false);
  const savedEvaluationRef = useRef(false);
  const transcriptRecordQueuedRef = useRef(false);
  const debateRecordIdRef = useRef(createMessageId());
  const recordSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lobbyRosterRef = useRef<LiveParticipantView[]>([]);

  const [connection, setConnection] = useState<ConnectionView>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<LiveParticipantView[]>([]);
  const [argumentsList, setArgumentsList] = useState<LiveDebateArgument[]>([]);
  const [content, setContent] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sessionStartedAtMs] = useState(() => Number.isFinite(startedAtMs) ? startedAtMs : Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Number.isFinite(startedAtMs)
    ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
    : 0);
  const [forcedFinished, setForcedFinished] = useState(false);
  const [evaluation, setEvaluation] = useState<LiveDebateEvaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [topicDescription, setTopicDescription] = useState('');
  const [topicBriefing, setTopicBriefing] = useState<TopicBriefing | undefined>();
  const [roomLanguage, setRoomLanguage] = useState<'ko' | 'en'>('ko');
  const [showVoiceTranscript, setShowVoiceTranscript] = useState(false);

  const queueDebateRecordSave = useCallback((record: DebateRecord) => {
    const nextSave = recordSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveDebateRecord(record));
    recordSaveQueueRef.current = nextSave.catch(() => undefined);
    return nextSave;
  }, []);

  const mergeWithLobbyRoster = useCallback((liveParticipants: LiveParticipantView[]) => {
    const liveById = new Map(liveParticipants.map(participant => [participant.id, participant]));
    const rosterIds = new Set(lobbyRosterRef.current.map(participant => participant.id));
    return [
      ...lobbyRosterRef.current.map(participant => {
        const liveParticipant = liveById.get(participant.id);
        return liveParticipant ? { ...participant, ...liveParticipant, phaseIds: participant.phaseIds } : participant;
      }),
      ...liveParticipants.filter(participant => !rosterIds.has(participant.id)),
    ];
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getDebateRoom(roomId), getLobbyParticipants(roomId)]).then(([room, lobbyParticipants]) => {
      if (cancelled) return;
      if (room) {
        setTopicDescription(room.topicDescription);
        setTopicBriefing(room.topicBriefing);
        setRoomLanguage(room.language);
      }
      const localSeat = lobbyParticipants.find(participant => participant.userId === user?.id && participant.role);
      if (localSeat?.role) {
        setConfirmedSeat({
          position: localSeat.position,
          role: localSeat.role,
          phaseIds: localSeat.phaseIds,
        });
      }
      const roster = lobbyParticipants
        .filter(participant => !participant.isAi && participant.userId !== user?.id && participant.role && (participant.role === 'moderator' || participant.position))
        .map<LiveParticipantView>(participant => ({
          id: participant.userId,
          name: participant.nickname,
          isSpeaking: false,
          position: participant.position === 'negative' ? 'negative' : 'affirmative',
          role: participant.role as DebateParticipantRole,
          phaseIds: participant.phaseIds,
          isAi: false,
        }));
      lobbyRosterRef.current = roster;
      setParticipants(previous => mergeWithLobbyRoster(previous));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [mergeWithLobbyRoster, roomId, user?.id]);

  const addArguments = useCallback((incoming: LiveDebateArgument[]) => {
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

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    void getLiveDebateArguments(roomId)
      .then(storedArguments => {
        if (!cancelled) addArguments(storedArguments);
      })
      .catch(error => console.warn('Stored debate argument sync error:', error));
    return () => { cancelled = true; };
  }, [addArguments, roomId]);

  const handleLivePacket = useCallback((packet: Partial<LivePacket>) => {
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
  }, [addArguments, roomId]);

  const publishPacket = useCallback(async (packet: LivePacket, destinationIdentities?: string[]) => {
    if (!voiceEnabled) {
      const channel = textChannelRef.current;
      if (!channel) throw new Error('텍스트 토론 채널에 연결되어 있지 않습니다.');
      const status = await channel.send({ type: 'broadcast', event: 'packet', payload: packet });
      if (status !== 'ok') throw new Error('텍스트 토론 메시지를 전송하지 못했습니다.');
      return;
    }
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
  }, [voiceEnabled]);

  const publishArgument = useCallback(async (
    text: string,
    source: LiveDebateArgument['source'],
    completion?: Pick<PendingRecording, 'phaseId' | 'phaseLabel'>,
  ) => {
    if (!user) return;
    const trimmed = text.trim().slice(0, 1200);
    if (!trimmed) return;

    const phases = getLiveDebateCourse(timeLimit, debateLevel);
    const progress = getLiveDebateProgress(phases, argumentsRef.current, sessionStartedAtMs);
    const phase = phases[Math.min(progress.completedPhaseCount, phases.length - 1)];
    const stageId = getLiveDebateStageId(phase);
    const isAssignedSpeaker = myRole !== 'moderator'
      && myPosition === phase.position
      && (teamSize === 1 || myPhaseIds.includes(stageId));
    const phaseId = isAssignedSpeaker ? completion?.phaseId || phase.id : undefined;
    const phaseLabel = isAssignedSpeaker
      ? completion?.phaseLabel || phase.label
      : `진행자 발언 · ${phase.label}`;
    const argument: LiveDebateArgument = {
      id: createMessageId(),
      senderId: user.id,
      senderName: user.nickname,
      content: trimmed,
      createdAt: new Date().toISOString(),
      source,
      phaseId,
      phaseLabel,
    };

    const registeredAt = await saveLiveDebateArgument(roomId, argument);
    const registeredArgument = { ...argument, createdAt: registeredAt };
    addArguments([registeredArgument]);
    await publishPacket({ version: 1, type: 'argument', argument: registeredArgument });
  }, [addArguments, debateLevel, myPhaseIds, myPosition, myRole, publishPacket, roomId, sessionStartedAtMs, teamSize, timeLimit, user]);

  useEffect(() => {
    if (!user || !roomId || voiceEnabled) return;
    let cancelled = false;
    const channel = supabase.channel(`live-debate-text-${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: user.id },
      },
    });
    textChannelRef.current = channel;
    const refreshStoredArguments = () => {
      void getLiveDebateArguments(roomId).then(addArguments).catch(() => undefined);
    };
    refreshStoredArguments();
    const argumentPollingId = window.setInterval(refreshStoredArguments, 1500);

    const refreshPresence = () => {
      if (cancelled) return;
      const nextParticipants = Object.values(channel.presenceState())
        .flat()
        .map(item => item as unknown as {
          id?: string;
          name?: string;
          position?: DebatePosition;
          role?: DebateParticipantRole;
        })
        .filter(item => item.id && item.id !== user.id)
        .map(item => ({
          id: item.id as string,
          name: item.name || '토론 참가자',
          isSpeaking: false,
          position: item.position === 'negative' ? 'negative' as const : 'affirmative' as const,
          role: item.role && ['debater', 'opening', 'rebuttal', 'closing', 'moderator'].includes(item.role)
            ? item.role
            : 'debater' as const,
          phaseIds: [] as DebateStageId[],
          isAi: false,
        }));
      setParticipants(mergeWithLobbyRoster(nextParticipants));
    };

    channel
      .on('broadcast', { event: 'packet' }, message => {
        handleLivePacket(message.payload as Partial<LivePacket>);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_debate_arguments',
        filter: `room_id=eq.${roomId}`,
      }, refreshStoredArguments)
      .on('presence', { event: 'sync' }, refreshPresence)
      .on('presence', { event: 'join' }, () => {
        refreshPresence();
        const recentArguments = argumentsRef.current.slice(-8);
        if (recentArguments.length > 0) {
          void channel.send({
            type: 'broadcast',
            event: 'packet',
            payload: { version: 1, type: 'history', arguments: recentArguments } satisfies LivePacket,
          });
        }
      })
      .on('presence', { event: 'leave' }, refreshPresence)
      .subscribe(status => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          void channel.track({
            id: user.id,
            name: user.nickname,
            position: myPosition,
            role: myRole,
          });
          setConnection('connected');
          setConnectionError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('error');
          setConnectionError('텍스트 토론 채널에 연결하지 못했습니다.');
        }
      });

    return () => {
      cancelled = true;
      window.clearInterval(argumentPollingId);
      if (textChannelRef.current === channel) textChannelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [addArguments, handleLivePacket, mergeWithLobbyRoster, myPosition, myRole, roomId, user, voiceEnabled]);

  useEffect(() => {
    if (!user || !roomId || !voiceEnabled) return;
    let cancelled = false;
    const room = new Room({
      adaptiveStream: false,
      dynacast: true,
      disconnectOnPageLeave: true,
    });
    roomRef.current = room;

    const refreshParticipants = () => {
      const liveParticipants = [...room.remoteParticipants.values()].map<LiveParticipantView>(participant => {
        let metadata: { position?: DebatePosition; role?: DebateParticipantRole } = {};
        try { metadata = JSON.parse(participant.metadata || '{}') as typeof metadata; } catch { /* ignore malformed metadata */ }
        return {
          id: participant.identity,
          name: participant.name || '토론 참가자',
          isSpeaking: participant.isSpeaking,
          position: metadata.position === 'negative' ? 'negative' : 'affirmative',
          role: ['debater', 'opening', 'rebuttal', 'closing', 'moderator'].includes(metadata.role || '') ? metadata.role as DebateParticipantRole : 'debater',
          phaseIds: [] as DebateStageId[],
          isAi: false,
        };
      });
      setParticipants(mergeWithLobbyRoster(liveParticipants));
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
        handleLivePacket(packet);
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
        if (cancelled) return;
        const nextConnection = getConnectionView(state);
        setConnection(nextConnection);
        if (nextConnection === 'connected') setConnectionError(null);
        if (nextConnection === 'disconnected') {
          setConnectionError('실시간 토론 연결이 끊겼습니다. 다시 연결하면 저장된 발언부터 이어서 진행됩니다.');
        }
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
            }),
          });
          const responseText = await response.text();
          let payload: { token?: string; url?: string; error?: string } = {};
          try {
            payload = responseText ? JSON.parse(responseText) as typeof payload : {};
          } catch {
            if (!response.ok) {
              throw new Error(`LiveKit 서버 함수 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`);
            }
            throw new Error('LiveKit 서버가 올바르지 않은 응답을 반환했습니다.');
          }
          if (!response.ok || !payload.token || !payload.url) {
            throw new Error(payload.error || `LiveKit 접속 정보를 받지 못했습니다. (${response.status})`);
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
      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
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
  }, [addArguments, allowModerator, handleLivePacket, mergeWithLobbyRoster, myPosition, myRole, publishPacket, roomId, teamSize, user, voiceEnabled]);

  useEffect(() => {
    if (Number.isFinite(startedAtMs)) {
      const timerId = window.setInterval(() => {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
      }, 1000);
      return () => window.clearInterval(timerId);
    }
    if (connection !== 'connected' || participants.length === 0) return;
    const timerId = window.setInterval(() => {
      setElapsedSeconds(previous => previous + 1);
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

  const runTranscription = async (pending: PendingRecording) => {
    const controller = new AbortController();
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = controller;
    setIsTranscribing(true);
    setSpeechError(null);

    try {
      const transcript = await transcribeDebateAudio(pending.blob, {
        topic,
        roundTitle: '사람 대 사람 토론 발언',
        roundInstruction: '발언을 정확히 전사하여 상대방에게 전달합니다.',
        language: roomLanguage,
      }, controller.signal);
      if (controller.signal.aborted) return;
      await publishArgument(transcript, 'voice', pending);
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
    if (!voiceEnabled) {
      setSpeechError('이 방은 텍스트 전용 토론방입니다.');
      return;
    }
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      setSpeechError('LiveKit 연결이 완료된 뒤 마이크를 사용할 수 있습니다.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSpeechError('이 브라우저는 마이크 음성 입력을 지원하지 않습니다.');
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
        setSpeechError('마이크 입력 중 오류가 발생했습니다. 다시 시도해 주세요.');
        void stopSpeaking(true);
      };
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        if (discardRecordingRef.current) {
          recordedChunksRef.current = [];
          recordingPhaseRef.current = null;
          return;
        }
        const recording = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || supportedMimeType || 'audio/webm',
        });
        recordedChunksRef.current = [];
        if (recording.size === 0) {
          setSpeechError('인식된 음성이 없습니다. 다시 시도해 주세요.');
          return;
        }
        const pending = {
          blob: recording,
          phaseId: recordingPhaseRef.current?.phaseId,
          phaseLabel: recordingPhaseRef.current?.phaseLabel,
        } satisfies PendingRecording;
        recordingPhaseRef.current = null;
        setPendingRecording(pending);
        void runTranscription(pending);
      };

      const phases = getLiveDebateCourse(timeLimit, debateLevel);
      const progress = getLiveDebateProgress(phases, argumentsRef.current, sessionStartedAtMs);
      const recordingPhase = phases[Math.min(progress.completedPhaseCount, phases.length - 1)];
      recordingPhaseRef.current = {
        phaseId: recordingPhase.id,
        phaseLabel: recordingPhase.label,
      };
      recorder.start(1000);
      setRecordingSeconds(0);
      setIsSpeaking(true);
      recordingTimeoutRef.current = window.setTimeout(() => {
        void stopSpeaking();
      }, MAX_VOICE_RECORDING_SECONDS * 1000);
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

  const phaseTimings = useMemo(() => getLiveDebateCourse(timeLimit, debateLevel), [debateLevel, timeLimit]);
  const stageOptions = useMemo(() => getLiveDebateStageOptions(debateLevel), [debateLevel]);
  const debateProgress = useMemo(
    () => getLiveDebateProgress(phaseTimings, argumentsList, sessionStartedAtMs),
    [argumentsList, phaseTimings, sessionStartedAtMs],
  );
  const currentPhaseIndex = Math.min(debateProgress.completedPhaseCount, phaseTimings.length - 1);
  const currentPhase = phaseTimings[currentPhaseIndex] || phaseTimings[phaseTimings.length - 1];
  const currentPhaseElapsedSeconds = Math.max(
    0,
    Math.floor(((sessionStartedAtMs + elapsedSeconds * 1000) - debateProgress.activePhaseStartedAtMs) / 1000),
  );
  const currentPhaseRemainingSeconds = Math.max(0, currentPhase.seconds - currentPhaseElapsedSeconds);
  const currentPhaseOvertimeSeconds = Math.max(0, currentPhaseElapsedSeconds - currentPhase.seconds);
  const currentStageId = getLiveDebateStageId(currentPhase);
  const allDebaters = [
    {
      id: user?.id || '',
      name: user?.nickname || '나',
      position: myPosition,
      role: myRole,
      phaseIds: myPhaseIds,
      isLocal: true,
      isAi: false,
    },
    ...participants.map(participant => ({ ...participant, isLocal: false })),
  ].filter(participant => participant.role !== 'moderator');
  const currentStageOwner = allDebaters.find(participant => participant.position === currentPhase.position
    && (teamSize === 1 || participant.phaseIds.includes(currentStageId)));
  const targetStageId: DebateStageId = currentStageId === 'question'
    ? 'answer'
    : currentStageId === 'answer'
      ? 'question'
      : currentStageId;
  const targetStageOwner = currentPhase.targetPosition
    ? allDebaters.find(participant => participant.position === currentPhase.targetPosition
      && (teamSize === 1 || participant.phaseIds.includes(targetStageId)))
    : undefined;
  const sessionFinished = forcedFinished || debateProgress.completedPhaseCount >= phaseTimings.length;
  const transcriptVisible = !voiceEnabled || showVoiceTranscript || sessionFinished;
  const getAssignedStageLabel = (phaseIds: DebateStageId[]) => teamSize === 1
    ? '전 단계 담당'
    : stageOptions.filter(stage => phaseIds.includes(stage.id)).map(stage => stage.label).join(' · ') || '단계 미배정';
  const isMyStage = !sessionFinished
    && myRole !== 'moderator'
    && myPosition === currentPhase.position
    && (teamSize === 1 || myPhaseIds.includes(currentStageId));
  const isRoomReady = connection === 'connected';
  const requiredDebaterCount = teamSize * 2;
  const connectedDebaterCount = (myRole === 'moderator' ? 0 : 1)
    + participants.filter(participant => participant.role !== 'moderator').length;
  const composerDisabled = !isRoomReady
    || sessionFinished
    || (myRole !== 'moderator' && !isMyStage);
  const isEvaluationLeader = !!user && user.id === hostId;

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
      const nextEvaluation = await generateLiveDebateEvaluation(topic, evaluationParticipants, argumentsRef.current, {
        description: topicDescription,
        level: debateLevel,
      });
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
  }, [debateLevel, myPosition, myRole, participants, publishPacket, roomId, topic, topicDescription, user]);

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
    ...(() => {
      const timing = debateProgress.argumentTimingById[argument.id];
      const phase = phaseTimings.find(item => item.id === argument.phaseId);
      return {
        roundId: phase?.roundId,
        recommendedDurationSeconds: timing?.recommendedSeconds,
        elapsedSeconds: timing?.elapsedSeconds,
        overtimeSeconds: timing?.overtimeSeconds,
      };
    })(),
    id: argument.id,
    playerId: argument.senderId,
    isAi: participants.some(participant => participant.id === argument.senderId && participant.isAi),
    content: argument.content,
    timestamp: new Date(argument.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    roundTitle: argument.phaseLabel || (argument.source === 'voice' ? '음성 전사' : '텍스트 발언'),
  })), [argumentsList, debateProgress.argumentTimingById, participants, phaseTimings]);

  useEffect(() => {
    if (!sessionFinished || !user || transcriptRecordQueuedRef.current) return;
    const saveTimer = window.setTimeout(() => {
      if (transcriptRecordQueuedRef.current) return;
      transcriptRecordQueuedRef.current = true;
      void queueDebateRecordSave({
        id: debateRecordIdRef.current,
        userId: user.id,
        topic,
        matchType: `${teamSize}:${teamSize} 사람 대 사람 ${voiceEnabled ? '음성' : '텍스트'} 토론`,
        gameMode: 'pvp',
        userPosition: myPosition,
        aiPosition: myPosition === 'affirmative' ? 'negative' : 'affirmative',
        debateLevel,
        debateFocus: 'fact',
        durationSeconds: elapsedSeconds,
        completedAt: new Date().toISOString(),
        arguments: displayArguments,
        report: {
          overallFeedback: evaluationError ? 'AI 평가는 완료되지 않았지만 토론 발언 기록은 정상적으로 저장되었습니다.' : 'AI 평가를 준비하고 있습니다.',
          categories: [],
          totalScore: 0,
          xpEarned: 0,
        },
      }).catch(error => {
        transcriptRecordQueuedRef.current = false;
        console.error('Live debate transcript save error:', error);
      });
    }, 2500);
    return () => window.clearTimeout(saveTimer);
  }, [debateLevel, displayArguments, elapsedSeconds, evaluationError, myPosition, queueDebateRecordSave, sessionFinished, teamSize, topic, user, voiceEnabled]);

  useEffect(() => {
    if (!evaluation || !user || savedEvaluationRef.current) return;
    const personal = evaluation.participantReports.find(participant => participant.userId === user.id);
    if (!personal) return;
    savedEvaluationRef.current = true;
    transcriptRecordQueuedRef.current = true;
    void queueDebateRecordSave({
      id: debateRecordIdRef.current,
      userId: user.id,
      topic,
      matchType: `${teamSize}:${teamSize} 사람 대 사람 ${voiceEnabled ? '음성' : '텍스트'} 토론`,
      gameMode: 'pvp',
      userPosition: personal.position,
      aiPosition: personal.position === 'affirmative' ? 'negative' : 'affirmative',
      debateLevel,
      debateFocus: 'fact',
      durationSeconds: elapsedSeconds,
      completedAt: evaluation.generatedAt,
      arguments: displayArguments,
      report: personal.report,
    }).catch(error => {
      savedEvaluationRef.current = false;
      console.error('Live debate report save error:', error);
    });
  }, [debateLevel, displayArguments, elapsedSeconds, evaluation, queueDebateRecordSave, teamSize, topic, user, voiceEnabled]);

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
      rankBadge: isLocal ? '나' : remoteParticipant?.isAi ? 'AI 팀원' : '참가자',
      score: 0,
      streak: 0,
      isAi: remoteParticipant?.isAi ?? false,
    };
  };

  if (!user) {
    return (
      <div className="app-container live-login-gate">
        <div className="live-gate-card">
          <Users size={38} />
          <h1>{topic}</h1>
          <p>초대받은 사람 대 사람 {voiceEnabled ? '음성' : '텍스트'} 토론방입니다. 로그인하면 방에 바로 참가합니다.</p>
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
          <span className="badge">{voiceEnabled ? 'VOICE LIVE' : 'TEXT LIVE'} · {debateLevel === 'intermediate' ? '중급' : '초급'} · {teamSize}:{teamSize} {teamSize === 1 ? '개인' : '팀'} 토론{allowModerator ? ' · 진행자 허용' : ''}</span>
          <h1>{topic}</h1>
          {topicDescription && <p>{topicDescription}</p>}
        </div>
        <div className="live-room-header-actions">
          {voiceEnabled && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowVoiceTranscript(value => !value)} disabled={sessionFinished}>
              {transcriptVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              {sessionFinished ? '전체 기록 표시 중' : transcriptVisible ? '텍스트 숨기기' : '텍스트 보기'}
            </button>
          )}
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
      {topicBriefing && <TopicBriefingDetails briefing={topicBriefing} language={roomLanguage} />}

      <section className="session-strip live-session-strip">
        <div className="participant-strip">
          <div className={`compact-player user ${isMyStage ? 'responsible' : ''}`}>
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.id)}`} alt="" />
            <div>
              <strong>{user.nickname}</strong>
              <span>나 · {myRole === 'moderator' ? '진행자' : `${getPositionLabel(myPosition)} · ${getAssignedStageLabel(myPhaseIds)}`}</span>
            </div>
            {isSpeaking ? <em>발언 중</em> : isMyStage && <em>현재 담당</em>}
          </div>
          {participants.length ? participants.map(participant => (
            <div key={participant.id} className={`compact-player user ${!sessionFinished && participant.id === currentStageOwner?.id ? 'responsible' : ''}`}>
              <UserRound size={30} />
              <div>
                <strong>{participant.name}</strong>
                <span>{participant.role === 'moderator' ? '진행자' : `${getPositionLabel(participant.position)} · ${getAssignedStageLabel(participant.phaseIds)}`}</span>
              </div>
              {participant.isSpeaking ? <em>발언 중</em> : !sessionFinished && participant.id === currentStageOwner?.id && <em>현재 담당</em>}
            </div>
          )) : (
            <div className="compact-player">
              <UserRound size={30} /><div><strong>토론방 연결 중</strong><span>대기실 참가자를 불러오고 있습니다</span></div>
            </div>
          )}
        </div>

        <div className={`live-connection-chip ${connection}`}>
          {voiceEnabled ? <Volume2 size={16} /> : <Radio size={16} />}
          <span>{voiceEnabled ? 'LiveKit' : '텍스트 채널'} {getConnectionLabel(connection)}</span>
        </div>

        <div className={`compact-timer ${currentPhaseOvertimeSeconds > 0 ? 'overtime' : currentPhaseRemainingSeconds <= 30 ? 'urgent' : ''}`}>
          <Clock size={16} />
          <strong>{currentPhaseOvertimeSeconds > 0 ? `+${formatTimer(currentPhaseOvertimeSeconds)}` : formatTimer(currentPhaseRemainingSeconds)}</strong>
          <span>{sessionFinished ? '토론 종료' : currentPhaseOvertimeSeconds > 0 ? `${currentPhase.label} · 권장 시간 초과` : `${currentPhase.label} · 권장 시간`}</span>
        </div>
      </section>

      <section className={`live-stage-owner-banner ${sessionFinished ? 'ended' : ''}`} aria-live="polite">
        <div className="live-stage-title">
          <span>{sessionFinished ? '토론 종료' : '현재 단계'}</span>
          <strong>{sessionFinished ? 'AI 심판이 토론을 분석합니다' : currentPhase.label}</strong>
          {!sessionFinished && <small>{stageOptions.find(stage => stage.id === currentStageId)?.label || currentPhase.label} 담당 순서</small>}
        </div>
        {!sessionFinished && (
          <div className="live-stage-owners">
            <article className={currentPhase.position}>
              <span>{getPositionLabel(currentPhase.position)}팀 현재 담당</span>
              <strong>{currentStageOwner?.name || '담당자 확인 중'}</strong>
              <small>{currentStageOwner?.isLocal ? '나 · 지금 담당' : `${stageOptions.find(stage => stage.id === currentStageId)?.label || currentPhase.label} 담당`}</small>
            </article>
            <div><Radio size={19} /><span>발언 단계</span></div>
            <article className={currentPhase.targetPosition || (currentPhase.position === 'affirmative' ? 'negative' : 'affirmative')}>
              <span>{currentPhase.targetPosition ? `${getPositionLabel(currentPhase.targetPosition)}팀 질문·응답 상대` : '이번 단계 목표'}</span>
              <strong>{currentPhase.targetPosition ? targetStageOwner?.name || '상대 담당자' : currentPhase.instruction}</strong>
              <small>{currentPhase.targetPosition ? `${stageOptions.find(stage => stage.id === targetStageId)?.label || '응답'} 담당` : `${currentPhaseIndex + 1}/${phaseTimings.length} 단계`}</small>
            </article>
          </div>
        )}
      </section>

      {connectionError && (
        <div className="live-room-alert error" role="alert">
          <AlertCircle size={18} />
          <span>{connectionError}</span>
          <button type="button" className="speech-retry-button" onClick={() => window.location.reload()}>
            <RotateCcw size={13} /> 다시 연결
          </button>
        </div>
      )}

      {voiceEnabled && isAudioBlocked && (
        <button type="button" className="live-room-alert audio" onClick={handleEnableAudio}>
          <Headphones size={18} />
          상대방 음성을 들으려면 오디오 재생을 허용해 주세요.
        </button>
      )}

      <main className="live-room-workspace">
        <section className="chat-panel" aria-label="실시간 토론 대화">
          <div className="conversation-list">
            {!transcriptVisible ? (
              <div className={`live-voice-focus ${isMyStage ? 'my-turn' : ''}`}>
                <span className="live-voice-focus-icon">{isSpeaking ? <Mic size={34} /> : <Headphones size={34} />}</span>
                <small>VOICE FOCUS · 텍스트 숨김</small>
                <strong>{isSpeaking ? '지금 발언하고 있습니다' : currentStageOwner?.name ? `${currentStageOwner.name}님의 발언에 집중해 주세요` : `${currentPhase.label} 발언을 기다리고 있습니다`}</strong>
                <p>발언 내용은 자동으로 전사되며, 상단의 ‘텍스트 보기’로 언제든 확인할 수 있습니다.</p>
                <span className="live-voice-record-count"><CheckCircle2 size={15} /> {displayArguments.length}개 발언 전사 완료 · 종료 후 전체 텍스트 확인</span>
              </div>
            ) : displayArguments.length === 0 ? (
              <div className="live-room-empty">
                {voiceEnabled ? <Mic size={28} /> : <Radio size={28} />}
                <strong>{`${currentPhase.label} 담당자가 발언할 차례입니다.`}</strong>
                <span>{voiceEnabled
                  ? '말하는 동안 상대방에게 음성이 전달되고, 발언 종료를 누르면 내용이 자동으로 전사됩니다.'
                  : '텍스트 발언은 Supabase 실시간 채널로 모든 참가자에게 전달되며 LiveKit 사용량에 포함되지 않습니다.'}</span>
              </div>
            ) : null}

            {transcriptVisible && displayArguments.map(argument => (
              <ArgumentCard key={argument.id} argument={argument} player={getPlayer(argument)} />
            ))}

            <div className={`input-zone ${isRoomReady && (isMyStage || myRole === 'moderator') ? 'my-turn' : ''}`}>
              <div className="input-container">
                <div className="composer-head">
                  <span>
                    <Radio size={17} />
                    {isMyStage || myRole === 'moderator'
                      ? `내 발언 · ${currentPhase.label}`
                      : `${currentPhase.label} 진행 중`}
                  </span>
                  {!voiceEnabled && <small>{content.length}/1200</small>}
                </div>
                <div className="composer-row">
                  {voiceEnabled ? (
                    <button
                      type="button"
                      className={`btn microphone-button voice-debate-primary ${isSpeaking ? 'is-listening' : ''}`}
                      onClick={handleMicrophoneClick}
                      disabled={composerDisabled || isTranscribing}
                      aria-pressed={isSpeaking}
                      aria-label={isSpeaking ? '발언 종료 후 자동 전송' : '발언하기'}
                      title={isSpeaking ? '발언 종료 후 자동으로 전송합니다' : '마이크로 발언하기'}
                    >
                      {isTranscribing
                        ? <LoaderCircle className="spin" size={20} />
                        : isSpeaking
                          ? <Square size={18} fill="currentColor" />
                          : <Mic size={20} />}
                      <span>{isTranscribing ? '전송 중' : isSpeaking ? '발언 종료' : '발언하기'}</span>
                    </button>
                  ) : (
                    <>
                      <textarea
                        className="input-textarea"
                        value={content}
                        maxLength={1200}
                        disabled={composerDisabled}
                        placeholder={isMyStage || myRole === 'moderator'
                          ? currentPhase.inputPlaceholder
                          : `${getPositionLabel(currentPhase.position)}팀 담당자의 발언을 기다려 주세요.`}
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
                        className="btn btn-primary send-button"
                        onClick={() => void handleTextSubmit()}
                        disabled={composerDisabled || !content.trim()}
                      >
                        <Send size={18} />
                        <span>전송</span>
                      </button>
                    </>
                  )}
                </div>

                {(isSpeaking || isTranscribing || speechError) && (
                  <div className={`speech-status ${speechError ? 'error' : ''}`} role={speechError ? 'alert' : 'status'}>
                    {isSpeaking && <span className="speech-pulse" aria-hidden="true" />}
                    {isTranscribing && <LoaderCircle className="spin" size={14} />}
                    <span>
                      {speechError
                        || (isTranscribing
                          ? '발언을 변환한 뒤 양쪽 화면에 자동 등록하고 있습니다.'
                          : `LiveKit으로 발언 전달 중 ${formatTimer(recordingSeconds)} · 종료하면 자동 등록됩니다. (최대 3분)`)}
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
          {topicDescription && (
            <div className="coach-section">
              <h2><BookOpen size={18} /> 토론 배경</h2>
              <p>{topicDescription}</p>
            </div>
          )}
          <div className="coach-section">
            <h2><Lightbulb size={18} /> {currentPhase.label} 도움말</h2>
            {currentPhase.purpose && <p>{currentPhase.purpose}</p>}
            <p><strong>지금 할 일</strong><br />{currentPhase.instruction}</p>
            {currentPhase.tasks.length > 0 && (
              <ul>{currentPhase.tasks.slice(0, 4).map(task => <li key={task}>{task}</li>)}</ul>
            )}
            {currentPhase.sentenceFrames.length > 0 && (
              <p><strong>문장 시작 예시</strong><br />{currentPhase.sentenceFrames.slice(0, 2).join(' / ')}</p>
            )}
          </div>
          <div className="coach-section">
            <h2><CheckCircle2 size={18} /> {debateLevel === 'intermediate' ? '중급' : '초급'} 토론 순서</h2>
            <div className="phase-list">
              {phaseTimings.map((phase, index) => (
                <div key={phase.id} className={`phase-item ${!sessionFinished && index === currentPhaseIndex ? 'active' : ''}`}>
                  {index < debateProgress.completedPhaseCount ? <CheckCircle2 size={15} /> : <Radio size={15} />}
                  <span>{phase.label}</span>
                  <small>{formatDebateMinutes(phase.seconds)} 권장</small>
                </div>
              ))}
            </div>
          </div>
          <div className="coach-section">
            <h2>{voiceEnabled ? <Volume2 size={18} /> : <Radio size={18} />} 현재 상태</h2>
            <dl className="live-room-status-list">
              <div><dt>연결 방식</dt><dd>{voiceEnabled ? `LiveKit ${getConnectionLabel(connection)}` : `텍스트 채널 ${getConnectionLabel(connection)}`}</dd></div>
              <div><dt>대기실 확정 명단</dt><dd>{connectedDebaterCount} / {requiredDebaterCount}명</dd></div>
              <div><dt>현재 단계</dt><dd>{currentPhase.label} · {formatDebateMinutes(currentPhase.seconds)} 권장{currentPhaseOvertimeSeconds > 0 ? ` · ${formatTimer(currentPhaseOvertimeSeconds)} 초과` : ''}</dd></div>
              {voiceEnabled && <div><dt>내 마이크</dt><dd>{isSpeaking ? '송출 중' : '꺼짐'}</dd></div>}
              <div><dt>음성 모드</dt><dd>{voiceEnabled ? '사용 · 최대 3분 · 종료 후 자동 등록' : '사용 안 함 · LiveKit 미연결'}</dd></div>
            </dl>
          </div>
        </aside>
      </main>

      {(showEvaluation || sessionFinished) && (
        <LiveDebateEvaluationModal
          evaluation={evaluation}
          user={user}
          topic={topic}
          debateLevel={debateLevel}
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
