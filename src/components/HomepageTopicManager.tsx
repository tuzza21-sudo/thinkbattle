import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, Newspaper, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import {
  createEmptyHomepageTopic,
  deleteHomepageDebateTopic,
  getHomepageDebateTopics,
  saveHomepageDebateTopic,
  type HomepageTopicInput,
} from '../lib/homepageTopics';
import type { HomepageDebateTopic, HomepageTopicKind, NewsLink } from '../types';
import { generateOrganizationTopic } from '../lib/api';

type TopicEditor = Omit<HomepageTopicInput, 'briefing'> & {
  recentCases: string;
  affirmativePoints: string;
  negativePoints: string;
  prepQuestions: string;
  keywords: string;
  newsLinks: NewsLink[];
};

const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const DEFAULT_DETAIL_CATEGORIES = ['정치', '경제', '사회', '교육', '국제', '과학·기술', '환경', '문화'];
const CUSTOM_CATEGORY_VALUE = '__custom_category__';

const hasCompleteBriefing = (editor: TopicEditor) => (
  editor.description.trim().length > 0
  && lines(editor.recentCases).length >= 4
  && editor.newsLinks.length >= 3
  && lines(editor.affirmativePoints).length >= 4
  && lines(editor.negativePoints).length >= 4
  && lines(editor.prepQuestions).length >= 4
  && editor.keywords.split(',').map(item => item.trim()).filter(Boolean).length >= 4
);

const editorFromTopic = (
  topic?: HomepageDebateTopic,
  topicKind: HomepageTopicKind = 'latest_issue',
  sortOrder = 0,
): TopicEditor => {
  const base = topic ?? { ...createEmptyHomepageTopic(topicKind), sortOrder };
  return {
    id: base.id,
    topicKind: base.topicKind,
    sector: base.sector,
    title: base.title,
    description: base.description,
    timeLimit: base.timeLimit,
    accent: base.accent,
    issueLabel: base.issueLabel,
    sortOrder: base.sortOrder,
    isActive: base.isActive,
    recentCases: base.briefing.recentCases.join('\n'),
    affirmativePoints: base.briefing.affirmative.points.join('\n'),
    negativePoints: base.briefing.negative.points.join('\n'),
    prepQuestions: base.briefing.prepQuestions.join('\n'),
    keywords: base.briefing.keywords.join(', '),
    newsLinks: base.briefing.newsLinks,
  };
};

const inputFromEditor = (editor: TopicEditor): HomepageTopicInput => ({
  id: editor.id,
  topicKind: editor.topicKind,
  sector: editor.sector,
  title: editor.title,
  description: editor.description,
  timeLimit: editor.timeLimit,
  accent: editor.accent,
  issueLabel: editor.issueLabel,
  sortOrder: editor.sortOrder,
  isActive: editor.isActive,
  briefing: {
    context: editor.description.trim(),
    recentCases: lines(editor.recentCases),
    newsLinks: editor.newsLinks,
    affirmative: { title: '찬성 측 핵심', points: lines(editor.affirmativePoints) },
    negative: { title: '반대 측 핵심', points: lines(editor.negativePoints) },
    prepQuestions: lines(editor.prepQuestions),
    keywords: editor.keywords.split(',').map(item => item.trim()).filter(Boolean),
  },
});

