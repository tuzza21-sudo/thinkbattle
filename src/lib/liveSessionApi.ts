import { supabase } from './supabase';
import type { LiveDebateEvaluation } from '../types';
import type { LiveSessionConfig, SessionSnapshot } from './liveDebateSession';

const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const messages: [RegExp, string][] = [
      [/schema cache|could not find the function/i, '새 토론 기능의 서버 설정이 아직 적용되지 않았습니다. 관리자에게 업데이트를 요청해 주세요.'],
      [/not your speaking session/, '세션이 바뀌었거나 지금은 발언할 수 없습니다. 현재 순서를 확인해 주세요. 입력한 내용은 유지됩니다.'],
      [/revision|state changed|stale/i, '다른 참가자가 진행을 변경했습니다. 최신 세션을 확인한 뒤 다시 눌러 주세요.'],
      [/only host|only.*moderator/i, '방장 또는 진행자만 이 설정을 변경할 수 있습니다.'],
      [/recording expired/, '음성 발언 저장 시간이 만료되었습니다. 전사 내용을 복사해 보관해 주세요.'],
      [/finish the previous recording/, '이전 음성 발언을 먼저 저장하거나 취소해 주세요.'],
      [/team chat unavailable/, '현재 팀에서는 메시지를 보낼 수 없습니다. 팀 선택과 토론 상태를 확인해 주세요.'],
      [/please wait before sending/, '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.'],
      [/wait for the session/, '세션과 음성 발언 저장이 끝나면 평가할 수 있습니다.'],
      [/not a room participant/, '이 토론방의 참가자만 이용할 수 있습니다.'],
    ];
    throw new Error(messages.find(([pattern]) => pattern.test(error.message))?.[1] || error.message);
  }
  return data as T;
};
export type SessionAction = 'tick' | 'pause' | 'resume' | 'extend' | 'next' | 'finish';
export const controlSession = (roomId: string, action: SessionAction = 'tick', revision?: number) => rpc<SessionSnapshot>('control_live_debate_session', { target_room_id: roomId, action, expected_revision: revision ?? null });
export const beginSpeech = (roomId: string, phaseId: string) => rpc<string>('begin_live_debate_speech', { target_room_id: roomId, expected_phase_id: phaseId });
export const endSpeech = (ticket: string, cancel = false) => rpc<void>('end_live_debate_speech', { ticket_id: ticket, cancel });
export const submitSessionArgument = (roomId: string, id: string, content: string, phaseId: string, ticket?: string, audioPath?: string) => rpc<string>('submit_live_session_argument', { target_room_id: roomId, argument_id: id, argument_content: content, expected_phase_id: phaseId, speech_ticket_id: ticket ?? null, audio_path: audioPath ?? null });
export const updateSessionSettings = (roomId: string, config: LiveSessionConfig) => rpc<boolean>('update_live_session_settings', { target_room_id: roomId, config });
export const saveSessionEvaluation = (roomId: string, evaluation: LiveDebateEvaluation) => rpc<boolean>('save_live_session_evaluation', { target_room_id: roomId, p_evaluation: evaluation });
export type TeamMessage = { id: string; user_id: string; nickname: string; body: string; created_at: string; team_key: string };
export const getTeamMessages = async (roomId: string) => {
  const { data, error } = await supabase.from('live_debate_team_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data as TeamMessage[]).reverse();
};
export const sendTeamMessage = (roomId: string, id: string, body: string) => rpc<void>('send_live_team_message', { target_room_id: roomId, message_id: id, message_body: body });
export const subscribeSession = (roomId: string, onChange: () => void) => {
  let channel = supabase.channel(`live-session-${roomId}-${crypto.randomUUID()}`);
  for (const table of ['live_debate_sessions', 'live_debate_arguments', 'live_debate_rooms']) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${roomId}` }, onChange);
  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
};
