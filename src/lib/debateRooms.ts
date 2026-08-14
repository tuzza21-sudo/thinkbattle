import { supabase } from './supabase';
import { normalizeDebateTimeLimit } from './debateTiming';
import type {
  AppUser,
  DebateLevel,
  DebateParticipantRole,
  DebatePosition,
  DebateRoomAudience,
  DebateStageId,
  DebateTeamSize,
  LiveDebateArgument,
  LiveDebateLobbyParticipant,
  LiveDebateEvaluation,
  LiveDebateRoomSummary,
  TopicBriefing,
} from '../types';

type CreateRoomInput = {
  roomId: string;
  topic: string;
  topicDescription: string;
  topicBriefing?: TopicBriefing;
  language?: 'ko' | 'en';
  debateLevel: DebateLevel;
  voiceEnabled: boolean;
  timeLimit: number;
  teamSize: DebateTeamSize;
  allowModerator: boolean;
  audience: DebateRoomAudience;
  organizationId?: string;
  organizationName?: string;
  hostPosition: DebatePosition;
  hostRole: DebateParticipantRole;
};

type SupabaseErrorLike = { message?: string } | null;

const isMissingRoomMetadataColumn = (error: SupabaseErrorLike) => {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes('schema cache')
    && ['language', 'topic_briefing'].some(column => message.includes(`'${column}'`));
};

const mapRoom = (row: Record<string, unknown>): LiveDebateRoomSummary => ({
  id: String(row.id),
  roomId: String(row.room_id),
  hostId: String(row.host_id),
  hostName: String(row.host_name || '토론 개설자'),
  topic: String(row.topic),
  topicDescription: String(row.topic_description || ''),
  topicBriefing: row.topic_briefing && typeof row.topic_briefing === 'object'
    ? row.topic_briefing as TopicBriefing
    : undefined,
  language: row.language === 'en' ? 'en' : 'ko',
  debateLevel: row.debate_level === 'intermediate' ? 'intermediate' : 'beginner',
  voiceEnabled: Boolean(row.voice_enabled),
  timeLimit: Number(row.time_limit) || 600,
  teamSize: ([1, 2, 3].includes(Number(row.team_size)) ? Number(row.team_size) : 1) as DebateTeamSize,
  allowModerator: Boolean(row.allow_moderator),
  audience: row.audience === 'organization' ? 'organization' : 'public',
  organizationId: row.organization_id ? String(row.organization_id) : undefined,
  organizationName: row.organization_name ? String(row.organization_name) : undefined,
  status: row.status === 'closed' ? 'closed' : row.status === 'in_progress' ? 'in_progress' : 'open',
  participantCount: Number(row.participant_count) || 1,
  createdAt: String(row.created_at || new Date().toISOString()),
  startedAt: row.started_at ? String(row.started_at) : undefined,
});

export const createDebateRoom = async (input: CreateRoomInput, user: AppUser) => {
  const timeLimit = normalizeDebateTimeLimit(input.timeLimit);
  const localRoom: LiveDebateRoomSummary = {
    id: input.roomId,
    roomId: input.roomId,
    hostId: user.id,
    hostName: user.nickname,
    topic: input.topic,
    topicDescription: input.topicDescription,
    topicBriefing: input.topicBriefing,
    language: input.language ?? 'ko',
    debateLevel: input.debateLevel,
    voiceEnabled: input.voiceEnabled,
    timeLimit,
    teamSize: input.teamSize,
    allowModerator: input.allowModerator,
    audience: input.audience,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    status: 'open',
    participantCount: 1,
    createdAt: new Date().toISOString(),
  };
  const roomPayload = {
    room_id: input.roomId,
    host_id: user.id,
    host_name: user.nickname,
    topic: input.topic,
    topic_description: input.topicDescription,
    topic_briefing: input.topicBriefing ?? null,
    language: input.language ?? 'ko',
    debate_level: input.debateLevel,
    voice_enabled: input.voiceEnabled,
    time_limit: timeLimit,
    team_size: input.teamSize,
    allow_moderator: input.allowModerator,
    audience: input.audience,
    organization_id: input.organizationId || null,
    organization_name: input.organizationName || null,
    host_position: input.hostPosition,
    host_role: input.hostRole,
  };

  let { error } = await supabase.from('live_debate_rooms').insert(roomPayload);

  // Keep room creation working while the additive metadata migration is rolling out.
  // The canonical fix is supabase_topic_visibility_migration.sql; this fallback can
  // be removed after every environment has those two columns.
  if (isMissingRoomMetadataColumn(error)) {
    const legacyPayload: Record<string, unknown> = { ...roomPayload };
    delete legacyPayload.language;
    delete legacyPayload.topic_briefing;
    ({ error } = await supabase.from('live_debate_rooms').insert(legacyPayload));
  }

  if (error) {
    throw new Error(`토론방을 서버에 저장하지 못했습니다: ${error.message}`);
  }
  const { error: lobbyError } = await supabase.rpc('enter_live_debate_lobby', {
    target_room_id: input.roomId,
    participant_nickname: user.nickname,
    initial_position: null,
    initial_role: null,
  });
  if (lobbyError) throw new Error(`방장 대기실 입장에 실패했습니다: ${lobbyError.message}`);
  return localRoom;
};

