import { supabase } from './supabase';
import type {
  PersonalSimulationSource,
  SimulationMission,
  SimulationReport,
  SimulationTurn,
} from '../types';

export type TrainingKind = 'debate' | 'simulation';
export type SimulationSessionStatus = 'in_progress' | 'completed' | 'abandoned' | 'failed';

type TrainingQuotaResult = {
  allowed: boolean;
  reason?: 'daily' | 'monthly';
  exempt?: boolean;
  alreadyClaimed?: boolean;
  dailyUsed?: number;
  monthlyUsed?: number;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  sessionId?: string;
};

export class TrainingLimitError extends Error {
  readonly reason: 'daily' | 'monthly' | 'unavailable';

  constructor(reason: 'daily' | 'monthly' | 'unavailable', message: string) {
    super(message);
    this.name = 'TrainingLimitError';
    this.reason = reason;
  }
}

const quotaError = (kind: TrainingKind, result: TrainingQuotaResult) => {
  const label = kind === 'debate' ? '토론' : '페르소나 훈련';
  if (result.reason === 'monthly') {
    return new TrainingLimitError('monthly', '이번 달 ' + label + ' 무료 이용 한도 10회를 모두 사용했습니다. 다음 달에 다시 이용해 주세요.');
  }
  return new TrainingLimitError('daily', '오늘 ' + label + ' 무료 이용 한도 3회를 모두 사용했습니다. 내일 다시 이용해 주세요.');
};

const rpcSetupError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('function') || normalized.includes('schema cache')) {
    return new TrainingLimitError('unavailable', '이용 한도 데이터베이스 설정이 아직 적용되지 않았습니다. 관리자에게 문의해 주세요.');
  }
  return new TrainingLimitError('unavailable', '이용 가능 횟수를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
};

export const claimDebateTrainingSession = async (sessionKey: string): Promise<TrainingQuotaResult> => {
  const { data, error } = await supabase.rpc('claim_training_session', {
    p_training_kind: 'debate',
    p_session_key: sessionKey,
  });
  if (error) throw rpcSetupError(error.message);
  const result = (data ?? {}) as TrainingQuotaResult;
  if (!result.allowed) throw quotaError('debate', result);
  return result;
};

export const startSimulationTrainingSession = async (
  sessionId: string,
  mission: SimulationMission,
  source: 'preset' | PersonalSimulationSource,
  initialTurns: SimulationTurn[],
): Promise<TrainingQuotaResult> => {
  const { data, error } = await supabase.rpc('start_simulation_training_session', {
    p_session_id: sessionId,
    p_mission_id: mission.id,
    p_mission_title: mission.title,
    p_category_id: mission.categoryId,
    p_persona_id: mission.personaId,
    p_difficulty: mission.difficulty,
    p_source: source,
    p_initial_turns: initialTurns,
  });
  if (error) throw rpcSetupError(error.message);
  const result = (data ?? {}) as TrainingQuotaResult;
  if (!result.allowed) throw quotaError('simulation', result);
  return result;
};

export const updateSimulationTrainingSession = async (
  sessionId: string,
  turns: SimulationTurn[],
  durationSeconds: number,
  status: SimulationSessionStatus = 'in_progress',
  report?: SimulationReport,
) => {
  const { error } = await supabase.rpc('update_simulation_training_session', {
    p_session_id: sessionId,
    p_turns: turns,
    p_duration_seconds: Math.max(0, Math.min(14400, Math.round(durationSeconds))),
    p_status: status,
    p_report: report ?? null,
  });
  if (error) console.error('Failed to persist simulation training session:', error);
};
