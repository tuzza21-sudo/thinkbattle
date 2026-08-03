import type { DebateLevel, DebateParticipantRole, DebatePosition, DebateRoomAudience, DebateTeamSize } from '../types';

export type LiveDebateLinkOptions = {
  roomId: string;
  topic: string;
  timeLimit: number;
  hostId: string;
  hostPosition: DebatePosition;
  teamSize?: DebateTeamSize;
  allowModerator?: boolean;
  debateLevel?: DebateLevel;
  voiceEnabled?: boolean;
  participantPosition?: DebatePosition;
  participantRole?: DebateParticipantRole;
  audience?: DebateRoomAudience;
  startedAt?: string;
};

export const createLiveRoomId = () => {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `debate-${id}`;
};

export const buildDebateLobbyPath = (roomId: string) => `/battle/lobby/${encodeURIComponent(roomId)}`;

export const buildLiveDebatePath = ({
  roomId,
  topic,
  timeLimit,
  hostId,
  hostPosition,
  teamSize = 1,
  allowModerator = false,
  debateLevel = 'beginner',
  voiceEnabled = false,
  participantPosition,
  participantRole = 'debater',
  audience = 'public',
  startedAt,
}: LiveDebateLinkOptions) => {
  const search = new URLSearchParams({
    topic,
    time: String(timeLimit),
    host: hostId,
    position: hostPosition,
    team: String(teamSize),
    moderator: allowModerator ? '1' : '0',
    level: debateLevel,
    voice: voiceEnabled ? '1' : '0',
    myPosition: participantPosition || hostPosition,
    role: participantRole,
    audience,
  });
  if (startedAt) search.set('startedAt', startedAt);
  return `/battle/live/${encodeURIComponent(roomId)}?${search.toString()}`;
};
