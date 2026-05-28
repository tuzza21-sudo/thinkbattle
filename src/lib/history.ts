import type { DebateRecord } from '../types';

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
