import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Lightbulb, LoaderCircle, RotateCcw, ScanLine, Sparkles, X } from 'lucide-react';
import { generateThinkingCoach } from '../lib/thinkingCoach';
import type { CoachAction, CoachContext, CoachMemory, CoachOption, CoachResult, CoachStage } from '../lib/thinkingCoach';
import './ThinkingCoach.css';

export interface ThinkingCoachProps {
  context: CoachContext;
  draft: string;
  disabled?: boolean;
}

interface ResultEntry {
  result: CoachResult;
  draft: string;
}

interface CoachView {
  open: boolean;
  action: CoachAction;
  selectedCriteria: string[];
  selectedOption?: CoachOption;
  results: Partial<Record<CoachAction, ResultEntry>>;
  pending: CoachAction | null;
  error: string | null;
  requestId: number;
}

const INITIAL_VIEW: CoachView = {
  open: false,
  action: 'analyze',
  selectedCriteria: [],
  results: {},
  pending: null,
  error: null,
  requestId: 0,
};

const STAGES: Record<CoachStage, { ko: string; en: string; title: string; titleEn: string; description: string; descriptionEn: string }> = {
  opening: {
    ko: '입론', en: 'Opening', title: '내 논증의 출발점 찾기', titleEn: 'Find a starting point for your argument',
    description: '논제를 살펴보고, 내가 중요하게 생각하는 기준부터 골라 보세요.',
    descriptionEn: 'Explore the motion, then choose what matters most to your argument.',
  },
  cross_question: {
    ko: '교차질문', en: 'Cross-examination', title: '상대의 말에서 질문 찾기', titleEn: 'Find a question in their argument',
    description: '상대의 실제 발언을 짚고, 확인하고 싶은 한 가지에 집중해 보세요.',
    descriptionEn: 'Look at what your opponent actually said and choose one point to test.',
  },
  cross_answer: {
    ko: '교차답변', en: 'Answer', title: '질문의 핵심에 답하기', titleEn: 'Answer the point of the question',
    description: '무엇을 묻는지 확인한 뒤, 내 답과 이유를 차례로 정리해 보세요.',
    descriptionEn: 'Identify what is being asked, then organize your answer and reason.',
  },
  rebuttal: {
    ko: '반박', en: 'Rebuttal', title: '핵심 쟁점을 겨냥한 반박', titleEn: 'Build a rebuttal around the clash',
    description: '앞선 문답과 상대 논증을 연결해, 아직 풀리지 않은 쟁점을 찾아보세요.',
    descriptionEn: 'Connect earlier exchanges to the argument and find what remains unresolved.',
  },
};

function SourceTurns({ ids, context }: { ids?: string[]; context: CoachContext }) {
  const turns = context.turns.filter(turn => ids?.includes(turn.id));
  if (!turns.length) return null;
  const english = context.language === 'en';
  return (
    <details className="thinking-coach__sources">
      <summary><ScanLine size={12} aria-hidden="true" />{english ? 'View original remarks' : '연결된 실제 발언 보기'}<ChevronDown size={12} aria-hidden="true" /></summary>
      <div className="thinking-coach__source-list">
        {turns.map(turn => (
          <blockquote key={turn.id}>
            <cite>{turn.side === 'opponent' ? (english ? 'Opponent' : '상대 발언') : (english ? 'My remark' : '내 발언')}</cite>
            <p>{turn.content}</p>
          </blockquote>
        ))}
      </div>
    </details>
  );
}