const enrichEditorWithAi = async (editor: TopicEditor): Promise<TopicEditor> => {
  const draft = `토론 주제: ${editor.title.trim()}\n배경 설명: ${editor.description.trim()}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = await generateOrganizationTopic(
      attempt === 0 ? draft : `${draft}\n\n모든 상세 항목을 지정된 개수만큼 빠짐없이 다시 생성하세요.`,
      'public',
      'ko',
    );
    const completedEditor: TopicEditor = {
      ...editor,
      // Keep the administrator's proposition exactly as entered while expanding
      // the supporting briefing around it.
      description: generated.briefing.context,
      timeLimit: generated.config.timeLimit ?? editor.timeLimit,
      recentCases: generated.briefing.recentCases.join('\n'),
      affirmativePoints: generated.briefing.affirmative.points.join('\n'),
      negativePoints: generated.briefing.negative.points.join('\n'),
      prepQuestions: generated.briefing.prepQuestions.join('\n'),
      keywords: generated.briefing.keywords.join(', '),
      newsLinks: generated.briefing.newsLinks,
    };
    if (hasCompleteBriefing(completedEditor)) return completedEditor;
  }
  throw new Error('AI 상세 브리핑의 일부 항목이 비어 있어 저장하지 않았습니다. 잠시 후 다시 시도해 주세요.');
};

export const HomepageTopicManager = () => {
  const [topics, setTopics] = useState<HomepageDebateTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [editor, setEditor] = useState<TopicEditor | null>(null);
  const [usesCustomCategory, setUsesCustomCategory] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getHomepageDebateTopics(true).then(result => {
      if (cancelled) return;
      if (result) setTopics(result.topics);
      else setNotice({ type: 'error', message: '주제 게시판 마이그레이션을 적용한 뒤 다시 시도해 주세요.' });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const groupedTopics = useMemo(() => ({
    latest: topics.filter(topic => topic.topicKind === 'latest_issue'),
    detail: topics.filter(topic => topic.topicKind === 'detail'),
  }), [topics]);
  const detailCategories = useMemo(() => [...new Set([
    ...DEFAULT_DETAIL_CATEGORIES,
    ...topics.filter(topic => topic.topicKind === 'detail').map(topic => topic.sector.trim()).filter(Boolean),
  ])], [topics]);

  const updateEditor = <Key extends keyof TopicEditor>(key: Key, value: TopicEditor[Key]) => {
    setEditor(current => current ? { ...current, [key]: value } : current);
  };

  const beginCreateTopic = (topicKind: HomepageTopicKind) => {
    const sameKindTopics = topics.filter(topic => topic.topicKind === topicKind);
    const nextSortOrder = sameKindTopics.length
      ? Math.min(10000, Math.max(...sameKindTopics.map(topic => topic.sortOrder)) + 10)
      : 10;
    setEditor(editorFromTopic(undefined, topicKind, nextSortOrder));
    setUsesCustomCategory(false);
    setNotice(null);
  };

  const beginEditTopic = (topic: HomepageDebateTopic) => {
    setEditor(editorFromTopic(topic));
    setUsesCustomCategory(false);
    setNotice(null);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor?.title.trim() || !editor.description.trim() || !editor.sector.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const needsAiDetails = !editor.id || !hasCompleteBriefing(editor);
      let completedEditor = editor;
      if (needsAiDetails) {
        setGeneratingDetails(true);
        completedEditor = await enrichEditorWithAi(editor);
        setEditor(completedEditor);
      }
      const saved = await saveHomepageDebateTopic(inputFromEditor(completedEditor));
      setTopics(current => [saved, ...current.filter(topic => topic.id !== saved.id)]
        .sort((a, b) => b.sortOrder - a.sortOrder));
      setEditor(null);
      setNotice({
        type: 'success',
        message: `토론 주제를 저장했습니다. 최근 사례 ${saved.briefing.recentCases.length}개, 기사 링크 ${saved.briefing.newsLinks.length}개, 찬반 논점 ${saved.briefing.affirmative.points.length + saved.briefing.negative.points.length}개, 준비 질문 ${saved.briefing.prepQuestions.length}개가 포함되었습니다.`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : '주제를 저장하지 못했습니다.' });
    } finally {
      setGeneratingDetails(false);
      setSaving(false);
    }
  };

  const handleDelete = async (topic: HomepageDebateTopic) => {
    if (!window.confirm(`“${topic.title}” 주제를 삭제할까요?`)) return;
    setSaving(true);
    setNotice(null);
    try {
      await deleteHomepageDebateTopic(topic.id);
      setTopics(current => current.filter(item => item.id !== topic.id));
      if (editor?.id === topic.id) setEditor(null);
      setNotice({ type: 'success', message: '주제를 삭제했습니다. 메인 페이지에서도 더 이상 표시되지 않습니다.' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : '주제를 삭제하지 못했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card admin-panel super-admin-topic-section">
      <div className="super-admin-section-heading">
        <div>
          <span className="admin-eyebrow">HOMEPAGE CONTENT</span>
          <h2><Newspaper size={22} /> 토론 주제 게시판</h2>
          <p className="admin-lead">논제와 배경 설명만 입력하면 AI가 기사 링크와 찬반 논점이 포함된 상세 브리핑을 완성해 메인 페이지에 게시합니다.</p>
        </div>
        <div className="super-admin-topic-actions">
          <button className="btn btn-secondary" type="button" onClick={() => beginCreateTopic('detail')} disabled={saving}>
            <Plus size={17} /> 세부 주제 생성
          </button>
          <button className="btn btn-primary" type="button" onClick={() => beginCreateTopic('latest_issue')} disabled={saving}>
            <Sparkles size={17} /> 최신 주제 생성
          </button>
        </div>
      </div>

      {notice && <div className={`super-admin-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</div>}

      {editor && (
        <form className="super-admin-topic-editor" onSubmit={handleSave}>
          <div className="super-admin-section-heading">
            <strong>{editor.id ? '토론 주제 편집' : editor.topicKind === 'latest_issue' ? '새 최신 토론 주제' : '새 세부 토론 주제'}</strong>
            <button className="icon-button" type="button" onClick={() => setEditor(null)} aria-label="편집 닫기"><X size={18} /></button>
          </div>
          <div className="super-admin-topic-form-grid">
            {editor.topicKind === 'detail' && <>
              <label className="admin-label super-admin-topic-wide">세부항목 카테고리
                <select
                  className="input-field"
                  value={usesCustomCategory ? CUSTOM_CATEGORY_VALUE : editor.sector}
                  onChange={event => {
                    if (event.target.value === CUSTOM_CATEGORY_VALUE) {
                      setUsesCustomCategory(true);
                      updateEditor('sector', '');
                    } else {
                      setUsesCustomCategory(false);
                      updateEditor('sector', event.target.value);
                    }
                  }}
                >
                  {detailCategories.map(category => <option key={category} value={category}>{category}</option>)}
                  <option value={CUSTOM_CATEGORY_VALUE}>+ 새 카테고리 직접 입력</option>
                </select>
              </label>
              {usesCustomCategory && <label className="admin-label super-admin-topic-wide">새 카테고리 이름
                <input
                  className="input-field"
                  value={editor.sector}
                  onChange={event => updateEditor('sector', event.target.value)}
                  placeholder="예: 미디어, 노동, 보건"
                  maxLength={40}
                  required
                  autoFocus
                />
              </label>}
            </>}
            <label className="admin-label super-admin-topic-wide">논제
              <input className="input-field" value={editor.title} onChange={event => updateEditor('title', event.target.value)} placeholder="찬반이 분명한 질문 형태로 입력하세요" maxLength={160} required />
            </label>
            <label className="admin-label super-admin-topic-wide">배경 설명
              <textarea className="input-field" value={editor.description} onChange={event => updateEditor('description', event.target.value)} placeholder="왜 지금 이 주제를 다뤄야 하는지, 꼭 반영할 사실이나 맥락을 입력하세요" maxLength={3000} required />
            </label>
            {!editor.id && <div className="super-admin-topic-ai-action super-admin-topic-wide">
              <div>
                <strong><Sparkles size={16} /> 나머지는 AI가 자동으로 완성합니다</strong>
                <small>상세 배경, 최근 사례, 관련 기사 검색 링크, 찬반 핵심 논점과 토론 준비 질문을 생성해 메인 화면에 바로 게시합니다.</small>
              </div>
            </div>}
          </div>
          <div className="super-admin-topic-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setEditor(null)}>취소</button>
            <button className="btn btn-primary" type="submit" disabled={saving || generatingDetails || !editor.title.trim() || !editor.description.trim()}>
              {generatingDetails ? <LoaderCircle className="spin" size={17} /> : editor.id ? <Save size={17} /> : <Sparkles size={17} />}
              {saving ? (generatingDetails ? 'AI 브리핑 패키지 생성 중...' : '저장 중...') : editor.id ? '변경사항 저장' : 'AI 상세 생성 및 게시'}
            </button>
          </div>
        </form>
      )}

      {loading ? <p className="super-admin-loading">게시 주제를 불러오는 중입니다.</p> : (
        <div className="super-admin-topic-groups">
          <TopicGroup title="최신 핵심 이슈" topics={groupedTopics.latest} onEdit={beginEditTopic} onDelete={topic => void handleDelete(topic)} disabled={saving} />
          <TopicGroup title="세부 토론 주제" topics={groupedTopics.detail} onEdit={beginEditTopic} onDelete={topic => void handleDelete(topic)} disabled={saving} />
        </div>
      )}
    </section>
  );
};