export const listDebateRooms = async (
  audience: DebateRoomAudience,
  organizationIds: string[] = [],
  language?: 'ko' | 'en',
): Promise<LiveDebateRoomSummary[]> => {
  const recentThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from('live_debate_rooms')
    .select('*')
    .eq('status', 'open')
    .gte('created_at', recentThreshold)
    .order('created_at', { ascending: false })
    .limit(20);
  query = audience === 'public'
    ? query.eq('audience', 'public')
    : query.eq('audience', 'organization').in('organization_id', organizationIds.length ? organizationIds : ['00000000-0000-0000-0000-000000000000']);
  const { data, error } = await query;
  if (error) throw new Error(`토론방 목록을 불러오지 못했습니다: ${error.message}`);
  const remoteRooms = data?.map(row => mapRoom(row as Record<string, unknown>)) ?? [];
  // Filter client-side so deployments that predate the language column do not
  // produce a 400 response. Legacy rows map to Korean.
  return language ? remoteRooms.filter(room => room.language === language) : remoteRooms;
};

export const incrementRoomParticipants = async (roomId: string) => {
  const { error } = await supabase.rpc('join_live_debate_room', { target_room_id: roomId });
  if (error && !/join_live_debate_room/i.test(error.message)) {
    console.warn('Debate room participant update error:', error.message);
  }
};

const mapParticipant = (row: Record<string, unknown>): LiveDebateLobbyParticipant => ({
  userId: String(row.user_id),
  nickname: String(row.nickname || '참가자'),
  position: row.position === 'affirmative' || row.position === 'negative' ? row.position : undefined,
  role: ['debater', 'opening', 'rebuttal', 'closing', 'moderator'].includes(String(row.role))
    ? row.role as DebateParticipantRole
    : undefined,
  phaseIds: (Array.isArray(row.phase_ids) ? row.phase_ids : [])
    .filter((phaseId): phaseId is DebateStageId => ['opening', 'question', 'answer', 'analysis', 'rebuttal', 'weighing', 'closing'].includes(String(phaseId))),
  isAi: Boolean(row.is_ai),
  isReady: Boolean(row.is_ready),
  joinedAt: String(row.joined_at || new Date().toISOString()),
});

export const getDebateRoom = async (roomId: string): Promise<LiveDebateRoomSummary | null> => {
  const { data, error } = await supabase
    .from('live_debate_rooms')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();
  if (error) throw new Error(`토론방 정보를 불러오지 못했습니다: ${error.message}`);
  return data ? mapRoom(data as Record<string, unknown>) : null;
};

export const getLobbyParticipants = async (roomId: string): Promise<LiveDebateLobbyParticipant[]> => {
  const { data, error } = await supabase
    .from('live_debate_room_participants')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error || !data) return [];
  return data.map(row => mapParticipant(row as Record<string, unknown>));
};

export const enterDebateLobby = async (
  roomId: string,
  user: AppUser,
  initialPosition?: DebatePosition,
  initialRole?: DebateParticipantRole,
) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  const { error } = await supabase.rpc('enter_live_debate_lobby', {
    target_room_id: roomId,
    participant_nickname: user.nickname,
    initial_position: initialPosition ?? null,
    initial_role: initialRole ?? null,
  });
  if (error) {
    const messages: Record<string, string> = {
      'room is not open': '이 토론방은 존재하지 않거나 이미 시작되었습니다.',
      'lobby is full': '대기실 정원이 모두 찼습니다.',
      'login required': '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
      'host left the lobby': '방장이 대기실을 나가 토론방이 종료되었습니다.',
    };
    throw new Error(messages[error.message] || (error.message.includes('function') ? '대기실 데이터베이스 설정이 필요합니다.' : error.message));
  }
};

