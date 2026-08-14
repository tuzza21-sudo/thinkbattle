import React from 'react';
import type { Argument, Player } from '../types';
import { BookOpen, AlertCircle, Download, LoaderCircle, Pause, Volume2 } from 'lucide-react';

interface ArgumentCardProps {
  argument: Argument;
  player: Player;
  isHighlighted?: boolean;
  onPlayAudio?: () => void;
  isAudioLoading?: boolean;
  isAudioPlaying?: boolean;
  audioButtonLabel?: string;
  onDownloadAudio?: () => void;
  isAudioDownloading?: boolean;
}

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ArgumentCard: React.FC<ArgumentCardProps> = ({
  argument,
  player,
  isHighlighted,
  onPlayAudio,
  isAudioLoading = false,
  isAudioPlaying = false,
  audioButtonLabel,
  onDownloadAudio,
  isAudioDownloading = false,
}) => {
  const isPlayerA = !argument.isAi;
  const hasTiming = !argument.isAi && typeof argument.elapsedSeconds === 'number' && typeof argument.recommendedDurationSeconds === 'number';
  
  return (
    <div className={`argument-card ${isPlayerA ? 'player-a' : 'player-b'} ${isHighlighted ? 'highlight' : ''}`}>
      <img className="argument-avatar" src={player.avatar} alt={player.name} />
      <div className="argument-bubble">
        <div className="argument-meta">
          <span style={{ color: isPlayerA ? 'var(--primary)' : 'var(--secondary)' }}>
            {argument.roundTitle ? `${argument.roundTitle} · ` : ''}{player.name}
          </span>
          <span style={{ opacity: 0.7 }}>{argument.timestamp}</span>
        </div>

        {hasTiming && (
          <div className={`argument-time ${argument.overtimeSeconds ? 'overtime' : ''}`}>
            <span>권장 {formatDuration(argument.recommendedDurationSeconds ?? 0)}</span>
            <span>사용 {formatDuration(argument.elapsedSeconds ?? 0)}</span>
            {(argument.overtimeSeconds ?? 0) > 0 && <strong>+{formatDuration(argument.overtimeSeconds ?? 0)} 초과</strong>}
          </div>
        )}

        <div className="argument-content">
          {argument.content}
        </div>

        {(onPlayAudio || onDownloadAudio) && (
          <div className="argument-audio-actions">
            {onPlayAudio && (
              <button type="button" className="argument-audio-button" onClick={onPlayAudio} disabled={isAudioLoading}>
                {isAudioLoading
                  ? <LoaderCircle className="spin" size={15} />
                  : isAudioPlaying
                    ? <Pause size={15} />
                    : <Volume2 size={15} />}
                {isAudioLoading
                  ? argument.isAi ? '음성 생성 중' : '녹음 불러오는 중'
                  : isAudioPlaying
                    ? '재생 멈추기'
                    : audioButtonLabel || (argument.isAi ? 'AI 발언 다시 듣기' : '내 음성 다시 듣기')}
              </button>
            )}
            {onDownloadAudio && (
              <button type="button" className="argument-audio-button" onClick={onDownloadAudio} disabled={isAudioDownloading} title="보관기간 만료 전에 기기에 저장">
                {isAudioDownloading ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
                {isAudioDownloading ? '다운로드 준비 중' : '음성 다운로드'}
              </button>
            )}
          </div>
        )}

        {(argument.aiQuestion || argument.aiLesson || argument.turnFeedback) && (
          <div className="argument-insight">
            {argument.turnFeedback && (
              <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-amber)', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <div className="insight-title" style={{ color: 'var(--accent-amber)', margin: 0 }}>
                    <AlertCircle size={18} /> 실시간 미션 평가
                  </div>
                  {argument.turnXp !== undefined && (
                    <div style={{ background: 'var(--accent-amber)', color: 'var(--bg-primary)', padding: '0.15rem 0.6rem', borderRadius: '12px', fontWeight: 800, fontSize: '0.85rem' }}>
                      +{argument.turnXp} XP
                    </div>
                  )}
                </div>
                <div style={{ color: 'var(--text-light)', fontSize: '0.95rem' }}>{argument.turnFeedback}</div>
                {argument.turnFeedbackDetail && (
                  <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.75rem', fontSize: '0.88rem', lineHeight: 1.55 }}>
                    <div><strong style={{ color: 'var(--primary)' }}>이번 단계 목표</strong><br />{argument.turnFeedbackDetail.phaseGoal}</div>
                    <div><strong style={{ color: 'var(--secondary)' }}>잘한 점</strong><br />{argument.turnFeedbackDetail.completed}</div>
                    <div><strong style={{ color: 'var(--accent-amber)' }}>보완할 점</strong><br />{argument.turnFeedbackDetail.missing}</div>
                    <div><strong>다음 행동</strong><br />{argument.turnFeedbackDetail.nextAction}</div>
                  </div>
                )}
              </div>
            )}
            {argument.aiQuestion && (
              <div>
                <div className="insight-title coral">
                  <AlertCircle size={18} /> 상대측 교차질문
                </div>
                <div className="insight-copy">{argument.aiQuestion}</div>
              </div>
            )}

            {argument.aiLesson && (
              <div className="insight-lesson">
                <div className="insight-title cyan">
                  <BookOpen size={16} /> 철학적 배경
                </div>
                <div>{argument.aiLesson}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