const TopicGroup = ({ title, topics, onEdit, onDelete, disabled }: {
  title: string;
  topics: HomepageDebateTopic[];
  onEdit: (topic: HomepageDebateTopic) => void;
  onDelete: (topic: HomepageDebateTopic) => void;
  disabled: boolean;
}) => (
  <div className="super-admin-topic-group">
    <h3>{title} <small>{topics.length}개</small></h3>
    {!topics.length && <p className="super-admin-list-empty">등록된 주제가 없습니다.</p>}
    {topics.map(topic => (
      <article className="super-admin-topic-row" key={topic.id}>
        <div>
          <span>{topic.sector}</span>
          <strong>{topic.title}</strong>
          <small>{topic.issueLabel || `${Math.round(topic.timeLimit / 60)}분`} · 순서 {topic.sortOrder}</small>
          <small>상세: 사례 {topic.briefing.recentCases.length} · 기사 {topic.briefing.newsLinks.length} · 찬반 {topic.briefing.affirmative.points.length}/{topic.briefing.negative.points.length} · 질문 {topic.briefing.prepQuestions.length}</small>
        </div>
        <span className={topic.isActive ? 'published' : 'hidden'}>{topic.isActive ? <Eye size={14} /> : <EyeOff size={14} />}{topic.isActive ? '공개' : '숨김'}</span>
        <button className="icon-button" type="button" onClick={() => onEdit(topic)} disabled={disabled} aria-label={`${topic.title} 편집`}><Pencil size={16} /></button>
        <button className="icon-button danger" type="button" onClick={() => onDelete(topic)} disabled={disabled} aria-label={`${topic.title} 삭제`}><Trash2 size={16} /></button>
      </article>
    ))}
  </div>
);
