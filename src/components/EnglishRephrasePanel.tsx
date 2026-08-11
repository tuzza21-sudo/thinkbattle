import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Languages, Lightbulb, PenLine, RotateCcw, Send, Sparkles, Target } from 'lucide-react';
import { generateEnglishRephraseFeedback } from '../lib/api';
import type { Argument, EnglishRephraseEntry, EnglishRephraseFeedback } from '../types';

interface EnglishRephrasePanelProps {
  topic: string;
  arguments: Argument[];
  initialRephrases?: EnglishRephraseEntry[];
  onSaveRephrase?: (entry: EnglishRephraseEntry) => void;
  onBackToReport: () => void;
  onExit: () => void;
}

type DraftState = Record<string, string>;
type FeedbackState = Record<string, EnglishRephraseFeedback | undefined>;
type LoadingState = Record<string, boolean>;
type ErrorState = Record<string, string | undefined>;

const getStarterPrompt = (roundTitle?: string) => {
  if (roundTitle?.includes('입론')) return 'I believe that ... because ...';
  if (roundTitle?.includes('반박')) return 'However, this argument is weak because ...';
  if (roundTitle?.includes('질문')) return 'My question is whether ...';
  if (roundTitle?.includes('최종')) return 'In conclusion, ...';
  return 'I think ... because ...';
};

