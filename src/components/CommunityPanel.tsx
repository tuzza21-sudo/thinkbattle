import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Heart,
  Send,
  Shield,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { getOpinions, getOpinionStats, addOpinion, likeOpinion, hasLiked, blockOpinion } from '../lib/communityStore';
import { moderateComment } from '../lib/api';
import type { CommunityOpinion, TopicOpinionStats, AppUser } from '../types';

interface CommunityPanelProps {
  topicId: string;
  topicTitle: string;
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
  onLoginRequest: () => void;
}

type FilterMode = 'all' | 'affirmative' | 'negative';
type SortMode = 'latest' | 'likes';

export const CommunityPanel: React.FC<CommunityPanelProps> = ({
  topicId,
  topicTitle,
  isOpen,
  onClose,
  user,
  onLoginRequest,
}) => {
  const [opinions, setOpinions] = useState<CommunityOpinion[]>([]);
  const [stats, setStats] = useState<TopicOpinionStats>({ topicId, totalOpinions: 0, affirmativeCount: 0, negativeCount: 0 });
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('latest');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formPosition, setFormPosition] = useState<'affirmative' | 'negative'>('affirmative');
  const [formKeyReason, setFormKeyReason] = useState('');
  const [formContent, setFormContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Load data
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = async () => {
    setIsLoading(true);
    try {
      const allOpinions = await getOpinions(topicId);
      setOpinions(allOpinions);
      setStats(await getOpinionStats(topicId));
      
      if (user) {
        const likedSet = new Set<string>();
        for (const o of allOpinions) {
          if (await hasLiked(o.id, user.id)) {
            likedSet.add(o.id);
          }
        }
        setLikedIds(likedSet);
      } else {
        setLikedIds(new Set());
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      setShowForm(false);
      setSubmitError(null);
      setSubmitSuccess(false);
    }
  }, [isOpen, topicId, user]);

  // Filter & sort
  const displayedOpinions = useMemo(() => {
    let filtered = opinions;
    if (filter === 'affirmative') filtered = opinions.filter(o => o.position === 'affirmative');
    if (filter === 'negative') filtered = opinions.filter(o => o.position === 'negative');

    return [...filtered].sort((a, b) => {
      if (sort === 'likes') return b.likes - a.likes;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [opinions, filter, sort]);

  // Handlers
  const handleLike = async (opinionId: string) => {
    if (!user) {
      onLoginRequest();
      return;
    }
    const success = await likeOpinion(opinionId, user.id);
    if (success) {
      refreshData();
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      onLoginRequest();
      return;
    }
    if (!formKeyReason.trim() || !formContent.trim()) {
      setSubmitError('핵심 근거와 상세 의견을 모두 작성해주세요.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // AI moderation
      const modResult = await moderateComment(formContent, formKeyReason, topicTitle);
      
      const newOpinion = await addOpinion({
        topicId,
        userId: user.id,
        nickname: user.nickname,
        position: formPosition,
        keyReason: formKeyReason.trim(),
        content: formContent.trim(),
      });

      if (!newOpinion) {
        throw new Error('Failed to create opinion');
      }

      if (!modResult.isAllowed) {
        // Save but mark as blocked
        await blockOpinion(newOpinion.id, modResult.reason || '부적절한 내용');
        setSubmitError(`⚠️ AI 검열: ${modResult.reason || '부적절한 내용이 감지되어 게시가 차단되었습니다.'}`);
        setIsSubmitting(false);
        return;
      }

      // Allowed - save normally
      setFormKeyReason('');
      setFormContent('');
      setSubmitSuccess(true);
      setShowForm(false);
      refreshData();
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch {
      setSubmitError('의견 등록 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const affirmativePercent = stats.totalOpinions > 0
    ? Math.round((stats.affirmativeCount / stats.totalOpinions) * 100)
    : 50;
  const negativePercent = 100 - affirmativePercent;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${h}:${m}`;
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'var(--modal-overlay)',
        backdropFilter: 'blur(6px)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="community-panel-modal card"
        style={{
          width: '90%', maxWidth: '720px', maxHeight: '90vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          padding: 0, background: 'var(--modal-bg)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem 1.5rem 1.25rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--modal-header-bg)',
        }}>
          <div className="flex justify-between items-start" style={{ gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '0.6rem' }}>
                <MessageSquare size={20} color="var(--primary)" />
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-light)' }}>토론 커뮤니티</h2>
              </div>
              <p style={{
                margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)',
                lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {topicTitle}
              </p>
            </div>
            <button className="icon-button" onClick={onClose} style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>

          {/* Stats Bar */}
          <div style={{ marginTop: '1.25rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
              <div className="flex items-center gap-2">
                <ThumbsUp size={16} color="#10B981" />
                <span style={{ fontWeight: 800, color: '#10B981', fontSize: '1.05rem' }}>
                  찬성 {stats.affirmativeCount}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({affirmativePercent}%)</span>
              </div>
              <div className="flex items-center gap-2" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <Users size={14} />
                총 {stats.totalOpinions}명 참여
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({negativePercent}%)</span>
                <span style={{ fontWeight: 800, color: '#EF4444', fontSize: '1.05rem' }}>
                  반대 {stats.negativeCount}
                </span>
                <ThumbsDown size={16} color="#EF4444" />
              </div>
            </div>
            {/* Progress bar */}
            <div className="community-progress-bar" style={{
              display: 'flex', height: '10px', borderRadius: '999px', overflow: 'hidden',
              background: 'var(--bg-secondary)',
            }}>
              <div className="community-progress-fill" style={{
                width: `${affirmativePercent}%`, background: 'linear-gradient(90deg, #10B981, #34D399)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: stats.negativeCount === 0 ? '999px' : '999px 0 0 999px',
              }} />
              <div style={{
                width: `${negativePercent}%`, background: 'linear-gradient(90deg, #F87171, #EF4444)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: stats.affirmativeCount === 0 ? '999px' : '0 999px 999px 0',
              }} />
            </div>
          </div>
        </div>

        {/* Filter/Sort + Write button */}
        <div className="flex justify-between items-center" style={{
          padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)',
          background: 'var(--modal-header-bg)', gap: '0.5rem', flexWrap: 'wrap',
        }}>
          <div className="flex items-center gap-2">
            {([
              { key: 'all' as FilterMode, label: '전체' },
              { key: 'affirmative' as FilterMode, label: '찬성' },
              { key: 'negative' as FilterMode, label: '반대' },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="community-filter-btn"
                style={{
                  padding: '0.35rem 0.8rem', borderRadius: '999px', fontSize: '0.85rem',
                  fontWeight: filter === f.key ? 800 : 600, cursor: 'pointer',
                  border: filter === f.key ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                  background: filter === f.key ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  color: filter === f.key ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all 0.2s',
                }}
              >
                {f.label}
              </button>
            ))}
            <span style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 0.25rem' }} />
            {([
              { key: 'latest' as SortMode, label: '최신순' },
              { key: 'likes' as SortMode, label: '공감순' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                style={{
                  padding: '0.35rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem',
                  fontWeight: sort === s.key ? 700 : 500, cursor: 'pointer',
                  border: 'none',
                  background: sort === s.key ? 'var(--bg-secondary)' : 'transparent',
                  color: sort === s.key ? 'var(--text-light)' : 'var(--text-muted)',
                  transition: 'all 0.2s',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
            onClick={() => {
              if (!user) { onLoginRequest(); return; }
              setShowForm(!showForm);
              setSubmitError(null);
            }}
          >
            <Send size={14} /> 의견 쓰기
          </button>
        </div>

        {/* Success message */}
        {submitSuccess && (
          <div className="flex items-center gap-2" style={{
            padding: '0.75rem 1.5rem', background: 'rgba(16, 185, 129, 0.1)',
            color: '#10B981', fontWeight: 700, fontSize: '0.9rem',
            borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
          }}>
            <CheckCircle2 size={16} /> 의견이 등록되었습니다!
          </div>
        )}

        {/* Write form */}
        {showForm && (
          <div style={{
            padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-elevated)',
          }}>
            <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
              <Shield size={16} color="var(--primary)" />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                AI가 부적절한 댓글을 자동으로 검열합니다
              </span>
            </div>

            {/* Position selector */}
            <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => setFormPosition('affirmative')}
                style={{
                  padding: '0.7rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: formPosition === 'affirmative' ? '2px solid #10B981' : '1px solid var(--border-color)',
                  background: formPosition === 'affirmative' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-card)',
                  color: formPosition === 'affirmative' ? '#10B981' : 'var(--text-muted)',
                  fontWeight: 800, fontSize: '0.95rem', textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}
              >
                <ThumbsUp size={16} /> 찬성
              </button>
              <button
                type="button"
                onClick={() => setFormPosition('negative')}
                style={{
                  padding: '0.7rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: formPosition === 'negative' ? '2px solid #EF4444' : '1px solid var(--border-color)',
                  background: formPosition === 'negative' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)',
                  color: formPosition === 'negative' ? '#EF4444' : 'var(--text-muted)',
                  fontWeight: 800, fontSize: '0.95rem', textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}
              >
                <ThumbsDown size={16} /> 반대
              </button>
            </div>

            <input
              type="text"
              placeholder="커뮤니티 의견은 한 줄로 작성해주세요"
              value={formKeyReason}
              onChange={e => setFormKeyReason(e.target.value)}
              maxLength={60}
              style={{
                width: '100%', padding: '0.7rem 0.9rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-light)', fontSize: '0.95rem', marginBottom: '0.6rem',
                fontFamily: 'var(--font-sans)',
              }}
            />
            <textarea
              placeholder="주장을 뒷받침하는 이유 또는 근거를 작성해주세요"
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '0.7rem 0.9rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-light)', fontSize: '0.9rem', resize: 'vertical',
                fontFamily: 'var(--font-sans)', marginBottom: '0.6rem',
              }}
            />

            {submitError && (
              <div className="flex items-center gap-2" style={{
                padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.08)', color: '#EF4444',
                fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.6rem',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}>
                <AlertTriangle size={14} /> {submitError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                onClick={() => { setShowForm(false); setSubmitError(null); }}
              >
                취소
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem', fontWeight: 700 }}
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <><Loader2 size={14} className="spin" /> AI 검열 중...</>
                ) : (
                  <><Send size={14} /> 등록하기</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Opinions List */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '1rem 1.5rem',
        }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <Loader2 size={32} className="spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>의견을 불러오는 중...</p>
            </div>
          ) : displayedOpinions.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)',
            }}>
              <MessageSquare size={40} style={{ opacity: 0.3, marginBottom: '1rem', margin: '0 auto 1rem' }} />
              <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.5rem' }}>아직 의견이 없습니다</p>
              <p style={{ fontSize: '0.9rem' }}>첫 번째 의견을 남겨보세요!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayedOpinions.map(opinion => {
                const isAffirmative = opinion.position === 'affirmative';
                const alreadyLiked = likedIds.has(opinion.id);

                return (
                  <div
                    key={opinion.id}
                    className="community-opinion-card"
                    style={{
                      padding: '1rem 1.15rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-card)',
                      borderLeft: `4px solid ${isAffirmative ? '#10B981' : '#EF4444'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    {/* Card header */}
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem', gap: '0.5rem' }}>
                      <div className="flex items-center gap-2">
                        <span style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: isAffirmative ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: 900,
                          color: isAffirmative ? '#10B981' : '#EF4444',
                        }}>
                          {opinion.nickname.charAt(0)}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-light)' }}>
                          {opinion.nickname}
                        </span>
                        <span className="badge" style={{
                          padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: 700,
                          background: isAffirmative ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: isAffirmative ? '#10B981' : '#EF4444',
                          border: `1px solid ${isAffirmative ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        }}>
                          {isAffirmative ? '찬성' : '반대'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(opinion.createdAt)}
                      </span>
                    </div>

                    {/* Key reason tag */}
                    <div style={{
                      padding: '0.4rem 0.7rem', borderRadius: 'var(--radius-sm)',
                      background: isAffirmative ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                      border: `1px solid ${isAffirmative ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
                      fontSize: '0.88rem', fontWeight: 700,
                      color: isAffirmative ? '#059669' : '#DC2626',
                      marginBottom: '0.5rem', lineHeight: 1.5,
                    }}>
                      💡 {opinion.keyReason}
                    </div>

                    {/* Content */}
                    <p style={{
                      margin: '0 0 0.6rem 0', fontSize: '0.9rem', lineHeight: 1.7,
                      color: 'var(--text-main)',
                    }}>
                      {opinion.content}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleLike(opinion.id)}
                        disabled={alreadyLiked}
                        className="community-like-btn"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.35rem',
                          padding: '0.25rem 0.6rem', borderRadius: '999px',
                          border: alreadyLiked ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-color)',
                          background: alreadyLiked ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                          color: alreadyLiked ? '#EF4444' : 'var(--text-muted)',
                          fontSize: '0.8rem', fontWeight: 600, cursor: alreadyLiked ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Heart size={13} fill={alreadyLiked ? '#EF4444' : 'none'} /> {opinion.likes}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
