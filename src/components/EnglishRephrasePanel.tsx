import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Languages, RotateCcw, Send, Sparkles } from 'lucide-react';
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

  const completedCount = userArguments.filter(argument => feedback[argument.id]).length;

  const updateDraft = (id: string, value: string) => {
    setDrafts(prev => ({ ...prev, [id]: value }));
  };

  const resetDraft = (id: string) => {
    setDrafts(prev => ({ ...prev, [id]: '' }));
    setFeedback(prev => ({ ...prev, [id]: undefined }));
  };

  const requestFeedback = async (argument: Argument) => {
    const draft = drafts[argument.id]?.trim();
    if (!draft || loading[argument.id]) return;

    setLoading(prev => ({ ...prev, [argument.id]: true }));
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
    setLoading(prev => ({ ...prev, [argument.id]: false }));
  };

  return (
    <main className="english-replay-shell">
      <section className="english-replay-header">
        <div>
          <span><Languages size={18} /> English Replay</span>
          <h1>내 발언 영어로 다시 쓰기</h1>
          <p>{topic}</p>
        </div>
        <div className="english-replay-actions">
          <button className="btn btn-secondary" onClick={onBackToReport}>
            <ArrowLeft size={18} /> 평가서 보기
          </button>
          <button className="btn btn-primary" onClick={onExit}>
            완료
          </button>
        </div>
      </section>

      <section className="english-replay-summary">
        <div>
          <strong>{completedCount}/{userArguments.length}</strong>
          <span>피드백 완료</span>
        </div>
        <p>한국어 원문을 보며 먼저 직접 영어 초안을 써보세요. 그 다음 피드백을 받아 의미와 토론 표현을 다듬습니다.</p>
      </section>

      <section className="english-replay-list">
        {userArguments.map((argument, index) => {
          const draft = drafts[argument.id] ?? '';
          const itemFeedback = feedback[argument.id];
          const isLoading = loading[argument.id] ?? false;

          return (
            <article key={argument.id} className="english-replay-item">
              <div className="english-original">
                <div className="english-card-head">
                  <span>{index + 1}</span>
                  <strong>{argument.roundTitle ?? '내 발언'}</strong>
                </div>
                <p>{argument.content}</p>
              </div>

              <div className="english-practice">
                <label htmlFor={`english-draft-${argument.id}`}>영어로 다시 써보기</label>
                <textarea
                  id={`english-draft-${argument.id}`}
                  value={draft}
                  onChange={event => updateDraft(argument.id, event.target.value)}
                  placeholder={getStarterPrompt(argument.roundTitle)}
                  maxLength={1200}
                />
                <div className="english-practice-actions">
                  <button className="btn btn-secondary" onClick={() => resetDraft(argument.id)} disabled={!draft && !itemFeedback}>
                    <RotateCcw size={17} /> 다시 쓰기
                  </button>
                  <button className="btn btn-primary" onClick={() => requestFeedback(argument)} disabled={!draft.trim() || isLoading}>
                    {isLoading ? <Sparkles size={17} /> : <Send size={17} />}
                    {isLoading ? '피드백 중' : '피드백 받기'}
                  </button>
                </div>

                {itemFeedback && (
                  <div className="english-feedback">
                    <div className="english-feedback-score">
                      <CheckCircle2 size={18} />
                      <strong>{itemFeedback.score}/100</strong>
                    </div>
                    <div>
                      <strong>의미 정확도</strong>
                      <p>{itemFeedback.meaningAccuracy}</p>
                    </div>
                    <div>
                      <strong>자연스러운 표현</strong>
                      <p>{itemFeedback.naturalExpression}</p>
                    </div>
                    <div>
                      <strong>토론 표현</strong>
                      <p>{itemFeedback.debateExpression}</p>
                    </div>
                    <div className="english-suggestion-grid">
                      <div className="english-suggestion">
                        <strong>원어민식 표현</strong>
                        <small>한글 원문 기준</small>
                        <p>{itemFeedback.nativeVersion}</p>
                      </div>
                      <div className="english-suggestion draft-based">
                        <strong>내 초안을 살린 표현</strong>
                        <small>한글 뜻 + 내 영어 초안 기준</small>
                        <p>{itemFeedback.draftBasedVersion}</p>
                      </div>
                    </div>
                    <div>
                      <strong>다시 쓰기 포인트</strong>
                      <p>{itemFeedback.practiceTip}</p>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
};
