import { supabase } from './supabase';
import type {
  AppUser,
  DebateLevel,
  DebateParticipantRole,
  DebatePosition,
  DebateRoomAudience,
  DebateTeamSize,
  LiveDebateArgument,
  LiveDebateLobbyParticipant,
  LiveDebateEvaluation,
  LiveDebateRoomSummary,
} from '../types';

type CreateRoomInput = {
  roomId: string;
  topic: string;
  topicDescription: string;
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

const mapRoom = (row: Record<string, unknown>): LiveDebateRoomSummary => ({
  id: String(row.id),
  roomId: String(row.room_id),
  hostId: String(row.host_id),
  hostName: String(row.host_name || '토론 개설자'),
  topic: String(row.topic),
  topicDescription: String(row.topic_description || ''),
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
  const localRoom: LiveDebateRoomSummary = {
    id: input.roomId,
    roomId: input.roomId,
    hostId: user.id,
    hostName: user.nickname,
    topic: input.topic,
    topicDescription: input.topicDescription,
    debateLevel: input.debateLevel,
    voiceEnabled: input.voiceEnabled,
    timeLimit: input.timeLimit,
    teamSize: input.teamSize,
    allowModerator: input.allowModerator,
    audience: input.audience,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    status: 'open',
    participantCount: 1,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('live_debate_rooms').insert({
    room_id: input.roomId,
    host_id: user.id,
    host_name: user.nickname,
    topic: input.topic,
    topic_description: input.topicDescription,
    debate_level: input.debateLevel,
    voice_enabled: input.voiceEnabled,
    time_limit: input.timeLimit,
    team_size: input.teamSize,
    allow_moderator: input.allowModerator,
    audience: input.audience,
    organization_id: input.organizationId || null,
    organization_name: input.organizationName || null,
    host_position: input.hostPosition,
    host_role: input.hostRole,
  });

  if (error) {
    throw new Error(`토론방을 서버에 저장하지 못했습니다: ${error.message}`);
  }
  if (!error) {
    const { error: lobbyError } = await supabase.rpc('enter_live_debate_lobby', {
      target_room_id: input.roomId,
      participant_nickname: user.nickname,
      initial_position: null,
      initial_role: null,
    });
    if (lobbyError) throw new Error(`방장 대기실 입장에 실패했습니다: ${lobbyError.message}`);
  }
  return localRoom;
};

export const listDebateRooms = async (
  audience: DebateRoomAudience,
  organizationIds: string[] = [],
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
  return remoteRooms;
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
  const { error } = await supabase
    .from('live_debate_room_participants')
    .update({ is_ready: isReady })
    .eq('room_id', roomId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '');
  if (error) throw new Error(error.message);
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
});

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
  const { error } = await supabase.from('live_debate_arguments').insert({
    id: argument.id,
    room_id: roomId,
    user_id: argument.senderId,
    sender_name: argument.senderName,
    content: argument.content,
    source: argument.source,
    phase_id: argument.phaseId || null,
    phase_label: argument.phaseLabel || null,
    created_at: argument.createdAt,
  });
  if (error) throw new Error(`토론 발언을 저장하지 못했습니다: ${error.message}`);
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
