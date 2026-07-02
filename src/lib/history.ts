import type { DebateRecord, EnglishRephraseEntry } from '../types';

const HISTORY_KEY = 'thinkbattle.debateRecords';

const readAllRecords = (): DebateRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as DebateRecord[];
  } catch {
    return [];
  }
};

const writeAllRecords = (records: DebateRecord[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
};

export const getDebateRecords = (userId: string): DebateRecord[] =>
  readAllRecords()
    .filter(record => record.userId === userId)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

export const saveDebateRecord = (record: DebateRecord) => {
  const records = readAllRecords();
  const withoutDuplicate = records.filter(item => item.id !== record.id);
  writeAllRecords([record, ...withoutDuplicate]);
};

export const saveEnglishRephraseEntry = (
  userId: string,
  recordId: string,
  entry: EnglishRephraseEntry,
): DebateRecord | undefined => {
  const records = readAllRecords();
  let updatedRecord: DebateRecord | undefined;

  const updatedRecords = records.map(record => {
    if (record.id !== recordId || record.userId !== userId) return record;

    const existing = record.englishRephrases ?? [];
    updatedRecord = {
      ...record,
      englishRephrases: [
        entry,
        ...existing.filter(item => item.argumentId !== entry.argumentId),
      ],
    };
    return updatedRecord;
  });

  writeAllRecords(updatedRecords);
  return updatedRecord;
};

export const deleteDebateRecord = (userId: string, recordId: string) => {
  const records = readAllRecords();
  writeAllRecords(records.filter(record => !(record.id === recordId && record.userId === userId)));
};

