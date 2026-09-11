import { useId, useState } from 'react';
import { ArrowRight, Plus, Rows3, AlignLeft } from 'lucide-react';
import type { DebatePosition } from '../types';
import { openingLabels, parseOpeningDraft, serializeOpeningDraft, type OpeningField } from '../lib/openingDraft';
import './OpeningComposer.css';

interface OpeningComposerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  language?: 'ko' | 'en';
  position?: DebatePosition;
  maxLength?: number;
}

export function OpeningComposer({ value, onChange, disabled, language = 'ko', position, maxLength = 1200 }: OpeningComposerProps) {
  const en = language === 'en';
  const id = useId();
  const [mode, setMode] = useState<'structured' | 'free'>('structured');
  const [secondClaim, setSecondClaim] = useState(false);
  const [lengthError, setLengthError] = useState(false);
  const fields = parseOpeningDraft(value);
  const hasSecond = secondClaim || ['claim2', 'reason2', 'evidence2', 'impact2'].some(key => fields[key as OpeningField].trim());
  const placeholders: Record<OpeningField, string> = en ? {
    position: `Why do you support ${position === 'negative' ? 'the opposition' : 'the motion'}?`, criterion: 'What matters most in judging this motion?',
    claim1: 'What is the point you want to make?', reason1: 'Why is this claim reasonable?', evidence1: 'A verified fact, source, or clearly identified personal example', impact1: 'Who is affected, and why does this matter?',
    claim2: 'A different reason to support your position', reason2: 'Explain the connection', evidence2: 'What supports this point?', impact2: 'Why is this important?',
  } : {
    position: `${position === 'negative' ? '반대' : '찬성'} 입장을 내 말로 정리해 보세요`, criterion: '이 논제를 판단할 때 가장 중요한 것은?',
    claim1: '내가 가장 말하고 싶은 한 가지는?', reason1: '왜 그렇게 생각하나요?', evidence1: '확인한 자료·출처 또는 구체적인 경험을 적어보세요', impact1: '누구에게, 어떤 점에서 중요한가요?',
    claim2: '내 입장을 뒷받침하는 또 다른 주장은?', reason2: '이 주장이 타당한 이유는?', evidence2: '어떤 사실이나 사례로 뒷받침할 수 있나요?', impact2: '이 주장이 왜 중요한가요?',
  };
  const update = (key: OpeningField, text: string) => {
    const next = serializeOpeningDraft({ ...fields, [key]: text }, language);
    if (next.length > maxLength) { setLengthError(true); return; }
    setLengthError(false);
    onChange(next);
  };
  const field = (key: OpeningField, compact = false) => (
    <label className={`opening-field ${compact ? 'compact' : ''}`} key={key}>
      <span>{openingLabels[language][key]}</span>
      <textarea id={`${id}-${key}`} rows={compact ? 1 : 2} value={fields[key]} onChange={event => update(key, event.target.value)} placeholder={placeholders[key]} disabled={disabled} maxLength={maxLength} />
    </label>
  );

  return <div className="opening-composer">
    <div className="opening-toolbar">
      <div className="opening-mode" role="group" aria-label={en ? 'Writing format' : '작성 방식'}>
        <button type="button" aria-pressed={mode === 'structured'} onClick={() => setMode('structured')}><Rows3 size={14} />{en ? 'Guided writing' : '구조로 쓰기'}</button>
        <button type="button" aria-pressed={mode === 'free'} onClick={() => setMode('free')}><AlignLeft size={14} />{en ? 'Free writing' : '자유롭게 쓰기'}</button>
      </div>
      <span>{en ? 'Every field is optional' : '필요한 칸부터 자유롭게 채우세요'}</span>
    </div>
    {mode === 'structured' ? <div className="opening-structure">
      <div className="opening-foundation">{field('position', true)}{field('criterion', true)}</div>
      <div className="opening-logic" aria-label="Claim → Reason → Evidence → Impact">
        {(en ? ['Claim', 'Reason', 'Evidence', 'Impact'] : ['주장', '이유', '근거', '중요성']).map((label, index) => <span key={label}>{index > 0 && <ArrowRight size={12} />}<b>{String(index + 1).padStart(2, '0')}</b>{label}</span>)}
      </div>
      <div className="opening-argument-fields">{(['claim1', 'reason1', 'evidence1', 'impact1'] as OpeningField[]).map(key => field(key))}</div>
      {hasSecond ? <details className="opening-second" open={secondClaim || undefined}>
        <summary>{en ? 'Second argument' : '두 번째 주장'}</summary>
        <div className="opening-argument-fields">{(['claim2', 'reason2', 'evidence2', 'impact2'] as OpeningField[]).map(key => field(key))}</div>
      </details> : <button type="button" className="opening-add" disabled={disabled} onClick={() => setSecondClaim(true)}><Plus size={14} />{en ? 'Add a second argument' : '두 번째 주장 추가하기'}</button>}
    </div> : <textarea className="input-textarea opening-free" aria-label={en ? 'Opening speech' : '입론 자유 작성'} value={value} onChange={event => { setLengthError(false); onChange(event.target.value); }} disabled={disabled} maxLength={maxLength} placeholder={en ? 'State your position, explain why, and add supporting evidence.' : '내 입장을 밝히고, 그렇게 생각하는 이유와 근거를 적어보세요.'} rows={6} />}
    {lengthError && <p className="opening-length-error" role="alert">{en ? `Keep your opening within ${maxLength} characters, including field labels.` : `항목 이름을 포함해 ${maxLength}자까지 작성할 수 있어요. 다른 내용을 조금 줄여주세요.`}</p>}
  </div>;
}
