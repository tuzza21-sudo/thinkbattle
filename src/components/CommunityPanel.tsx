import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [formContent, setFormContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Load data
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = useCallback(async () => {
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
  }, [topicId, user]);

  useEffect(() => {
    if (!isOpen) return;
    const resetTimer = window.setTimeout(() => {
      void refreshData();
      setShowForm(false);
      setSubmitError(null);
      setSubmitSuccess(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [isOpen, refreshData]);

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
      void refreshData();
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      onLoginRequest();
      return;
    }
    if (!formContent.trim()) {
      setSubmitError('의견을 작성해주세요.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const keyReasonInput = formContent.trim().substring(0, 50);

      // AI moderation
      const modResult = await moderateComment(formContent, keyReasonInput, topicTitle);
      
      const newOpinion = await addOpinion({
        topicId,
        userId: user.id,
        nickname: user.nickname,
        position: formPosition,
        keyReason: keyReasonInput,
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
    <div className="modal-overlay community-modal-overlay" onClick={onClose}>
      <div className="community-panel-modal" role="dialog" aria-modal="true" aria-labelledby="community-panel-title" onClick={event => event.stopPropagation()}>
        <header className="community-panel-hero">
          <div className="community-panel-heading">
            <span className="community-panel-eyebrow"><MessageSquare size={14} /> ARGUMENT EXCHANGE</span>
            <h2 id="community-panel-title">토론 커뮤니티</h2>
            <div className="community-panel-motion"><small>DEBATE MOTION</small><strong>{topicTitle}</strong></div>
          </div>
          <button type="button" className="community-close-button" onClick={onClose} aria-label="커뮤니티 닫기"><X size={20} /></button>

          <div className="community-pulse">
            <div className="community-pulse-side affirmative"><ThumbsUp size={18} /><span>찬성</span><strong>{stats.affirmativeCount}</strong><small>{affirmativePercent}%</small></div>
            <div className="community-pulse-total"><Users size={17} /><strong>{stats.totalOpinions}</strong><span>전체 의견</span></div>
            <div className="community-pulse-side negative"><ThumbsDown size={18} /><span>반대</span><strong>{stats.negativeCount}</strong><small>{negativePercent}%</small></div>
          </div>
          <div className="community-progress-bar" aria-label={`찬성 ${affirmativePercent}%, 반대 ${negativePercent}%`}>
            <i className="affirmative" style={{ width: `${affirmativePercent}%` }} />
            <i className="negative" style={{ width: `${negativePercent}%` }} />
          </div>
        </header>

        <div className="community-toolbar">
          <div className="community-toolbar-group">
            {([
              { key: 'all' as FilterMode, label: '전체' },
              { key: 'affirmative' as FilterMode, label: '찬성' },
              { key: 'negative' as FilterMode, label: '반대' },
            ]).map(item => (
              <button type="button" key={item.key} className={`community-filter-btn ${filter === item.key ? 'active' : ''}`} onClick={() => setFilter(item.key)}>{item.label}</button>
            ))}
            <span className="community-toolbar-divider" />
            {([
              { key: 'latest' as SortMode, label: '최신순' },
              { key: 'likes' as SortMode, label: '공감순' },
            ]).map(item => (
              <button type="button" key={item.key} className={`community-sort-btn ${sort === item.key ? 'active' : ''}`} onClick={() => setSort(item.key)}>{item.label}</button>
            ))}
          </div>
          <button
            type="button"
            className={`community-write-toggle ${showForm ? 'active' : ''}`}
            onClick={() => {
              if (!user) { onLoginRequest(); return; }
              setShowForm(!showForm);
              setSubmitError(null);
            }}
          >
            <Send size={15} /> {showForm ? '작성 닫기' : '의견 쓰기'}
          </button>
        </div>

        {submitSuccess && <div className="community-success"><CheckCircle2 size={17} /> 의견이 등록되었습니다.</div>}

        {showForm && (
          <section className="community-composer">
            <div className="community-composer-note"><Shield size={16} /><span><strong>안전한 토론 공간</strong> AI가 부적절한 표현을 자동으로 확인합니다.</span></div>
            <div className="community-position-picker">
              <button type="button" className={`affirmative ${formPosition === 'affirmative' ? 'active' : ''}`} onClick={() => setFormPosition('affirmative')}><ThumbsUp size={16} /> 찬성 의견</button>
              <button type="button" className={`negative ${formPosition === 'negative' ? 'active' : ''}`} onClick={() => setFormPosition('negative')}><ThumbsDown size={16} /> 반대 의견</button>
            </div>
            <textarea placeholder="주장과 그 이유 또는 근거를 구체적으로 작성해 주세요." value={formContent} onChange={event => setFormContent(event.target.value)} rows={4} />
            <div className="community-composer-meta"><span>{formContent.length}자</span><span>서로의 주장에 집중해 주세요.</span></div>
            {submitError && <div className="community-error"><AlertTriangle size={15} /> {submitError}</div>}
            <div className="community-composer-actions">
              <button type="button" className="community-compose-cancel" onClick={() => { setShowForm(false); setSubmitError(null); }}>취소</button>
              <button type="button" className="community-compose-submit" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 size={15} className="spin" /> AI 검열 중...</> : <><Send size={15} /> 의견 등록</>}
              </button>
            </div>
          </section>
        )}

        <main className="community-opinions-scroll">
          {isLoading ? (
            <div className="community-state"><Loader2 size={30} className="spin" /><strong>의견을 불러오는 중입니다</strong><span>잠시만 기다려 주세요.</span></div>
          ) : displayedOpinions.length === 0 ? (
            <div className="community-state"><MessageSquare size={34} /><strong>아직 등록된 의견이 없습니다</strong><span>첫 번째 관점을 남겨 토론을 시작해 보세요.</span></div>
          ) : (
            <div className="community-opinion-list">
              {displayedOpinions.map(opinion => {
                const isAffirmative = opinion.position === 'affirmative';
                const alreadyLiked = likedIds.has(opinion.id);
                return (
                  <article key={opinion.id} className={`community-opinion-card ${isAffirmative ? 'affirmative' : 'negative'}`}>
                    <header>
                      <span className="community-opinion-avatar">{opinion.nickname.charAt(0)}</span>
                      <div><strong>{opinion.nickname}</strong><span>{formatDate(opinion.createdAt)}</span></div>
                      <b>{isAffirmative ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}{isAffirmative ? '찬성' : '반대'}</b>
                    </header>
                    <p>{opinion.content}</p>
                    <footer>
                      <button type="button" onClick={() => handleLike(opinion.id)} disabled={alreadyLiked} className={`community-like-btn ${alreadyLiked ? 'liked' : ''}`}>
                        <Heart size={14} fill={alreadyLiked ? 'currentColor' : 'none'} /> 공감 {opinion.likes}
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
