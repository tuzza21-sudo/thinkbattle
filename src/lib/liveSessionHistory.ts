import type { AppUser, LiveDebateArgument, LiveDebateEvaluation, LiveDebateRoomSummary } from '../types';
import type { SessionSnapshot } from './liveDebateSession';
import { saveDebateRecord } from './history';

export const saveSessionHistory = async (room: LiveDebateRoomSummary, user: AppUser, snapshot: SessionSnapshot, argumentsList: LiveDebateArgument[], evaluation: LiveDebateEvaluation | null, position: 'affirmative' | 'negative') => {
  // Stable per room and participant: reconnecting updates the same history item.
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`thinkfit-session:${room.roomId}:${user.id}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const personal = evaluation?.participantReports.find(participant => participant.userId === user.id);
  await saveDebateRecord({
    id, userId: user.id, topic: room.topic, matchType: `${room.teamSize}:${room.teamSize} 사람 대 사람 토론`, gameMode: 'pvp',
    userPosition: position, aiPosition: position === 'affirmative' ? 'negative' : 'affirmative', debateLevel: room.debateLevel, debateFocus: 'fact',
    durationSeconds: Math.round(snapshot.history.reduce((sum, phase) => sum + Number(phase.elapsedSeconds), 0)),
    completedAt: snapshot.finished_at || evaluation?.generatedAt || new Date().toISOString(),
    arguments: argumentsList.map(argument => ({ id: argument.id, playerId: argument.senderId, isAi: false, content: argument.content, timestamp: argument.createdAt, roundTitle: argument.phaseLabel, audioPath: argument.senderId === user.id ? argument.audioPath : undefined })),
    report: personal?.report || { overallFeedback: '토론 발언 기록이 저장되었습니다. 토론방에서 AI 평가를 만들 수 있습니다.', categories: [], totalScore: 0, xpEarned: 0 },
  });
};