export const EnglishRephrasePanel: React.FC<EnglishRephrasePanelProps> = ({
  topic,
  arguments: allArguments,
  initialRephrases = [],
  onSaveRephrase,
  onBackToReport,
  onExit,
}) => {
  const userArguments = useMemo(
    () => allArguments.filter(argument => !argument.isAi && argument.content.trim()),
    [allArguments],
  );
  const initialDrafts = useMemo(
    () => Object.fromEntries(initialRephrases.map(entry => [entry.argumentId, entry.englishDraft])),
    [initialRephrases],
  );
  const initialFeedback = useMemo(
    () => Object.fromEntries(initialRephrases.map(entry => [entry.argumentId, entry.feedback])),
    [initialRephrases],
  );
  const [drafts, setDrafts] = useState<DraftState>(initialDrafts);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [loading, setLoading] = useState<LoadingState>({});
  const [errors, setErrors] = useState<ErrorState>({});

  const completedCount = userArguments.filter(argument => feedback[argument.id]).length;

  const updateDraft = (id: string, value: string) => {
    setDrafts(prev => ({ ...prev, [id]: value }));
  };

  const resetDraft = (id: string) => {
    setDrafts(prev => ({ ...prev, [id]: '' }));
    setFeedback(prev => ({ ...prev, [id]: undefined }));
    setErrors(prev => ({ ...prev, [id]: undefined }));
  };

  const requestFeedback = async (argument: Argument) => {
    const draft = drafts[argument.id]?.trim();
    if (!draft || loading[argument.id]) return;

    setLoading(prev => ({ ...prev, [argument.id]: true }));
    setErrors(prev => ({ ...prev, [argument.id]: undefined }));
    try {
      const result = await generateEnglishRephraseFeedback(
        topic,
        argument.roundTitle ?? '토론 발언',
        argument.content,
        draft,
      );
      const entry: EnglishRephraseEntry = {
        argumentId: argument.id,
        englishDraft: draft,
        feedback: result,
        updatedAt: new Date().toISOString(),
      };
      setFeedback(prev => ({ ...prev, [argument.id]: result }));
      onSaveRephrase?.(entry);
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        [argument.id]: error instanceof Error ? error.message : '영어 코칭을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      }));
    } finally {
      setLoading(prev => ({ ...prev, [argument.id]: false }));
    }
  };

  return (
    <main className="english-replay-shell">
      <section className="english-replay-header">
        <div>
          <span><Languages size={18} /> ENGLISH REPLAY LAB</span>
          <h1>내 논리를 영어 토론 표현으로 바꾸기</h1>
          <p>{topic}</p>
        </div>
        <div className="english-replay-actions">
          <button className="btn btn-secondary" onClick={onBackToReport}>
            <ArrowLeft size={18} /> 결과 리포트
          </button>
          <button className="btn btn-primary" onClick={onExit}>
            학습 마치기
          </button>
        </div>
      </section>

      <section className="english-replay-summary">
        <div className="english-replay-progress-score">
          <strong>{completedCount}/{userArguments.length}</strong>
          <span>표현 코칭 완료</span>
        </div>
        <div className="english-replay-summary-copy">
          <strong>번역보다 중요한 것은 내 논리를 영어답게 전달하는 것입니다.</strong>
          <p>한국어 발언의 핵심을 유지해 먼저 직접 써보고, AI 코칭으로 의미 정확도·자연스러움·토론 표현을 차례로 다듬어 보세요.</p>
          <div className="english-replay-progress-track"><span style={{ width: `${userArguments.length ? completedCount / userArguments.length * 100 : 0}%` }} /></div>
        </div>
      </section>

      <section className="english-replay-list">
        {userArguments.length === 0 && (
          <div className="english-replay-empty"><Languages size={34} /><strong>영어로 다시 연습할 내 발언이 없습니다.</strong><p>토론을 완료한 뒤 다시 확인해 주세요.</p></div>
        )}
        {userArguments.map((argument, index) => {
          const draft = drafts[argument.id] ?? '';
          const itemFeedback = feedback[argument.id];
          const isLoading = loading[argument.id] ?? false;

          return (
            <article key={argument.id} className={`english-replay-item ${itemFeedback ? 'completed' : ''}`}>
              <header className="english-item-heading">
                <div><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{argument.roundTitle ?? '내 발언'}</strong><small>한국어 논리를 영어 토론 문장으로 재구성합니다.</small></div></div>
                {itemFeedback && <em><CheckCircle2 size={15} /> 코칭 완료 · {itemFeedback.score}점</em>}
              </header>

              <div className="english-replay-workbench">
                <section className="english-original">
                  <div className="english-workbench-label"><Target size={15} /><span>1. 한국어 원문에서 핵심 잡기</span></div>
                  <p>{argument.content}</p>
                </section>

                <section className="english-practice">
                  <label htmlFor={`english-draft-${argument.id}`}><PenLine size={15} /> 2. 내 영어 초안 작성하기</label>
                  <textarea
                    id={`english-draft-${argument.id}`}
                    value={draft}
                    onChange={event => updateDraft(argument.id, event.target.value)}
                    placeholder={`${getStarterPrompt(argument.roundTitle)}\n\n완벽한 문장보다 핵심 주장과 이유를 먼저 영어로 적어보세요.`}
                    maxLength={1200}
                  />
                  <div className="english-draft-meta"><span>{draft.length}/1200</span><small>직접 써본 뒤 코칭을 받아야 표현이 더 오래 남습니다.</small></div>
                  {errors[argument.id] && <p className="english-feedback-error">{errors[argument.id]}</p>}
                  <div className="english-practice-actions">
                    <button className="btn btn-secondary" onClick={() => resetDraft(argument.id)} disabled={!draft && !itemFeedback}>
                      <RotateCcw size={17} /> 초안 지우기
                    </button>
                    <button className="btn btn-primary" onClick={() => void requestFeedback(argument)} disabled={!draft.trim() || isLoading}>
                      {isLoading ? <Sparkles className="spin" size={17} /> : <Send size={17} />}
                      {isLoading ? '표현 분석 중' : itemFeedback ? '코칭 다시 받기' : 'AI 표현 코칭 받기'}
                    </button>
                  </div>
                </section>
              </div>

              {itemFeedback && (
                <section className="english-feedback">
                  <header className="english-feedback-heading"><div><Sparkles size={18} /><span><strong>표현 코치의 피드백</strong><small>의미는 유지하고, 실제 토론에서 더 선명하게 들리도록 다듬었습니다.</small></span></div><strong>{itemFeedback.score}<small>/100</small></strong></header>
                  <div className="english-feedback-metrics">
                    <article><strong>의미 전달</strong><p>{itemFeedback.meaningAccuracy}</p></article>
                    <article><strong>자연스러움</strong><p>{itemFeedback.naturalExpression}</p></article>
                    <article><strong>토론 설득력</strong><p>{itemFeedback.debateExpression}</p></article>
                  </div>
                  <div className="english-suggestion-grid">
                    <article className="english-suggestion">
                      <span>추천 완성 문장</span><small>한국어 원문의 의도를 가장 자연스럽게 표현</small><p>{itemFeedback.nativeVersion}</p>
                    </article>
                    <article className="english-suggestion draft-based">
                      <span>내 문장을 살린 수정안</span><small>내가 쓴 구조와 어휘를 최대한 유지해 개선</small><p>{itemFeedback.draftBasedVersion}</p>
                    </article>
                  </div>
                  <div className="english-practice-tip"><Lightbulb size={17} /><div><strong>이번 문장에서 기억할 표현 포인트</strong><p>{itemFeedback.practiceTip}</p></div></div>
                </section>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
};
