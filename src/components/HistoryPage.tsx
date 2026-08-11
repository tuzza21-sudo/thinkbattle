import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, CalendarDays, CircleCheckBig, Clock, FileText, Focus, Languages, MessageSquareText, Route, Share2, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { createReportShareLink, getDebateRecords, saveEnglishRephraseEntry, deleteDebateRecord } from '../lib/history';
import { EnglishRephrasePanel } from './EnglishRephrasePanel';
import { ReportCategoryCard } from './ResultModal';
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

const getDebateLevelLabel = (record: DebateRecord) => record.debateLevel === 'intermediate'
  ? '중급'
  : record.debateLevel === 'advanced'
    ? '고급'
    : '초급';

const getRecordInsights = (record: DebateRecord) => {
  const totalMax = record.report.categories.reduce((sum, category) => sum + (category.maxScore || 0), 0) || 1;
  const scorePercent = Math.round(record.report.totalScore / totalMax * 100);
  const rankedCategories = [...record.report.categories].sort((left, right) => (
    (right.score / (right.maxScore || 1)) - (left.score / (left.maxScore || 1))
  ));
  const strongestCategory = rankedCategories[0];
  const priorityCategory = rankedCategories[rankedCategories.length - 1];
  const nextTraining = record.report.phaseCoaching?.find(coaching => coaching.nextAction.trim())?.nextAction
    || priorityCategory?.feedback
    || '다음 토론에서는 핵심 주장을 한 문장으로 먼저 정리한 뒤 근거를 연결해 보세요.';
  return { totalMax, scorePercent, strongestCategory, priorityCategory, nextTraining };
};

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
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [isEnglishReplayMode, setIsEnglishReplayMode] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const selectedRecord: DebateRecord | undefined = records.find(record => record.id === selectedRecordId) ?? records[0];

  useEffect(() => {
    let isMounted = true;
    const loadRecords = async () => {
      setLoading(true);
      if (user) {
        const nextRecords = await getDebateRecords(user.id);
        if (isMounted) {
          setRecords(nextRecords);
          setSelectedRecordId(current => current || nextRecords[0]?.id || '');
        }
      } else {
        if (isMounted) setRecords([]);
      }
      if (isMounted) setLoading(false);
    };
    loadRecords();
    return () => { isMounted = false; };
  }, [user]);

  const handleSaveEnglishRephrase = async (record: DebateRecord, entry: EnglishRephraseEntry) => {
    if (!user) return;

    const updatedRecord = await saveEnglishRephraseEntry(user.id, record.id, entry);
    if (!updatedRecord) return;

    setRecords(current => current.map(item => (item.id === record.id ? updatedRecord : item)));
  };

  const handleDeleteRecord = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    if (!user) return;
    if (window.confirm('이 토론 기록을 삭제하시겠습니까?')) {
      await deleteDebateRecord(user.id, recordId);
      setRecords(current => current.filter(r => r.id !== recordId));
      if (selectedRecordId === recordId) {
        setSelectedRecordId('');
      }
    }
  };

  const handleShare = async (record: DebateRecord) => {
    if (!user) return;
    try {
      const url = await createReportShareLink(user.id, record.id, record.shareId);
      await navigator.clipboard.writeText(url);
      alert('로그인 없이 볼 수 있는 공개 보고서 링크를 복사했습니다.');
    } catch (error) {
      console.error('Report share error:', error);
      alert('공유 링크를 만들지 못했습니다. Supabase 공유 SQL이 적용되었는지 확인해 주세요.');
    }
  };

  if (loading) {
    return (
      <div className="layout-container" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        로딩 중...
      </div>
    );
  }

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
            <div className="history-list-heading">
              <div><strong>완료한 토론</strong><span>{records.length}개의 성장 기록</span></div>
              <FileText size={19} />
            </div>
            {records.map(record => (
              <div
                key={record.id}
                className={`history-item ${selectedRecord?.id === record.id ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRecordId(record.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedRecordId(record.id);
                  }
                }}
              >
                <div className="flex justify-between items-start gap-3">
                  <span className="badge badge-amber">{record.matchType}</span>
                  <div className="flex items-center gap-2">
                    <span className="history-score">{record.report.totalScore}/{record.report.categories.reduce((acc, cat) => acc + (cat.maxScore || 100), 0) || 100}</span>
                    <button
                      type="button"
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
              </div>
            ))}
          </section>

          {selectedRecord && (() => {
            const insights = getRecordInsights(selectedRecord);
            return (
              <section className="history-detail history-report-detail">
                <header className="history-report-hero">
                  <div className="history-report-hero-copy">
                    <span className="history-report-eyebrow"><Award size={16} /> THINKFIT 성장 리포트</span>
                    <h2>{selectedRecord.topic}</h2>
                    <div className="history-report-meta">
                      <span>{selectedRecord.matchType}</span>
                      <span>{getDebateLevelLabel(selectedRecord)}</span>
                      <span><Clock size={13} /> {formatDuration(selectedRecord.durationSeconds)}</span>
                      <span><CalendarDays size={13} /> {formatDate(selectedRecord.completedAt)}</span>
                    </div>
                    <div className="history-report-actions">
                      <button className="btn btn-secondary" onClick={() => void handleShare(selectedRecord)}>
                        <Share2 size={16} /> 리포트 공유
                      </button>
                      <button className="btn btn-primary" onClick={() => setIsEnglishReplayMode(true)}>
                        <Languages size={17} /> 영어로 다시 말해보기
                      </button>
                    </div>
                  </div>
                  <div className="report-live-score-wrap">
                    <div className="report-live-score-ring" style={{ '--score-progress': `${insights.scorePercent * 3.6}deg` } as CSSProperties}>
                      <div><strong>{insights.scorePercent}</strong><span>점</span></div>
                    </div>
                    <small>종합 논리력 점수</small>
                  </div>
                </header>

                <div className="history-report-body">
                  <section className="report-section">
                    <h3 className="report-section-title"><MessageSquareText size={18} /> 이번 토론 총평</h3>
                    <div className="report-feedback-card history-overall-feedback"><p>{selectedRecord.report.overallFeedback}</p></div>
                  </section>

                  <section className="report-section">
                    <h3 className="report-section-title"><Sparkles size={18} /> 한눈에 보는 성장 포인트</h3>
                    <div className="report-highlight-grid">
                      <article className="report-highlight-card strength"><span><CircleCheckBig size={17} /> 가장 강한 역량</span><strong>{insights.strongestCategory?.name || '평가 정보 없음'}</strong><p>{insights.strongestCategory?.feedback || '다음 토론부터 성장 기록이 표시됩니다.'}</p></article>
                      <article className="report-highlight-card focus"><span><Focus size={17} /> 먼저 다듬을 역량</span><strong>{insights.priorityCategory?.name || '평가 정보 없음'}</strong><p>{insights.priorityCategory?.feedback || '평가 내용을 확인해 주세요.'}</p></article>
                      <article className="report-highlight-card action"><span><Route size={17} /> 다음 토론 미션</span><strong>한 가지에 집중하기</strong><p>{insights.nextTraining}</p></article>
                    </div>
                  </section>

                  <section className="report-section">
                    <h3 className="report-section-title"><TrendingUp size={18} /> 세부 역량 분석 <span className="report-section-hint">항목을 누르면 코칭을 볼 수 있어요</span></h3>
                    <div className="report-categories-list report-category-grid">
                      {selectedRecord.report.categories.map((category, index) => (
                        <ReportCategoryCard key={`${category.name}-${index}`} cat={category} index={index} animReady />
                      ))}
                    </div>
                  </section>

                  {selectedRecord.report.phaseCoaching && selectedRecord.report.phaseCoaching.length > 0 && (
                    <section className="report-section">
                      <h3 className="report-section-title"><BookOpen size={18} /> 단계별 수행 코칭</h3>
                      <div className="report-coaching-timeline">
                        {selectedRecord.report.phaseCoaching.map((coaching, index) => (
                          <article key={`${coaching.phase}-${index}`} className="report-coaching-card">
                            <div className="report-coaching-index">{index + 1}</div>
                            <div>
                              <header><strong>{coaching.phase}</strong><span>발언 흐름 분석</span></header>
                              <p><b>관찰</b>{coaching.observed}</p>
                              <p className="strength"><b>잘한 점</b>{coaching.strength}</p>
                              <p className="improvement"><b>다듬을 점</b>{coaching.improvement}</p>
                              <p className="action"><b>다음 행동</b>{coaching.nextAction}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="report-section history-transcript-section">
                    <div className="history-section-heading">
                      <div><h3 className="report-section-title"><FileText size={18} /> 실제 발언 다시보기</h3><p>단계별 발언 흐름을 확인하고, 내 발언은 영어 표현으로 다시 훈련할 수 있습니다.</p></div>
                      <button className="btn btn-secondary" onClick={() => setIsEnglishReplayMode(true)}><Languages size={17} /> 영어 표현 훈련</button>
                    </div>
                    <div className="history-report-transcript">
                      {selectedRecord.arguments.map((argument, index) => {
                        const savedRephrase = selectedRecord.englishRephrases?.find(item => item.argumentId === argument.id);
                        const stageLabel = getHistoryArgumentStage(selectedRecord, index);
                        return (
                          <article key={argument.id} className={`history-report-transcript-entry ${argument.isAi ? 'ai' : 'user'}`}>
                            <header><div><strong>{argument.isAi ? 'AI 상대방' : `${user.nickname} · 내 발언`}</strong><em>{stageLabel}</em></div><span>{String(index + 1).padStart(2, '0')}</span></header>
                            <p>{argument.content}</p>
                            {!argument.isAi && savedRephrase && (
                              <section className="history-english-rephrase history-english-summary">
                                <div><span>내 영어 초안</span><p>{savedRephrase.englishDraft}</p></div>
                                <div><span>추천 완성 문장</span><p>{savedRephrase.feedback.nativeVersion}</p></div>
                                <div><span>내 표현을 살린 수정안</span><p>{savedRephrase.feedback.draftBasedVersion}</p></div>
                              </section>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </section>
            );
          })()}
        </main>
      )}
    </div>
  );
};