export function ThinkingCoach({ context, draft, disabled = false }: ThinkingCoachProps) {
  const english = context.language === 'en';
  const t = (ko: string, en: string) => english ? en : ko;
  const stage = STAGES[context.stage];
  const opening = context.stage === 'opening';
  const contextKey = JSON.stringify(context);
  const [views, setViews] = useState<Record<string, CoachView>>({});
  const view = views[contextKey] ?? INITIAL_VIEW;
  const cache = useRef(new Map<string, CoachResult>());
  const memories = useRef(new Map<string, CoachMemory>());
  const memoryRevisions = useRef(new Map<string, number>());
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const hasOpponent = context.turns.some(turn => turn.side === 'opponent' && turn.content.trim());
  const contextReady = Boolean(context.topic.trim()) && (opening || hasOpponent);
  const busy = Boolean(view.pending);
  const resultEntry = view.results[view.action];
  const isDraftAction = view.action === 'review' || view.action === 'example';
  const staleDraft = Boolean(isDraftAction && resultEntry && resultEntry.draft !== draft);
  const result = staleDraft ? undefined : resultEntry?.result;
  const reviewedCurrentDraft = view.results.review?.draft === draft && Boolean(draft.trim());
  const reviewLabel = context.stage === 'cross_question'
    ? t('질문을 더 날카롭게 만들기', 'Sharpen my question')
    : context.stage === 'rebuttal'
      ? t('반박을 더 강하게 만들기', 'Strengthen my rebuttal')
      : context.stage === 'cross_answer'
        ? t('답변의 핵심 점검하기', 'Check my answer')
        : t('내 논증 점검하기', 'Review my argument');
  const directionLabel = context.stage === 'rebuttal' ? t('반박 경로', 'Rebuttal paths')
    : context.stage === 'cross_answer' ? t('답변 방향', 'Answer directions') : t('질문 방향', 'Question directions');
  const navigation: { action: CoachAction; label: string; available: boolean }[] = opening ? [
    { action: 'analyze', label: t('논제 분석', 'Motion'), available: true },
    { action: 'criteria', label: t('판단 기준', 'Criteria'), available: Boolean(view.results.analyze) },
    { action: 'seeds', label: t('주장 씨앗', 'Ideas'), available: Boolean(view.results.criteria) && view.selectedCriteria.length > 0 },
    { action: 'deepen', label: t('생각 넓히기', 'Explore'), available: Boolean(view.selectedOption) },
  ] : [
    { action: 'analyze', label: context.stage === 'cross_answer' ? t('질문 분석', 'The question') : t('상대 논증', 'Their argument'), available: true },
    { action: 'directions', label: directionLabel, available: Boolean(view.results.analyze) },
    { action: 'deepen', label: t('생각 넓히기', 'Explore'), available: Boolean(view.selectedOption) },
  ];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function updateView(update: (previous: CoachView) => CoachView, key = contextKey) {
    setViews(previous => ({ ...previous, [key]: update(previous[key] ?? INITIAL_VIEW) }));
  }

  async function request(action: CoachAction) {
    if (disabled || busy || !contextReady) return;
    if ((action === 'review' || action === 'example') && !draft.trim()) return;
    if (action === 'example' && !reviewedCurrentDraft) return;
    if (action === 'deepen' && !view.selectedOption) return;
    const criteria = (view.results.criteria?.result.criteria ?? [])
      .filter(criterion => view.selectedCriteria.includes(criterion.id))
      .map(criterion => criterion.title);
    const selectedOption = action === 'analyze' || action === 'criteria' || action === 'seeds' || action === 'directions'
      ? undefined : view.selectedOption;
    const requestKey = JSON.stringify({ context, action, criteria, selectedOption, draft });
    const cached = cache.current.get(requestKey);
    const id = ++requestSequence.current;
    updateView(previous => ({ ...previous, action, error: null, pending: cached ? null : action, requestId: id,
      ...(cached ? { results: { ...previous.results, [action]: { result: cached, draft } } } : {}),
    }));
    if (cached) return;
    try {
      const response = await generateThinkingCoach({
        context, action, selectedCriteria: criteria, selectedOption,
        draft: action === 'review' || action === 'example' ? draft : undefined,
        memory: memories.current.get(context.sessionId),
      });
      if (!mounted.current) return;
      cache.current.set(requestKey, response);
      if (cache.current.size > 60) {
        const oldestKey = cache.current.keys().next().value;
        if (oldestKey) cache.current.delete(oldestKey);
      }
      if (response.memory && id >= (memoryRevisions.current.get(context.sessionId) ?? 0)) {
        memories.current.set(context.sessionId, response.memory);
        memoryRevisions.current.set(context.sessionId, id);
      }
      updateView(previous => previous.requestId !== id ? previous : ({
        ...previous, pending: null, error: null,
        results: { ...previous.results, [action]: { result: response, draft } },
      }));
    } catch {
      if (!mounted.current) return;
      updateView(previous => previous.requestId !== id ? previous : ({
        ...previous, pending: null,
        error: t('코칭을 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 작성 중인 글은 그대로 있어요.', 'Coaching is unavailable right now. Try again shortly; your draft is still here.'),
      }));
    }
  }

  function navigate(action: CoachAction) {
    if (view.results[action] && action !== 'review' && action !== 'example') {
      updateView(previous => ({ ...previous, action, error: null }));
    } else {
      void request(action);
    }
  }

  function selectCriterion(id: string) {
    updateView(previous => {
      const results = { ...previous.results };
      delete results.seeds;
      delete results.deepen;
      delete results.review;
      delete results.example;
      return {
        ...previous,
        selectedCriteria: previous.selectedCriteria.includes(id)
          ? previous.selectedCriteria.filter(item => item !== id) : [...previous.selectedCriteria, id],
        selectedOption: undefined,
        results,
      };
    });
  }

  function selectOption(option: CoachOption) {
    updateView(previous => {
      const results = { ...previous.results };
      delete results.deepen;
      delete results.review;
      delete results.example;
      return { ...previous, selectedOption: option, results };
    });
  }

  function close() {
    updateView(previous => ({ ...previous, open: false }));
    toggleRef.current?.focus();
  }

  const selectedDetail = result?.options.find(option => option.id === view.selectedOption?.id) ?? view.selectedOption;
  const shownPrompts = view.action === 'deepen' ? result?.prompts ?? [] : selectedDetail?.prompts ?? [];
  const showSelected = Boolean(view.selectedOption && (view.action === 'seeds' || view.action === 'directions' || view.action === 'deepen'));
  const nextAction: CoachAction | null = view.action === 'analyze' ? (opening ? 'criteria' : 'directions')
    : view.action === 'criteria' ? 'seeds'
      : (view.action === 'seeds' || view.action === 'directions') && view.selectedOption ? 'deepen' : null;
  const nextLabel = nextAction === 'criteria' ? t('나의 판단 기준 고르기', 'Choose my criteria')
    : nextAction === 'seeds' ? t('이 기준으로 주장 씨앗 찾기', 'Find ideas with these criteria')
      : nextAction === 'directions' ? (context.stage === 'rebuttal' ? t('반박할 지점 찾기', 'Find a rebuttal path') : context.stage === 'cross_answer' ? t('답변 방향 찾기', 'Find an answer direction') : t('물어볼 지점 찾기', 'Find a point to question'))
        : t('선택한 방향 더 생각해 보기', 'Explore this direction');

  return (
    <div className={`thinking-coach${view.open ? ' thinking-coach--open' : ''}`}>
      <button
        ref={toggleRef} type="button" className="thinking-coach__toggle"
        aria-expanded={view.open} aria-controls={panelId}
        onClick={() => updateView(previous => ({ ...previous, open: !previous.open }))}
      >
        <Lightbulb size={16} aria-hidden="true" />
        <span>{t('AI 코칭', 'AI coach')}</span>
        <span className="thinking-coach__toggle-hint">{t('생각이 막힐 때', 'A little help thinking')}</span>
        <ChevronDown size={15} className="thinking-coach__toggle-chevron" aria-hidden="true" />
      </button>

      {view.open && (
        <section id={panelId} aria-labelledby={titleId} className="thinking-coach__panel" onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
        }}>
          <header className="thinking-coach__header">
            <div className="thinking-coach__identity"><span className="thinking-coach__mark"><Lightbulb size={19} aria-hidden="true" /></span><span>THINKING COACH</span></div>
            <span className="thinking-coach__stage">{english ? stage.en : stage.ko}</span>
            <button type="button" className="thinking-coach__close" aria-label={t('AI 코칭 접기', 'Close AI coach')} onClick={close}><X size={17} /></button>
          </header>
          <div className="thinking-coach__intro">
            <h3 id={titleId}>{english ? stage.titleEn : stage.title}</h3>
            <p>{english ? stage.descriptionEn : stage.description}</p>
          </div>

          {!contextReady ? (
            <div className="thinking-coach__empty" role="status">
              <ScanLine size={22} aria-hidden="true" />
              <p>{!context.topic.trim() ? t('논제가 정해지면 함께 생각을 시작할 수 있어요.', 'Choose a motion to start thinking together.') : t('상대의 발언이 도착하면 그 내용을 바탕으로 코칭을 시작할 수 있어요.', 'Once your opponent speaks, you can explore their actual argument here.')}</p>
            </div>
          ) : (
            <>
              <nav className="thinking-coach__steps" aria-label={t('코칭 순서', 'Coaching steps')}>
                {navigation.map((item, index) => (
                  <button key={item.action} type="button" aria-current={view.action === item.action ? 'step' : undefined}
                    disabled={!item.available || busy || (disabled && !view.results[item.action])}
                    onClick={() => navigate(item.action)} title={!item.available ? t('앞 단계에서 방향을 먼저 골라 주세요.', 'Choose a direction in the previous step first.') : undefined}>
                    <span className="thinking-coach__step-number">{view.results[item.action] && view.action !== item.action ? <Check size={11} aria-hidden="true" /> : index + 1}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>

              <div className="thinking-coach__body" aria-busy={busy}>
                {disabled && <p className="thinking-coach__notice">{t('내 작성 차례에 코칭을 요청할 수 있어요. 이전 코칭은 계속 볼 수 있어요.', 'You can request coaching when it is your turn to write. Previous coaching is still available.')}</p>}
                {busy ? (
                  <div className="thinking-coach__loading" role="status"><LoaderCircle size={20} aria-hidden="true" /><div><strong>{t('생각할 지점을 살펴보고 있어요', 'Finding a useful thinking prompt')}</strong><p>{t('현재 논제와 토론 흐름을 연결하고 있어요.', 'Connecting the motion to your debate so far.')}</p></div></div>
                ) : view.error ? (
                  <div className="thinking-coach__error" role="alert"><p>{view.error}</p><button type="button" className="thinking-coach__text-button" disabled={disabled} onClick={() => void request(view.action)}><RotateCcw size={14} aria-hidden="true" />{t('다시 시도', 'Try again')}</button></div>
                ) : staleDraft ? (
                  <div className="thinking-coach__empty"><p>{t('글이 바뀌었어요. 지금 작성한 내용으로 다시 점검해 보세요.', 'Your draft has changed. Review the current version for fresh feedback.')}</p><button type="button" className="thinking-coach__primary" disabled={disabled || !draft.trim()} onClick={() => void request('review')}>{reviewLabel}<ArrowRight size={14} aria-hidden="true" /></button></div>
                ) : !result ? (
                  <div className="thinking-coach__welcome">
                    <div className="thinking-coach__welcome-icon"><Sparkles size={20} aria-hidden="true" /></div>
                    <strong>{t('한 번에 한 가지씩, 내 생각으로', 'One step at a time, in your own words')}</strong>
                    <p>{opening ? t('논제의 쟁점을 이해하는 것부터 시작해 볼까요?', 'Start by understanding what is at stake in this motion.') : t('먼저 실제 발언 속 주장과 근거를 함께 살펴보세요.', 'Start by exploring the claims and reasons in the actual remarks.')}</p>
                    <button type="button" className="thinking-coach__primary" disabled={disabled} onClick={() => void request('analyze')}>{opening ? t('논제 함께 살펴보기', 'Explore the motion') : context.stage === 'cross_answer' ? t('상대 질문 살펴보기', 'Explore their question') : t('상대 논증 살펴보기', 'Explore their argument')}<ArrowRight size={15} aria-hidden="true" /></button>
                  </div>
                ) : (
                  <div className="thinking-coach__result">
                    {result.summary && <p className="thinking-coach__summary">{result.summary}</p>}

                    {view.action === 'analyze' && result.analysis.length > 0 && (
                      <div className="thinking-coach__analysis">
                        {result.analysis.slice(0, 4).map((item, index) => (
                          <div className="thinking-coach__analysis-item" key={`${item.label}-${index}`}><div><span className="thinking-coach__label">{item.label}</span>{item.inferred && <span className="thinking-coach__inference">{t('AI의 추론', 'AI inference')}</span>}</div><p>{item.value}</p><SourceTurns ids={item.sourceTurnIds} context={context} /></div>
                        ))}
                        {result.analysis.length > 4 && <details className="thinking-coach__more"><summary>{t('논증 구조 더 살펴보기', 'Explore more of the structure')}<ChevronDown size={13} aria-hidden="true" /></summary>{result.analysis.slice(4).map((item, index) => <div className="thinking-coach__analysis-item" key={`${item.label}-${index}`}><div><span className="thinking-coach__label">{item.label}</span>{item.inferred && <span className="thinking-coach__inference">{t('AI의 추론', 'AI inference')}</span>}</div><p>{item.value}</p><SourceTurns ids={item.sourceTurnIds} context={context} /></div>)}</details>}
                      </div>
                    )}

                    {view.action === 'criteria' && (
                      <fieldset className="thinking-coach__criteria"><legend>{t('내가 중요하게 볼 기준 · 여러 개 선택 가능', 'What matters to me · choose one or more')}</legend>
                        {result.criteria.slice(0, 5).map(criterion => <label key={criterion.id} className={`thinking-coach__criterion${view.selectedCriteria.includes(criterion.id) ? ' is-selected' : ''}`}><input type="checkbox" checked={view.selectedCriteria.includes(criterion.id)} disabled={disabled} onChange={() => selectCriterion(criterion.id)} /><span><strong>{criterion.title}</strong><span>{criterion.description}</span></span></label>)}
                      </fieldset>
                    )}

                    {(view.action === 'seeds' || view.action === 'directions') && (
                      <div className="thinking-coach__options" role="group" aria-label={opening ? t('발전시키고 싶은 주장 선택', 'Choose an idea to develop') : t('생각해 볼 방향 선택', 'Choose a direction to explore')}>
                        {result.options.slice(0, 5).map((option, index) => (
                          <div className={`thinking-coach__option${view.selectedOption?.id === option.id ? ' is-selected' : ''}`} key={option.id}>
                            <button type="button" disabled={disabled} aria-pressed={view.selectedOption?.id === option.id} onClick={() => selectOption(option)}>
                              <span className="thinking-coach__option-number">{view.selectedOption?.id === option.id ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span>
                              <span className="thinking-coach__option-text"><strong>{option.title}{option.inferred && <span className="thinking-coach__inference">{t('AI의 추론', 'AI inference')}</span>}</strong><span>{option.observation}</span></span><ChevronRight size={16} aria-hidden="true" />
                            </button>
                            <SourceTurns ids={option.sourceTurnIds} context={context} />
                          </div>
                        ))}
                      </div>
                    )}

                    {showSelected && selectedDetail && (
                      <div className="thinking-coach__thinking" key={selectedDetail.id}>
                        <span className="thinking-coach__eyebrow">{t('내가 선택한 방향', 'MY DIRECTION')}</span><h4>{selectedDetail.title}</h4>
                        {selectedDetail.whyItMatters && <p>{selectedDetail.whyItMatters}</p>}
                        {shownPrompts.length > 0 && <ol className="thinking-coach__prompts">{shownPrompts.slice(0, 4).map((prompt, index) => <li key={`${index}-${prompt}`}>{prompt}</li>)}</ol>}
                        {selectedDetail.followUp && <details className="thinking-coach__more"><summary>{t('상대 답변에 따른 다음 생각', 'Plan for their response')}<ChevronDown size={13} aria-hidden="true" /></summary><div className="thinking-coach__followup"><p><strong>{t('확인할 핵심', 'Target')}</strong>{selectedDetail.followUp.target}</p><p><strong>{t('인정한다면', 'If they agree')}</strong>{selectedDetail.followUp.ifYes}</p><p><strong>{t('부정한다면', 'If they disagree')}</strong>{selectedDetail.followUp.ifNo}</p><p><strong>{t('확보하려는 인정', 'What to establish')}</strong>{selectedDetail.followUp.concession}</p></div></details>}
                        <p className="thinking-coach__write-cue"><Lightbulb size={14} aria-hidden="true" />{t('떠오른 생각을 아래 작성창에 내 말로 적어 보세요.', 'Write what you think in your own words in the composer below.')}</p>
                      </div>
                    )}

                    {view.action === 'review' && <div className="thinking-coach__feedback">{result.feedback.slice(0, 3).map((item, index) => <div key={`${item.label}-${index}`}><span className="thinking-coach__label">{item.label}</span><p>{item.observation}</p><p className="thinking-coach__suggestion"><ArrowRight size={13} aria-hidden="true" />{item.suggestion}</p></div>)}{result.prompts.slice(0, 3).map((prompt, index) => <p className="thinking-coach__suggestion" key={`${index}-${prompt}`}><Lightbulb size={14} aria-hidden="true" />{prompt}</p>)}</div>}

                    {view.action === 'example' && result.example && <div className="thinking-coach__example"><span className="thinking-coach__eyebrow">{t('표현을 참고하는 짧은 예시', 'A SHORT EXAMPLE TO LEARN FROM')}</span><p>{result.example}</p><span>{t('구조를 참고해 나의 근거와 표현으로 다듬어 보세요.', 'Use the structure to refine your own evidence and wording.')}</span></div>}

                    {nextAction && <button type="button" className="thinking-coach__primary thinking-coach__continue" disabled={disabled || (nextAction === 'seeds' && view.selectedCriteria.length === 0)} onClick={() => navigate(nextAction)}>{nextLabel}<ArrowRight size={14} aria-hidden="true" /></button>}
                    {view.action === 'review' && reviewedCurrentDraft && <button type="button" className="thinking-coach__text-button" disabled={disabled} onClick={() => void request('example')}><Sparkles size={14} aria-hidden="true" />{t('표현이 막힐 때만, 짧은 예시 보기', 'Still stuck on wording? View a short example')}</button>}
                  </div>
                )}
              </div>

              <footer className="thinking-coach__footer">
                <div><strong>{t('내가 쓴 글에서 한 걸음 더', 'Take your own writing further')}</strong><span>{draft.trim() ? t('지금 작성 중인 내용으로 코칭받기', 'Get feedback on your current draft') : t('한 문장만 써도 함께 점검할 수 있어요.', 'Write a sentence to get feedback.')}</span></div>
                <button type="button" className="thinking-coach__review" disabled={disabled || busy || !draft.trim()} onClick={() => void request('review')}><ScanLine size={14} aria-hidden="true" />{reviewLabel}</button>
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  );
}
