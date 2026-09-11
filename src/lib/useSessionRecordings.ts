import { useRef, useState } from 'react';
import { endSpeech, submitSessionArgument } from './liveSessionApi';
import { uploadLiveDebateAudio } from './debateRooms';
import { transcribeDebateAudio } from './transcription';
import type { LiveDebateRoomSummary } from '../types';

export type SessionRecording = { id: string; ticket: string; phaseId: string; label: string; blob: Blob; transcript?: string; audioPath?: string };
type PendingRecording = SessionRecording & { processing: boolean; error?: string };
export const useSessionRecordings = (room: LiveDebateRoomSummary, onSaved: () => Promise<void>) => {
  const [recordings, setRecordings] = useState<PendingRecording[]>([]);
  const processing = useRef(new Set<string>());
  const upsert = (record: PendingRecording) => setRecordings(current => current.some(item => item.id === record.id) ? current.map(item => item.id === record.id ? record : item) : [...current, record]);
  const process = async (input: SessionRecording) => {
    if (processing.current.has(input.id)) return;
    const record = { ...input };
    processing.current.add(record.id); upsert({ ...record, processing: true });
    try {
      // Release the microphone ticket immediately. Transcription must never
      // prevent this participant asking the next question in the same session.
      await endSpeech(record.ticket);
      if (!record.transcript) record.transcript = await transcribeDebateAudio(record.blob, { topic: room.topic, roundTitle: record.label, language: room.language });
      if (record.transcript.length > 1200) throw new Error('전사가 1,200자를 넘었습니다. 아래에서 내용을 정리한 후 다시 저장해 주세요.');
      if (!record.audioPath) record.audioPath = await uploadLiveDebateAudio(room.roomId, record.id, record.blob);
      await submitSessionArgument(room.roomId, record.id, record.transcript, record.phaseId, record.ticket, record.audioPath);
      setRecordings(current => current.filter(item => item.id !== record.id));
      await onSaved();
    } catch (err) {
      upsert({ ...record, processing: false, error: err instanceof Error ? err.message : '음성 발언을 처리하지 못했습니다. 다시 저장할 수 있습니다.' });
    } finally { processing.current.delete(record.id); }
  };
  const edit = (id: string, transcript: string) => setRecordings(current => current.map(record => record.id === id ? { ...record, transcript } : record));
  const cancel = async (record: SessionRecording) => {
    if (processing.current.has(record.id)) return;
    try { await endSpeech(record.ticket, true); setRecordings(current => current.filter(item => item.id !== record.id)); await onSaved(); }
    catch (err) { upsert({ ...record, processing: false, error: err instanceof Error ? err.message : '녹음을 취소하지 못했습니다.' }); }
  };
  return { recordings, process, edit, cancel };
};
