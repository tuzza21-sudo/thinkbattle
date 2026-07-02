import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, BookOpen, Clock, FileText, Languages, Trash2 } from 'lucide-react';
import { getDebateRecords, saveEnglishRephraseEntry, deleteDebateRecord } from '../lib/history';
import { EnglishRephrasePanel } from './EnglishRephrasePanel';
import type { AppUser, DebateRecord, EnglishRephraseEntry } from '../types';

interface HistoryPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
}

const formatDate = (isoDate: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));

const formatDuration = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))}분`;

const getHistoryArgumentStage = (record: DebateRecord, index: number) => {
  const argument = record.arguments[index];
  if (!argument) return '자유 발언';
  if (!argument.isAi) return argument.roundTitle ?? argument.roundId ?? '내 발언';
  if (argument.roundTitle?.startsWith('AI')) return argument.roundTitle;

  const previousUserArgument = [...record.arguments.slice(0, index)].reverse().find(item => !item.isAi);
  const previousTitle = previousUserArgument?.roundTitle ?? '';

  if (previousTitle.includes('입론')) return 'AI 입론';
  if (previousTitle.includes('교차질문')) return 'AI 답변 · 교차질문';
  if (previousTitle.includes('반박')) return 'AI 반론';
  if (previousTitle.includes('중요성') || previousTitle.includes('최종') || previousTitle.includes('결론')) return 'AI 최종 발언';
  if (previousTitle) return `AI 응답 · ${previousTitle}`;

  return argument.roundTitle ?? argument.roundId ?? 'AI 발언';
};

export const HistoryPage: React.FC<HistoryPageProps> = ({ user, onLoginRequest }) => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<DebateRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState(records[0]?.id ?? '');
  const [isEnglishReplayMode, setIsEnglishReplayMode] = useState(false);
  const selectedRecord: DebateRecord | undefined = records.find(record => record.id === selectedRecordId) ?? records[0];

  useEffect(() => {
    const loadRecords = () => {
      const nextRecords = user ? getDebateRecords(user.id) : [];
      setRecords(nextRecords);
      setSelectedRecordId(current => current || nextRecords[0]?.id || '');
    };
    loadRecords();
  }, [user]);

  const handleSaveEnglishRephrase = (record: DebateRecord, entry: EnglishRephraseEntry) => {
    if (!user) return;

    const updatedRecord = saveEnglishRephraseEntry(user.id, record.id, entry);
    if (!updatedRecord) return;

    setRecords(prev => prev.map(item => item.id === updatedRecord.id ? updatedRecord : item));
  };

  const handleDeleteRecord = (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    if (window.confirm('이 토론 기록을 삭제하시겠습니까?')) {
      if (user) {
        deleteDebateRecord(user.id, recordId);
        setRecords(prev => prev.filter(r => r.id !== recordId));
        if (selectedRecordId === recordId) {
          const remaining = records.filter(r => r.id !== recordId);
          setSelectedRecordId(remaining.length > 0 ? remaining[0].id : '');
        }
      }
    }
  };

  if (!user) {
    return (
      <div className="app-container page-scroll">
        <header className="flex justify-between items-center mb-8">
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            <ArrowLeft size={18} /> 메인
          </button>
          <button className="btn btn-primary" onClick={onLoginRequest}>로그인</button>
        </header>
        <main className="empty-state">
          <FileText size={48} color="var(--primary)" />
          <h2>로그인이 필요합니다</h2>
          <p>회원가입 또는 로그인 후 토론 기록과 최종 보고서를 확인할 수 있습니다.</p>
        </main>
      </div>
    );
  }

  if (isEnglishReplayMode && selectedRecord) {
    return (
      <div className="app-container page-scroll">
        <EnglishRephrasePanel
          key={selectedRecord.id}
          topic={selectedRecord.topic}
          arguments={selectedRecord.arguments}
          initialRephrases={selectedRecord.englishRephrases ?? []}
          onSaveRephrase={entry => handleSaveEnglishRephrase(selectedRecord, entry)}
          onBackToReport={() => setIsEnglishReplayMode(false)}
          onExit={() => setIsEnglishReplayMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="app-container page-scroll">
      <header className="flex justify-between items-center mb-8">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> 메인
        </button>
        <div style={{ textAlign: 'right' }}>
          <h1 style={{ color: 'var(--primary)', fontSize: '2rem', margin: 0 }}>내 토론 기록</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>{user.nickname}님의 최종 보고서 보관함</p>
        </div>
      </header>

      {records.length === 0 ? (
        <main className="empty-state">
          <BookOpen size={48} color="var(--accent-amber)" />
          <h2>아직 저장된 기록이 없습니다</h2>
          <p>토론을 완료하면 최종 보고서가 이곳에 자동으로 쌓입니다.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>토론 시작하기</button>
        </main>
      ) : (
        <main className="history-layout">
          <section className="history-list">
            {records.map(record => (
              <button
                key={record.id}
                className={`history-item ${selectedRecord?.id === record.id ? 'active' : ''}`}
                onClick={() => setSelectedRecordId(record.id)}
              >
                <div className="flex justify-between items-start gap-3">
                  <span className="badge badge-amber">{record.matchType}</span>
                  <div className="flex items-center gap-2">
                    <span className="history-score">{record.report.totalScore}/{record.report.categories.reduce((acc, cat) => acc + (cat.maxScore || 100), 0) || 100}</span>
                    <button 
                      className="btn" 
                      style={{ padding: '0.2rem', background: 'transparent', color: 'var(--text-muted)', border: 'none' }}
                      onClick={(e) => handleDeleteRecord(e, record.id)}
                      title="기록 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h3>{record.topic}</h3>
                <div className="history-meta">
                  <span><Clock size={14} /> {formatDuration(record.durationSeconds)}</span>
                  <span>{formatDate(record.completedAt)}</span>
                </div>
              </button>
            ))}
          </section>

          {selectedRecord && (
            <section className="history-detail">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className="badge" style={{ background: 'rgba(0,229,255,0.1)', color: 'var(--primary)', border: '1px solid var(--border-cyan)' }}>
                    최종 보고서
                  </span>
                  <h2>{selectedRecord.topic}</h2>
                </div>
                <div className="report-score">
                  {selectedRecord.report.totalScore}<span>/{selectedRecord.report.categories.reduce((acc, cat) => acc + (cat.maxScore || 100), 0) || 100}</span>
                </div>
              </div>

              <div className="report-panel">
                <h3><BookOpen size={18} /> 총평</h3>
                <p>{selectedRecord.report.overallFeedback}</p>
              </div>

              <div className="report-panel">
                <h3><BarChart2 size={18} /> 세부 평가</h3>
                <div className="flex flex-col gap-3">
                  {selectedRecord.report.categories.map(category => (
                    <div key={category.name} className="history-category">
                      <div className="flex justify-between">
                        <strong>{category.name}</strong>
                        <span>{category.score}/{category.maxScore}</span>
                      </div>
                      <p>{category.feedback}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="report-panel">
                <h3><FileText size={18} /> 발언 기록</h3>
                <button className="btn btn-secondary" style={{ marginBottom: '0.85rem' }} onClick={() => setIsEnglishReplayMode(true)}>
                  <Languages size={18} /> 영어 리프레이징 관리
                </button>
                <div className="history-transcript">
                  {selectedRecord.arguments.map((argument, index) => {
                    const savedRephrase = selectedRecord.englishRephrases?.find(item => item.argumentId === argument.id);
                    const stageLabel = getHistoryArgumentStage(selectedRecord, index);

                    return (
                      <div key={argument.id} className={argument.isAi ? 'ai' : 'user'}>
                        <strong>{argument.isAi ? 'AI' : user.nickname}</strong>
                        <em>{stageLabel}</em>
                        <span>{argument.content}</span>
                        {!argument.isAi && savedRephrase && (
                          <section className="history-english-rephrase">
                            <strong>내 영어 초안</strong>
                            <p>{savedRephrase.englishDraft}</p>
                            <strong>원어민식 표현</strong>
                            <p>{savedRephrase.feedback.nativeVersion}</p>
                            <strong>내 초안을 살린 표현</strong>
                            <p>{savedRephrase.feedback.draftBasedVersion}</p>
                          </section>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
};
