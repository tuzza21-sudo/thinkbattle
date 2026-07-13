import { supabase } from './supabase';
import type { DebateRecord, EnglishRephraseEntry } from '../types';

const mapDebateRecord = (row: any): DebateRecord => ({
  id: row.id,
  shareId: row.share_id ?? undefined,
  userId: row.user_id ?? '',
  topic: row.topic,
  matchType: row.game_mode === 'debate' ? '정식 토론' : '친선전',
  gameMode: row.game_mode,
  userPosition: row.user_position,
  aiPosition: row.user_position === 'affirmative' ? 'negative' : 'affirmative',
  debateLevel: row.debate_level,
  debateFocus: row.debate_focus,
  durationSeconds: row.time_limit || 0,
  completedAt: row.created_at,
  arguments: row.arguments || [],
  report: row.final_report?.report || row.final_report,
  englishRephrases: row.final_report?.englishRephrases || [],
});

export const getDebateRecords = async (userId: string): Promise<DebateRecord[]> => {
  const { data, error } = await supabase
    .from('debate_records')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Failed to load debate records:', error);
    return [];
  }

  return data.map(mapDebateRecord);
};

export const createReportShareLink = async (userId: string, recordId: string, existingShareId?: string): Promise<string> => {
  const shareId = existingShareId ?? crypto.randomUUID();
  const { data, error } = await supabase
    .from('debate_records')
    .update({ share_id: shareId })
    .eq('id', recordId)
    .eq('user_id', userId)
    .select('share_id')
    .single();

  if (error || !data?.share_id) {
    console.error('Failed to create report share link:', error);
    throw error ?? new Error('공유 링크를 만들지 못했습니다.');
  }

  return `${window.location.origin}/report/${data.share_id}`;
};

export const getSharedDebateRecord = async (shareId: string): Promise<DebateRecord | undefined> => {
  const { data, error } = await supabase.rpc('get_shared_debate_record', { p_share_id: shareId });

  if (error || !data) {
    console.error('Failed to load shared debate record:', error);
    return undefined;
  }

  return mapDebateRecord(data);
};

export const saveDebateRecord = async (record: DebateRecord) => {
  const { error } = await supabase
    .from('debate_records')
    .insert([
      {
        id: record.id,
        user_id: record.userId,
        topic: record.topic,
        time_limit: record.durationSeconds,
        game_mode: record.gameMode || 'debate',
        user_position: record.userPosition || 'affirmative',
        debate_level: record.debateLevel || 'beginner',
        debate_focus: record.debateFocus || 'fact',
        arguments: record.arguments,
        final_report: {
          report: record.report,
          englishRephrases: record.englishRephrases || []
        },
        created_at: record.completedAt
      }
    ]);

  if (error) {
    console.error('Failed to save debate record:', error);
    throw error;
  }
};

export const saveEnglishRephraseEntry = async (
  userId: string,
  recordId: string,
  entry: EnglishRephraseEntry,
): Promise<DebateRecord | undefined> => {
  // 1. Fetch current record
  const { data: currentRecord, error: fetchError } = await supabase
    .from('debate_records')
    .select('*')
    .eq('id', recordId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !currentRecord) return undefined;

  // 2. Update englishRephrases inside final_report jsonb
  const finalReport = currentRecord.final_report || {};
  const existing = finalReport.englishRephrases || [];
  const updatedRephrases = [
    entry,
    ...existing.filter((item: any) => item.argumentId !== entry.argumentId),
  ];

  const updatedFinalReport = {
    ...finalReport,
    englishRephrases: updatedRephrases
  };

  // 3. Save back
  const { error: updateError } = await supabase
    .from('debate_records')
    .update({ final_report: updatedFinalReport })
    .eq('id', recordId)
    .eq('user_id', userId);

  if (updateError) return undefined;

  // Return formatted record
  return {
    id: currentRecord.id,
    shareId: currentRecord.share_id ?? undefined,
    userId: currentRecord.user_id,
    topic: currentRecord.topic,
    matchType: currentRecord.game_mode === 'debate' ? '정식 토론' : '친선전',
    gameMode: currentRecord.game_mode,
    userPosition: currentRecord.user_position,
    aiPosition: currentRecord.user_position === 'affirmative' ? 'negative' : 'affirmative',
    debateLevel: currentRecord.debate_level,
    debateFocus: currentRecord.debate_focus,
    durationSeconds: currentRecord.time_limit || 0,
    completedAt: currentRecord.created_at,
    arguments: currentRecord.arguments || [],
    report: updatedFinalReport.report || updatedFinalReport,
    englishRephrases: updatedRephrases,
  };
};

export const deleteDebateRecord = async (userId: string, recordId: string) => {
  const { error } = await supabase
    .from('debate_records')
    .delete()
    .eq('id', recordId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to delete debate record:', error);
  }
};