export const chooseLobbyTeam = async (roomId: string, position: DebatePosition) => {
  const { data, error } = await supabase.rpc('choose_live_debate_team', {
    target_room_id: roomId,
    selected_position: position,
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error(`${position === 'affirmative' ? '찬성' : '반대'} 팀의 인원이 모두 찼습니다.`);
};

export const claimLobbySeat = async (
  roomId: string,
  position: DebatePosition | null,
  role: DebateParticipantRole,
) => {
  const { data, error } = await supabase.rpc('claim_live_debate_seat', {
    target_room_id: roomId,
    selected_position: position,
    selected_role: role,
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error('다른 참가자가 방금 이 역할을 선택했습니다. 다른 자리를 골라 주세요.');
};

export const setLiveDebateStageAssignment = async (
  roomId: string,
  stageId: DebateStageId,
  assigned: boolean,
) => {
  const { data, error } = await supabase.rpc('set_live_debate_stage_assignment', {
    target_room_id: roomId,
    selected_stage_id: stageId,
    assigned,
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error('단계 담당을 변경하지 못했습니다.');
};

export const addLiveDebateAiParticipant = async (
  roomId: string,
  position: DebatePosition,
  role: DebateParticipantRole,
) => {
  const { data, error } = await supabase.rpc('add_live_debate_ai_participant', {
    target_room_id: roomId,
    selected_position: position,
    selected_role: role,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('AI를 배정할 빈 역할이 없습니다.');
  return String(data);
};

export const removeLiveDebateAiParticipant = async (roomId: string, aiUserId: string) => {
  const { data, error } = await supabase.rpc('remove_live_debate_ai_participant', {
    target_room_id: roomId,
    ai_user_id: aiUserId,
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error('AI 참가자를 제거하지 못했습니다.');
};

export const setLobbyReady = async (roomId: string, isReady: boolean) => {
  const { data, error } = await supabase.rpc('set_live_debate_ready', {
    target_room_id: roomId,
    ready: isReady,
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error('준비 상태를 변경하지 못했습니다. 대기실 상태를 확인해 주세요.');
};

export const heartbeatDebateLobby = async (roomId: string) => {
  const { data, error } = await supabase.rpc('heartbeat_live_debate_lobby', { target_room_id: roomId });
  if (error) throw new Error(error.message);
  return data !== false;
};

export const leaveDebateLobby = async (roomId: string) => {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;
  await supabase.from('live_debate_room_participants').delete().eq('room_id', roomId).eq('user_id', userId);
};

export const startDebateFromLobby = async (roomId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('start_live_debate_room', { target_room_id: roomId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('아직 모든 토론자와 준비 상태가 완료되지 않았습니다.');
  return String(data);
};

export const subscribeToDebateLobby = (roomId: string, onChange: () => void) => {
  const channel = supabase
    .channel(`debate-lobby-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_debate_room_participants', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_debate_rooms', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
};

const mapLiveArgument = (row: Record<string, unknown>): LiveDebateArgument => ({
  id: String(row.id),
  senderId: String(row.user_id),
  senderName: String(row.sender_name || '토론 참가자'),
  content: String(row.content || ''),
  createdAt: String(row.created_at || new Date().toISOString()),
  source: row.source === 'voice' ? 'voice' : 'text',
  phaseId: row.phase_id ? String(row.phase_id) : undefined,
  phaseLabel: row.phase_label ? String(row.phase_label) : undefined,
  audioPath: row.audio_path ? String(row.audio_path) : undefined,
  audioDeletedAt: row.audio_deleted_at ? String(row.audio_deleted_at) : undefined,
  audioDeleteReason: ['retention', 'capacity', 'cleanup'].includes(String(row.audio_delete_reason))
    ? row.audio_delete_reason as LiveDebateArgument['audioDeleteReason']
    : undefined,
});

const LIVE_DEBATE_AUDIO_BUCKET = 'live-debate-audio';
const CLEANUP_REQUEST_INTERVAL_MS = 15 * 60 * 1000;
let lastAudioCleanupRequestAt = 0;

const getRecordingExtension = (mimeType: string) => {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
};

const requestLiveDebateAudioCleanup = async (force = false) => {
  const now = Date.now();
  if (!force && now - lastAudioCleanupRequestAt < CLEANUP_REQUEST_INTERVAL_MS) return false;
  lastAudioCleanupRequestAt = now;
  try {
    const { error } = await supabase.functions.invoke('cleanup-live-debate-audio', {
      body: { source: force ? 'upload-retry' : 'upload' },
    });
    if (!error) return true;
    console.warn('Live debate audio cleanup request error:', error.message);
  } catch (error) {
    console.warn('Live debate audio cleanup request error:', error);
  }
  if (force) {
    // The upload caller will preserve the transcript even when cleanup is unavailable.
    return false;
  }
  return false;
};

export const uploadLiveDebateAudio = async (
  roomId: string,
  argumentId: string,
  recording: Blob,
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('음성을 저장하려면 다시 로그인해 주세요.');
  const extension = getRecordingExtension(recording.type);
  const path = `${user.id}/${roomId}/${argumentId}.${extension}`;
  const upload = () => supabase.storage.from(LIVE_DEBATE_AUDIO_BUCKET).upload(path, recording, {
      contentType: recording.type || 'audio/webm',
      upsert: false,
    });
  let { error } = await upload();
  if (error) {
    const cleanupRan = await requestLiveDebateAudioCleanup(true);
    if (cleanupRan) ({ error } = await upload());
  }
  if (error) throw new Error(`내 음성 발언을 저장하지 못했습니다: ${error.message}`);
  void requestLiveDebateAudioCleanup();
  return path;
};

export const removeLiveDebateAudio = async (path: string) => {
  const { error } = await supabase.storage.from(LIVE_DEBATE_AUDIO_BUCKET).remove([path]);
  if (error) console.warn('Orphaned live debate audio cleanup error:', error.message);
};

export const getLiveDebateAudioUrl = async (path: string) => {
  const { data, error } = await supabase.storage
    .from(LIVE_DEBATE_AUDIO_BUCKET)
    .createSignedUrl(path, 15 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(`내 음성 발언을 불러오지 못했습니다: ${error?.message || '재생 주소가 없습니다.'}`);
  }
  return data.signedUrl;
};

export const downloadLiveDebateAudio = async (path: string) => {
  const { data, error } = await supabase.storage.from(LIVE_DEBATE_AUDIO_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`내 음성 발언을 다운로드하지 못했습니다: ${error?.message || '파일이 없습니다.'}`);
  }
  return data;
};

export const getLiveDebateArguments = async (roomId: string): Promise<LiveDebateArgument[]> => {
  const { data, error } = await supabase
    .from('live_debate_arguments')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`토론 발언을 불러오지 못했습니다: ${error.message}`);
  return (data ?? []).map(row => mapLiveArgument(row as Record<string, unknown>));
};

export const saveLiveDebateArgument = async (roomId: string, argument: LiveDebateArgument) => {
  const payload = {
    id: argument.id,
    room_id: roomId,
    user_id: argument.senderId,
    sender_name: argument.senderName,
    content: argument.content,
    source: argument.source,
    phase_id: argument.phaseId || null,
    phase_label: argument.phaseLabel || null,
    ...(argument.audioPath ? { audio_path: argument.audioPath } : {}),
  };
  const { data, error } = await supabase.from('live_debate_arguments').insert(payload).select('created_at').single();
  if (error) throw new Error(`토론 발언을 저장하지 못했습니다: ${error.message}`);
  return String(data.created_at || new Date().toISOString());
};

export const saveLiveDebateAiArgument = async (roomId: string, argument: LiveDebateArgument) => {
  const { data, error } = await supabase.rpc('save_live_debate_ai_argument', {
    target_room_id: roomId,
    ai_user_id: argument.senderId,
    argument_id: argument.id,
    argument_content: argument.content,
    argument_phase_id: argument.phaseId || null,
    argument_phase_label: argument.phaseLabel || null,
  });
  if (error) throw new Error(`AI 발언을 저장하지 못했습니다: ${error.message}`);
  return data !== false;
};

export const saveLiveDebateEvaluation = async (roomId: string, evaluation: LiveDebateEvaluation) => {
  const { data, error } = await supabase.rpc('save_live_debate_evaluation', {
    target_room_id: roomId,
    p_evaluation: evaluation,
  });
  if (error) throw new Error(`AI 평가를 저장하지 못했습니다: ${error.message}`);
  return data !== false;
};

export const getLiveDebateEvaluation = async (roomId: string): Promise<LiveDebateEvaluation | null> => {
  const { data, error } = await supabase.rpc('get_live_debate_evaluation', { target_room_id: roomId });
  if (error) throw new Error(`AI 평가를 불러오지 못했습니다: ${error.message}`);
  return data as LiveDebateEvaluation | null;
};
