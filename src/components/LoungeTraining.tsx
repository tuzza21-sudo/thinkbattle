import { useEffect, useId, useState } from 'react';
import { Briefcase, Handshake, LoaderCircle, Play, RotateCcw, Target, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { startLoungeScenario, startLoungeTraining } from '../lib/loungeApi';
import { getLoungeCharacter } from '../lib/loungeCharacters';
import { flipLoungeNegotiationScenario, loungeNegotiationScenarioOf, formatLoungeAmount, loungeInterviewGaps, loungeInterviewPressures, loungeNegotiationLevels, loungeNegotiationScenario, loungeNegotiationScenarios, loungeNegotiationTactics, loungeTrainerOf, loungeTrainers, readLoungeTrainingState, type LoungeInterviewState, type LoungeNegotiationState, type LoungeTrainingKind, type LoungeTrainingState } from '../lib/loungeTraining';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const percent = (value: number | null | undefined) => value == null ? '' : `${Math.round(value * 100)}%`;

/**
 * 실전 훈련's place above the composer (2026-11-26, by the owner): the setup before a training, where it stands during
 * it (the counterpart's number and the round, or the question), and the result card after it.
 */
export function LoungeTrainingBar({ kind, roomId, storyState, send, disabled }: { kind: LoungeTrainingKind; roomId: string; storyState?: unknown; send?: (text: string) => Promise<void>; disabled?: boolean }) {
  const [override, setOverride] = useState<LoungeTrainingState | null>(null);
  const [open, setOpen] = useState(false);
  // The room's state wins again once it moves (the reply carries it).
  useEffect(() => { setOverride(null); }, [storyState]);
  const state = readLoungeTrainingState(override ?? storyState);
  const live = state?.kind === kind ? state : undefined;
  const started = async (next: LoungeTrainingState) => {
    setOverride(next); setOpen(false);
    await send?.(kind === 'negotiation' ? '협상을 시작할게요.' : '면접을 시작할게요.');
  };
  return <div className="lounge-lesson-bar lounge-training-bar">
    {!live || live.phase === 'done' ? <>
      {live?.phase === 'done' && (live.kind === 'negotiation' ? <NegotiationResult state={live} /> : <InterviewResult state={live} />)}
      <div className="lounge-lesson-head">
        {kind === 'negotiation' ? <Handshake size={16} /> : <Briefcase size={16} />}
        <span className="lounge-lesson-progress"><b>{live ? '다시 해 볼까요?' : kind === 'negotiation' ? '협상 상황을 골라 시작해요' : '면접을 설정하고 시작해요'}</b></span>
        <button type="button" className="lounge-lesson-button" disabled={disabled} onClick={() => setOpen(true)}>{live ? <RotateCcw size={15} /> : <Play size={15} />} 훈련 설정</button>
      </div>
    </> : live.kind === 'negotiation' ? <NegotiationStatus state={live} /> : <InterviewStatus state={live} />}
    {open && <LoungeTrainingSetup kind={kind} roomId={roomId} onStarted={next => void started(next)} onClose={() => setOpen(false)} />}
  </div>;
}

function NegotiationStatus({ state }: { state: LoungeNegotiationState }) {
  const scenario = loungeNegotiationScenarioOf(state);
  const level = loungeNegotiationLevels.find(entry => entry.id === state.level)!;
  const amount = (value: number | null | undefined) => formatLoungeAmount(value, scenario);
  return <section className="lounge-lesson-task lounge-training-status" aria-label="협상 진행">
    <header><b>{scenario.title}</b><span className="lounge-lesson-badges"><span className="lounge-lesson-badge kind">{level.label}</span><span className="lounge-lesson-badge">라운드 {state.rounds}/{level.rounds}</span></span></header>
    <p className="lounge-lesson-scene"><span>상대 제안</span>{amount(state.theirs.at(-1))}</p>
    <p className="lounge-lesson-meaning"><span>내 제안</span>{state.mine.length ? amount(state.mine.at(-1)) : '아직 숫자를 내지 않았어요'}{state.plan.target != null && <> · 목표 {amount(state.plan.target)}</>}</p>
    {state.revealed && <p className="lounge-lesson-reveal"><span>알아낸 것</span><b>{state.hidden.interest}</b></p>}
  </section>;
}

function NegotiationResult({ state }: { state: LoungeNegotiationState }) {
  const scenario = loungeNegotiationScenarioOf(state);
  const result = state.result!;
  const amount = (value: number | null | undefined) => formatLoungeAmount(value, scenario);
  const outcome = result.deal == null ? result.by === 'timeout' ? '상대가 판을 접었어요' : '협상을 깨고 나왔어요' : `${amount(result.deal)}에 합의`;
  return <section className="lounge-lesson-task lounge-training-result" aria-label="협상 결과">
    <header><b>협상 결과 · {scenario.title}</b><span className="lounge-lesson-badge kind">{outcome}</span></header>
    {result.capture != null && <div className="lounge-training-meter" aria-label={`상대가 양보할 수 있던 폭 중 ${percent(result.capture)} 확보`}>
      <i><span style={{ width: percent(result.capture) }} /></i><small>상대가 양보할 수 있던 폭 중 <b>{percent(result.capture)}</b>를 가져왔어요</small>
    </div>}
    <p className="lounge-lesson-meaning"><span>상대 첫 숫자</span>{amount(result.opening)} · <span>실제 한계선</span><b>{amount(result.reservation)}</b></p>
    <p className="lounge-lesson-meaning"><span>숨은 사정</span>{result.interest}{result.revealed ? ' (알아냈어요)' : ' (못 알아냈어요)'}</p>
    {(result.target_hit != null || result.walkaway_kept != null) && <p className="lounge-lesson-meaning"><span>내 계획</span>{result.target_hit != null && <>목표 {result.target_hit ? '달성' : '미달'}</>}{result.walkaway_kept != null && <> · 마지노선 {result.walkaway_kept ? '지킴' : '넘김'}</>}</p>}
    {result.used.length > 0 && <p className="lounge-lesson-meaning"><span>잘 쓴 수</span>{result.used.map(tactic => loungeNegotiationTactics[tactic].label).join(', ')}</p>}
    {result.missed.length > 0 && <><p className="lounge-training-section">놓친 수와 이렇게 말해 보기</p><ul className="lounge-training-tips">{result.missed.map(tactic => { const entry = loungeNegotiationTactics[tactic]; return <li key={tactic}><b>{entry.label}</b> {entry.tip}
      <span className="lounge-training-phrases">{entry.phrases.map(line => <q key={line}>{line.replace(/^"|"$/g, '')}</q>)}</span><small>피할 것 · {entry.avoid}</small></li>; })}</ul></>}
    {result.advice && result.advice.length > 0 && <><p className="lounge-training-section">이번 협상에서 챙길 실전 팁</p><ul className="lounge-training-tips">{result.advice.map(item => <li key={item.title}><b>{item.title}</b> {item.text}
      <span className="lounge-training-phrases">{item.phrases.map(line => <q key={line}>{line.replace(/^"|"$/g, '')}</q>)}</span></li>)}</ul></>}
  </section>;
}

function InterviewStatus({ state }: { state: LoungeInterviewState }) {
  const question = state.questions[Math.min(state.index, state.questions.length - 1)];
  const pressure = loungeInterviewPressures.find(entry => entry.id === state.setup.pressure)!;
  return <section className="lounge-lesson-task lounge-training-status" aria-label="면접 진행">
    <header><b>{state.setup.job} 면접</b><span className="lounge-lesson-badges"><span className="lounge-lesson-badge kind">압박 {pressure.label}</span><span className="lounge-lesson-badge">질문 {Math.min(state.index + 1, state.questions.length)}/{state.questions.length}</span></span></header>
    {state.opened && <p className="lounge-lesson-scene"><span>질문</span>{question.text}</p>}
    {state.opened && <p className="lounge-lesson-reveal muted">{state.follows ? '꼬리 질문 중이에요. 장면과 숫자, 내 역할로 답해 보세요.' : '결론부터, 그다음 근거와 결과 순서로 1분 안에.'}</p>}
  </section>;
}

function InterviewResult({ state }: { state: LoungeInterviewState }) {
  const result = state.result!;
  return <section className="lounge-lesson-task lounge-training-result" aria-label="면접 결과">
    <header><b>면접 결과 · {state.setup.job}</b><span className="lounge-lesson-badge kind">{result.score}점</span></header>
    <ol className="lounge-training-scores">{result.per.filter(entry => state.questions[entry.index]?.kind !== 'closing').map(entry => <li key={entry.index} className={entry.index === result.weakest ? 'weak' : entry.index === result.best ? 'best' : undefined}>
      <span>{state.questions[entry.index]?.text}</span>
      <i><span style={{ width: `${entry.score}%` }} /></i><b>{entry.score}</b>
      {entry.gaps.length > 0 && <small>{entry.gaps.map(gap => loungeInterviewGaps[gap].label).join(' · ')}</small>}
    </li>)}</ol>
    {result.gaps.length > 0 && <ul className="lounge-training-tips">{result.gaps.map(gap => <li key={gap}><b>{loungeInterviewGaps[gap].label}</b> {loungeInterviewGaps[gap].tip}</li>)}</ul>}
    {!result.finished && <p className="lounge-lesson-reveal muted">중간에 끝낸 면접이라 답한 질문만 매겼어요.</p>}
  </section>;
}

/** The setup of a training: a negotiation's situation, toughness and the member's plan, or an interview's job and pressure. */
function LoungeTrainingSetup({ kind, roomId, onStarted, onClose }: { kind: LoungeTrainingKind; roomId: string; onStarted: (state: LoungeTrainingState) => void; onClose: () => void }) {
  const titleId = useId();
  const [scenario, setScenario] = useState(loungeNegotiationScenarios[0].id);
  const [level, setLevel] = useState<string>('normal');
  const [target, setTarget] = useState('');
  const [walkaway, setWalkaway] = useState('');
  const [batna, setBatna] = useState('');
  const [job, setJob] = useState('');
  const [career, setCareer] = useState('');
  const [company, setCompany] = useState('');
  const [posting, setPosting] = useState('');
  const [resume, setResume] = useState('');
  const [pressure, setPressure] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const custom = scenario === 'custom';
  const chosen = loungeNegotiationScenario(custom ? loungeNegotiationScenarios[0].id : scenario)!;
  // The chosen situation as the member edits it (prefilled from it), or the one they write.
  const [edit, setEdit] = useState<{ context: string; member: string; name: string; role: string; style: string; opening: string } | null>(null);
  const [own, setOwn] = useState({ title: '', situation: '', side: 'buyer', unit: '만원', opening: '', counterpart: '' });
  const unit = custom ? (own.unit === '%' ? '%' : '만 원') : chosen.unit === '%' ? '%' : `${chosen.per ? `${chosen.per} ` : ''}만 원`;
  const [flip, setFlip] = useState(false);
  const flipped = flipLoungeNegotiationScenario(chosen);
  const choose = (id: string) => { setScenario(id); setEdit(null); };
  const startEdit = () => setEdit({ context: chosen.context, member: chosen.member, name: chosen.counterpart.name, role: chosen.counterpart.role, style: chosen.counterpart.style, opening: String(chosen.opening) });
  const editPayload = edit ? { context: edit.context, member: edit.member, opening: edit.opening, counterpart: { name: edit.name, role: edit.role, style: edit.style } } : undefined;
  const start = async () => {
    setBusy(true); setError('');
    try {
      const { state } = await startLoungeTraining(roomId, kind === 'negotiation' ? { scenario, level, target, walkaway, batna, ...(custom ? own : editPayload ? { edit: editPayload } : {}), ...(flip ? { flip: true } : {}) } : { job, career, company, posting, resume, pressure });
      const next = readLoungeTrainingState(state);
      if (!next) throw new Error('훈련을 시작하지 못했어요. 다시 시도해 주세요.');
      onStarted(next);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-memory-sheet lounge-lesson-sheet lounge-training-setup" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>{kind === 'negotiation' ? '협상 훈련 설정' : '면접 훈련 설정'}</b><button type="button" onClick={onClose} disabled={busy} aria-label="닫기"><X size={18} /></button></header>
      {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
      <form className="lounge-memory-panel lounge-memory-editor lounge-lesson-add" onSubmit={event => { event.preventDefault(); void start(); }}>
        {kind === 'negotiation' ? <>
          <div className="lounge-training-choices" role="radiogroup" aria-label="협상 상황">
            {loungeNegotiationScenarios.map(entry => <button key={entry.id} type="button" role="radio" aria-checked={scenario === entry.id} className={scenario === entry.id ? 'active' : ''} onClick={() => choose(entry.id)}>
              <b>{entry.title}</b><small>{entry.level} · {entry.role === 'buyer' ? '사는 쪽' : '파는 쪽'}</small>
            </button>)}
            <button type="button" role="radio" aria-checked={custom} className={`custom${custom ? ' active' : ''}`} onClick={() => choose('custom')}><b>+ 직접 만들기</b><small>내 협상 주제를 적어요</small></button>
          </div>
          {custom ? <div className="lounge-training-own">
            <label><span>협상 주제</span><input maxLength={60} value={own.title} onChange={event => setOwn({ ...own, title: event.target.value })} placeholder="예: 이사 업체 견적 깎기, 외주 개발비 협상, 팀장과 연봉 재협상" /></label>
            <label><span>상황 <small>누구와, 무엇을, 지금 어떤 숫자가 오갔는지</small></span><textarea rows={4} maxLength={800} value={own.situation} onChange={event => setOwn({ ...own, situation: event.target.value })} placeholder={'예: 이사 업체가 30평 포장이사를 220만 원에 불렀어요. 다른 업체는 180만 원이었는데 후기가 별로예요. 날짜는 다음 달 첫 주 토요일로 정해져 있어요.'} required /></label>
            <div className="lounge-training-inline">
              <label><span>나는</span><select value={own.side} onChange={event => setOwn({ ...own, side: event.target.value })}><option value="buyer">사는 쪽 · 깎는 쪽</option><option value="seller">파는 쪽 · 올리는 쪽</option></select></label>
              <label><span>단위</span><select value={own.unit} onChange={event => setOwn({ ...own, unit: event.target.value })}><option value="만원">만 원</option><option value="%">%</option></select></label>
              <label><span>상대의 첫 숫자 <small>선택</small></span><input inputMode="decimal" value={own.opening} onChange={event => setOwn({ ...own, opening: event.target.value })} placeholder="예: 220" /></label>
            </div>
            <label><span>상대는 누구 <small>선택</small></span><input maxLength={80} value={own.counterpart} onChange={event => setOwn({ ...own, counterpart: event.target.value })} placeholder="예: 이사 업체 영업 담당, 팀장" /></label>
            <p className="lounge-memory-fine">상대의 실제 한계선과 숨은 사정은 적어 주신 상황에 맞게 AI가 정하고, 끝날 때까지 숨겨져요.</p>
          </div> : edit ? <div className="lounge-training-own">
            <label><span>상황</span><textarea rows={4} maxLength={600} value={edit.context} onChange={event => setEdit({ ...edit, context: event.target.value })} /></label>
            <label><span>나는</span><input maxLength={120} value={edit.member} onChange={event => setEdit({ ...edit, member: event.target.value })} /></label>
            <div className="lounge-training-inline">
              <label><span>상대 이름</span><input maxLength={20} value={edit.name} onChange={event => setEdit({ ...edit, name: event.target.value })} /></label>
              <label><span>상대 역할</span><input maxLength={40} value={edit.role} onChange={event => setEdit({ ...edit, role: event.target.value })} /></label>
              <label><span>상대 첫 숫자 <small>{unit}</small></span><input inputMode="decimal" value={edit.opening} onChange={event => setEdit({ ...edit, opening: event.target.value })} /></label>
            </div>
            <label><span>상대 성향</span><input maxLength={80} value={edit.style} onChange={event => setEdit({ ...edit, style: event.target.value })} /></label>
            <button type="button" className="lounge-training-reset" onClick={() => setEdit(null)}>원래 상황으로</button>
            <p className="lounge-memory-fine">상대의 첫 숫자를 바꾸면, 숨은 한계선도 같은 비율로 맞춰져요.</p>
          </div> : <div className="lounge-lesson-preview"><p><b>나</b> {chosen.member}</p><p><b>상대</b> {chosen.counterpart.role} {chosen.counterpart.name}</p><small>{chosen.context}</small>
            <div><button type="button" onClick={startEdit}>내 상황에 맞게 고치기</button></div></div>}
          <label className="lounge-training-flip"><input type="checkbox" checked={flip} onChange={event => setFlip(event.target.checked)} /><span><b>역할 바꾸기</b><small>{custom ? `반대 입장(${own.side === 'buyer' ? '파는 쪽' : '사는 쪽'})에서 협상해요. 상대가 지금의 나를 맡아요.` : `내가 '${chosen.counterpart.role}', 상대가 '${chosen.member}' 역할을 맡아요. 상대의 첫 숫자는 ${formatLoungeAmount(flipped.opening, flipped)}예요.`}</small></span></label>
          <div className="lounge-lesson-levels lounge-training-levels" role="radiogroup" aria-label="상대 난이도">
            {loungeNegotiationLevels.map(entry => <button key={entry.id} type="button" role="radio" aria-checked={level === entry.id} className={level === entry.id ? 'active' : ''} onClick={() => setLevel(entry.id)}><b>{entry.label}</b><small>{entry.note}</small></button>)}
          </div>
          <label><span>내 목표 <small>{unit}, 선택</small></span><input inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} placeholder={((custom ? own.side : chosen.role) === 'buyer') !== flip ? '이 정도면 성공' : '이 정도는 받고 싶다'} /></label>
          <label><span>내 마지노선 <small>{unit}, 선택 · 이걸 넘으면 안 한다</small></span><input inputMode="decimal" value={walkaway} onChange={event => setWalkaway(event.target.value)} /></label>
          <label><span>협상이 깨지면 쓸 대안 <small>선택</small></span><input maxLength={200} value={batna} onChange={event => setBatna(event.target.value)} placeholder="예: 비슷한 매물 하나 더 봐 둠" /></label>
          <p className="lounge-memory-fine">상대의 실제 한계선과 숨은 사정은 시작할 때 정해지고, 끝나면 공개돼요.</p>
        </> : <>
          <label><span>지원 직무</span><input maxLength={60} value={job} onChange={event => setJob(event.target.value)} placeholder="예: 백엔드 개발자, 마케팅 매니저" required /></label>
          <label><span>경력 <small>선택</small></span><input maxLength={60} value={career} onChange={event => setCareer(event.target.value)} placeholder="예: 신입, 경력 5년" /></label>
          <label><span>회사·업계 <small>선택</small></span><input maxLength={60} value={company} onChange={event => setCompany(event.target.value)} placeholder="예: 핀테크 스타트업" /></label>
          <label><span>채용 공고 <small>선택, 붙여 넣기</small></span><textarea rows={3} maxLength={1500} value={posting} onChange={event => setPosting(event.target.value)} /></label>
          <label><span>이력·자기소개 요약 <small>선택</small></span><textarea rows={3} maxLength={1500} value={resume} onChange={event => setResume(event.target.value)} placeholder="주요 경험과 성과를 몇 줄로" /></label>
          <div className="lounge-lesson-levels lounge-training-levels three" role="radiogroup" aria-label="압박 단계">
            {loungeInterviewPressures.map(entry => <button key={entry.id} type="button" role="radio" aria-checked={pressure === entry.id} className={pressure === entry.id ? 'active' : ''} onClick={() => setPressure(entry.id)}><b>{entry.label}</b><small>{entry.note}</small></button>)}
          </div>
          <p className="lounge-memory-fine">압박은 답의 내용에만 해요. 공고와 자기소개는 질문을 만드는 데만 쓰여요.</p>
        </>}
        <div><button type="submit" className="primary" disabled={busy || (kind === 'interview' && job.trim().length < 2) || (kind === 'negotiation' && custom && own.situation.trim().length < 10)}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : <Target size={15} />} {kind === 'negotiation' ? busy && custom ? '상대를 준비하는 중…' : '협상 시작' : busy ? '질문 만드는 중…' : '면접 시작'}</button></div>
      </form>
    </section>
  </>;
}

/** The training's way in, on the story character's page: apart from the stories, a training with the same person. */
export function LoungeTrainingStart({ characterId, user }: { characterId: string; user: AppUser | null }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trainer = loungeTrainerOf(characterId);
  if (!trainer) return null;
  const name = getLoungeCharacter(characterId)?.name ?? '코치';
  const negotiation = loungeTrainers[trainer].kind === 'negotiation';
  const start = async () => {
    if (!user || busy) return;
    setBusy(true); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(loungeTrainers[trainer].scenario, user.nickname)}`); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return <div className="lounge-lesson-start">
    <div className="lounge-lesson-start-head">{negotiation ? <Handshake size={18} /> : <Briefcase size={18} />}<b>{name}의 {negotiation ? '실전 협상 훈련' : '실전 압박 면접'}</b><span>무료 체험</span></div>
    {negotiation ? <ul>
      <li>중고차·연봉·전세·견적·단가·토지 매입 중 상황을 고르면, {name}이 <b>상대편</b>을 맡아요.</li>
      <li>상대의 <b>한계선과 숨은 사정</b>은 숨겨져 있고, 끝나면 공개돼요. 내가 양보 폭의 몇 %를 가져왔는지 숫자로 보여 줘요.</li>
      <li>잘한 수와 놓친 수, 실전 협상 팁으로 복기해요. 전화로도, 채팅으로도.</li>
    </ul> : <ul>
      <li>직무와 경력(공고·자기소개는 선택)을 넣으면, 그에 맞는 <b>실제 면접 질문</b>을 만들어요.</li>
      <li>답이 막연하면 <b>꼬리 질문</b>으로 파고들어요. 압박 단계는 직접 골라요.</li>
      <li>끝나면 질문별 점수와, 가장 약했던 답의 <b>더 나은 버전</b>을 알려 줘요.</li>
    </ul>}
    {user ? <button type="button" className="lounge-character-cta" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="lounge-spin" /> : negotiation ? <Handshake size={17} /> : <Briefcase size={17} />}{negotiation ? '협상 훈련 시작하기' : '면접 훈련 시작하기'}</button>
      : <Link to="/" className="lounge-character-cta">{negotiation ? <Handshake size={17} /> : <Briefcase size={17} />}로그인하고 시작하기</Link>}
    <small>훈련은 이야기와 따로 진행돼요. 훈련에서는 연애 이야기 없이 실전 연습에만 집중해요.</small>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </div>;
}
