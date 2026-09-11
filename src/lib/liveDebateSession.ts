import type { DebatePosition, LiveDebateLobbyParticipant } from '../types';

export const SESSION_STAGES = [
  { id: 'opening', label: '입론', description: '주장과 이유, 근거를 제시합니다.' },
  { id: 'cross-question', label: '교차질문', description: '질문과 답변을 횟수 제한 없이 이어갑니다.' },
  { id: 'rebuttal', label: '반박', description: '상대의 전제와 근거를 검토하고 반박합니다.' },
  { id: 'closing', label: '최종발언', description: '핵심 충돌과 중요성을 비교해 입장을 정리합니다.' },
] as const;
export type SessionStageId = typeof SESSION_STAGES[number]['id'];
export type LiveSessionConfig = {
  version: 2;
  progressionMode: 'automatic' | 'moderated';
  assignmentMode: 'free' | 'assigned';
  strategySeconds: 0 | 60;
  stages: { id: SessionStageId; enabled: boolean; affirmativeSeconds: number; negativeSeconds: number }[];
};
export type SessionPhase = {
  id: string; stageId: SessionStageId; kind: 'speech' | 'cross_examination' | 'strategy';
  position: DebatePosition | null; label: string; seconds: number;
};
export type SessionSnapshot = {
  room_id: string; phase_index: number; phase_started_at: string; deadline_at: string;
  paused_at: string | null; remaining_seconds: number | null; paused_total_seconds: number;
  revision: number; finished_at: string | null; server_now: string; pending_speeches: number;
  history: { phaseId: string; startedAt: string; endedAt: string; elapsedSeconds: number }[];
};
export const createSessionConfig = (totalSeconds = 900, teamSize = 1): LiveSessionConfig => {
  const durations = totalSeconds === 600 ? [60, 90, 90, 60] : totalSeconds === 1200 ? [120, 180, 180, 120] : [120, 150, 120, 60];
  return { version: 2, progressionMode: 'automatic', assignmentMode: 'free', strategySeconds: teamSize > 1 ? 60 : 0,
    stages: SESSION_STAGES.map((stage, index) => ({ id: stage.id, enabled: true, affirmativeSeconds: durations[index], negativeSeconds: durations[index] })) };
};
export const validateSessionConfig = (config: LiveSessionConfig, teamSize: number): string | null => {
  if (config.version !== 2 || !['automatic', 'moderated'].includes(config.progressionMode)
    || !['free', 'assigned'].includes(config.assignmentMode)) return '토론 진행 설정을 확인해 주세요.';
  if (config.stages.length !== 4 || config.stages.some((stage, index) => stage.id !== SESSION_STAGES[index].id || typeof stage.enabled !== 'boolean')) return '토론 단계 설정을 확인해 주세요.';
  if (!config.stages.some(stage => stage.enabled)) return '최소 한 단계를 선택해 주세요.';
  if (config.stages.some(stage => [stage.affirmativeSeconds, stage.negativeSeconds].some(value => !Number.isInteger(value) || value < 30 || value > 900 || value % 15 !== 0))) return '각 세션은 30초~15분 사이, 15초 단위로 설정해 주세요.';
  if (![0, 60].includes(config.strategySeconds) || (teamSize === 1 && config.strategySeconds !== 0)) return '작전시간은 팀전에서만 사용할 수 있습니다.';
  return null;
};
export const buildSessionPhases = (config: LiveSessionConfig): SessionPhase[] => config.stages.flatMap(stage => {
  if (!stage.enabled) return [];
  const label = SESSION_STAGES.find(item => item.id === stage.id)!.label;
  const phases: SessionPhase[] = [];
  // A strategy interval belongs to the following enabled stage, never an orphaned ending.
  if (config.strategySeconds && (stage.id === 'cross-question' || stage.id === 'rebuttal')) {
    phases.push({ id: `strategy-before-${stage.id}`, stageId: stage.id, kind: 'strategy', position: null, label: `${label} 전 작전시간`, seconds: config.strategySeconds });
  }
  for (const position of ['affirmative', 'negative'] as const) phases.push({
    id: `${position}-${stage.id}`, stageId: stage.id, kind: stage.id === 'cross-question' ? 'cross_examination' : 'speech', position,
    label: `${position === 'affirmative' ? '찬성' : '반대'} ${label}`, seconds: position === 'affirmative' ? stage.affirmativeSeconds : stage.negativeSeconds,
  });
  return phases;
});
export const getSessionTotals = (config: LiveSessionConfig) => {
  const phases = buildSessionPhases(config);
  const debateSeconds = phases.filter(phase => phase.kind !== 'strategy').reduce((sum, phase) => sum + phase.seconds, 0);
  const strategySeconds = phases.filter(phase => phase.kind === 'strategy').reduce((sum, phase) => sum + phase.seconds, 0);
  return { debateSeconds, strategySeconds, totalSeconds: debateSeconds + strategySeconds };
};
export const canSpeakInSession = (phase: SessionPhase | undefined, member: LiveDebateLobbyParticipant | undefined, config: LiveSessionConfig) => {
  if (!phase || phase.kind === 'strategy' || !member || member.isAi || member.role !== 'debater' || !member.position) return false;
  if (phase.kind !== 'cross_examination' && phase.position !== member.position) return false;
  return config.assignmentMode === 'free' || member.phaseIds.includes(phase.stageId);
};
export const getSessionRemaining = (snapshot: SessionSnapshot, nowMs: number) => snapshot.paused_at
  ? snapshot.remaining_seconds ?? 0 : Math.ceil((Date.parse(snapshot.deadline_at) - nowMs) / 1000);
