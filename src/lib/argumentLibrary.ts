import { supabase } from './supabase';
import type { Argument, DebatePosition, PublicArgument } from '../types';

const extract = (content: string, labels: string[], fallback: string) => {
  const line = content.split('\n').find(value => labels.some(label => value.trim().startsWith(label)));
  if (!line) return fallback;
  return line.replace(/^[^:：]+[:：]\s*/, '').trim() || fallback;
};

const opening = (argumentsList: Argument[]) => argumentsList.find(item => !item.isAi && item.roundTitle?.includes('입론'))
  ?? argumentsList.find(item => !item.isAi);

export const publishArgument = async ({ recordId, userId, topic, position, argumentsList }: { recordId: string; userId: string; topic: string; position: DebatePosition; argumentsList: Argument[] }) => {
  const source = opening(argumentsList);
  if (!source) throw new Error('공개할 사용자 입론을 찾지 못했습니다.');
  const fallback = source.content.trim();
  const { error } = await supabase.from('argument_library').upsert({
    record_id: recordId, author_user_id: userId, topic, position,
    claim: extract(fallback, ['내 주장:', '주장:', 'Claim:'], fallback),
    reason: extract(fallback, ['이유 1:', '이유:', 'Reason:'], '입론 원문에서 이유를 확인해 주세요.'),
    evidence: extract(fallback, ['근거 1:', '근거:', 'Evidence:'], '입론 원문에서 근거를 확인해 주세요.'),
    anonymous_name: `익명 논증가 #${recordId.replace(/-/g, '').slice(-4).toUpperCase()}`,
  }, { onConflict: 'record_id' });
  if (error) throw error;
};

export const unpublishArgument = async (recordId: string, userId: string) => {
  const { error } = await supabase.from('argument_library').delete().eq('record_id', recordId).eq('author_user_id', userId);
  if (error) throw error;
};

export const getPublicArguments = async (): Promise<PublicArgument[]> => {
  const { data, error } = await supabase.from('argument_library').select('*').order('created_at', { ascending: false }).limit(60);
  if (error || !data) return [];
  return data.map(row => ({ id: row.id, topic: row.topic, position: row.position, claim: row.claim, reason: row.reason, evidence: row.evidence, anonymousName: row.anonymous_name, createdAt: row.created_at }));
};
