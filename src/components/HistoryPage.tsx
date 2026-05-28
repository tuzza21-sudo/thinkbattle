import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, BookOpen, Clock, FileText } from 'lucide-react';
import { getDebateRecords } from '../lib/history';
import type { AppUser, DebateRecord } from '../types';

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

export const HistoryPage: React.FC<HistoryPageProps> = ({ user, onLoginRequest }) => {
  const navigate = useNavigate();
  const records = useMemo(() => user ? getDebateRecords(user.id) : [], [user]);
  const [selectedRecordId, setSelectedRecordId] = useState(records[0]?.id ?? '');
  const selectedRecord: DebateRecord | undefined = records.find(record => record.id === selectedRecordId) ?? records[0];

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
                  <span className="history-score">{record.report.totalScore}/100</span>
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
                  {selectedRecord.report.totalScore}<span>/100</span>
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
                <div className="history-transcript">
                  {selectedRecord.arguments.map(argument => (
                    <div key={argument.id} className={argument.isAi ? 'ai' : 'user'}>
                      <strong>{argument.isAi ? 'AI' : user.nickname}</strong>
                      <span>{argument.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
};
