import { useEffect, useId, useState } from 'react';
import { Check, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { getMyLoungeAutonomy, setMyLoungeAutonomy } from '../lib/loungeApi';
import {
  effectiveLoungeAutonomy, getLoungeAutonomyProfile, loungeAutonomyGoalCount, loungeAutonomyGoalLimit,
  loungeAutonomyPersonalityLimit, normalizeLoungeAutonomyMember, type LoungeAutonomyMember,
} from '../lib/loungeAutonomy';

const errorText = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (/schema cache|does not exist|Could not find|42P01|PGRST202/i.test(message)) {
    return '자율 설정 기능을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.';
  }
  return message || '잠시 연결이 어려워요. 다시 시도해 주세요.';
};

const emptyGoals = () => Array.from({ length: loungeAutonomyGoalCount }, () => '');

/**
 * Kindroid-style sheet: this member edits personality, goals and ambient for one character only (대화 설정).
 */
export function LoungeAutonomySheet({ characterId, characterName, onClose }: {
  characterId: string; characterName: string; onClose: () => void;
}) {
  const profile = getLoungeAutonomyProfile(characterId);
  const [personality, setPersonality] = useState('');
  const [coreDrive, setCoreDrive] = useState('');
  const [goals, setGoals] = useState<string[]>(emptyGoals());
  const [intention, setIntention] = useState('');
  const [ambient, setAmbient] = useState('');
  const [mood, setMood] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const titleId = useId();

  const fillDefaults = () => {
    setPersonality('');
    setCoreDrive(profile?.coreDrive ?? '');
    setGoals([...(profile?.persistentGoals ?? []), ...emptyGoals()].slice(0, loungeAutonomyGoalCount));
    setIntention(profile?.defaultIntention ?? '');
    setAmbient('');
    setMood('');
  };

  const applyMember = (member: LoungeAutonomyMember | undefined) => {
    const life = effectiveLoungeAutonomy(characterId, member ? { member } : undefined);
    setPersonality(member?.personality ?? '');
    setCoreDrive(member?.core_drive ?? life?.coreDrive ?? profile?.coreDrive ?? '');
    const nextGoals = [...(member?.goals?.length ? member.goals : life?.persistentGoals ?? profile?.persistentGoals ?? [])];
    while (nextGoals.length < loungeAutonomyGoalCount) nextGoals.push('');
    setGoals(nextGoals.slice(0, loungeAutonomyGoalCount));
    setIntention(member?.current_intention ?? life?.current_intention ?? profile?.defaultIntention ?? '');
    setAmbient(member?.ambient ?? life?.ambient ?? '');
    setMood(member?.mood_hint ?? life?.mood_hint ?? '');
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(false); setError('');
    getMyLoungeAutonomy(characterId).then(book => {
      if (cancelled) return;
      applyMember(normalizeLoungeAutonomyMember(book?.member));
      setLoaded(true);
    }, err => {
      if (cancelled) return;
      applyMember(undefined);
      setLoaded(true);
      setError(errorText(err));
    });
    return () => { cancelled = true; };
  }, [characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async (clear = false) => {
    setBusy(clear ? 'clear' : 'save'); setError('');
    try {
      const member = clear ? {} : {
        personality: personality.trim(),
        core_drive: coreDrive.trim(),
        goals: goals.map(item => item.trim()).filter(Boolean),
        current_intention: intention.trim(),
        ambient: ambient.trim(),
        mood_hint: mood.trim(),
      };
      const book = await setMyLoungeAutonomy(characterId, member);
      applyMember(normalizeLoungeAutonomyMember(book.member));
      if (clear) fillDefaults();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  };

  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-memory-sheet lounge-autonomy-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header>
        <b id={titleId}><Sparkles size={16} /> {characterName} · 자율</b>
        <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button>
      </header>
      <p className="lounge-memory-note">이 대화에서만 {characterName}의 성격·목표·지금 상황을 직접 정해 대사가 바뀌어요. 다른 사람 채팅에는 적용되지 않아요.</p>
      {!loaded ? <p className="lounge-memory-empty"><LoaderCircle size={15} className="lounge-spin" /> 불러오는 중…</p> : <form className="lounge-memory-editor lounge-autonomy-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>
          <span>성격 · 말투 <small>비우면 기본 성격</small></span>
          <textarea rows={3} maxLength={loungeAutonomyPersonalityLimit} value={personality} onChange={event => setPersonality(event.target.value)}
            placeholder="예: 더 장난스럽고 반말로, 칭찬은 아끼지만 곁을 잘 챙긴다" />
        </label>
        <label>
          <span>근본 욕구 (Core Drive)</span>
          <textarea rows={2} maxLength={120} value={coreDrive} onChange={event => setCoreDrive(event.target.value)}
            placeholder={profile?.coreDrive ?? '이 캐릭터가 오래 품고 있는 욕구'} />
        </label>
        <fieldset className="lounge-autonomy-goals">
          <legend>장기 목표 (최대 {loungeAutonomyGoalCount})</legend>
          {goals.map((goal, index) => <input key={index} maxLength={loungeAutonomyGoalLimit} value={goal}
            onChange={event => setGoals(previous => previous.map((item, at) => at === index ? event.target.value : item))}
            placeholder={profile?.persistentGoals[index] ?? `목표 ${index + 1}`} />)}
        </fieldset>
        <label>
          <span>지금 하고 싶은 일 (Current Intention)</span>
          <input maxLength={80} value={intention} onChange={event => setIntention(event.target.value)}
            placeholder={profile?.defaultIntention ?? '지금 신경 쓰는 일'} />
        </label>
        <label>
          <span>지금 진행 중 (Ambient)</span>
          <textarea rows={2} maxLength={120} value={ambient} onChange={event => setAmbient(event.target.value)}
            placeholder="예: 리허설 중 PD와 멘트 수위로 다퉜다" />
        </label>
        <label>
          <span>분위기 힌트 <small>선택</small></span>
          <input maxLength={40} value={mood} onChange={event => setMood(event.target.value)} placeholder="예: 짜증, 여운, 설렘" />
        </label>
        {error && <p className="lounge-memory-empty" role="alert">{error}</p>}
        <div>
          <button type="button" disabled={Boolean(busy)} onClick={() => void save(true)}>
            {busy === 'clear' ? <LoaderCircle size={15} className="lounge-spin" /> : <RotateCcw size={15} />}기본값으로
          </button>
          <button type="submit" className="primary" disabled={Boolean(busy)}>
            {busy === 'save' ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}저장
          </button>
        </div>
      </form>}
      <p className="lounge-memory-fine">저장한 성격·목표·Ambient는 다음 대사부터 반영돼요. 채팅을 삭제하면 함께 초기화돼요.</p>
    </section>
  </>;
}
