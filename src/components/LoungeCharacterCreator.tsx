import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Camera, Check, LoaderCircle, MessageCircle, Play, Send, Sparkles, Upload, Wand2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import {
  LoungeCharacterError, chooseLoungeCharacterPortrait, draftLoungeCharacter, makeLoungeCharacterPortrait, saveLoungeCharacter,
  setLoungeCustomStatus, startLoungeCustomChat, uploadLoungeCharacterPortrait,
} from '../lib/loungeApi';
import {
  loungeCustomLimit, loungeCustomRules, loungeCustomThemes, loungeVoicePresets, loungeVoicePresetSample, normalizeLoungeCustomSheet,
  type LoungeCustomCharacterRow, type LoungeCustomGender, type LoungeCustomSheet,
} from '../lib/loungeCustomCharacters';
import { loadLoungeCustomCharacter, loungeCustomPortrait, registerLoungeCustomRow } from '../lib/loungeCustomClient';
import { koreanWith } from '../lib/loungeCharacters';
import { relationshipTemplateIds, relationshipTemplates, type RelationshipTemplateId } from '../lib/relationship/templates';
import './LoungeCharacter.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const emptySheet: LoungeCustomSheet = { name: '', age: 28, gender: 'female', job: '', concept: '', intro: '', personality: '', tastes: '', tagline: '', look: '', greeting: '' };
// The voices to choose from follow the character's gender; "other" can choose any.
const voiceGender: Record<string, 'female' | 'male'> = { calm_female: 'female', low_female: 'female', deep_male: 'male', soft_male: 'male', firm_male: 'male', playful_male: 'male' };
const statusLabels: Record<LoungeCustomCharacterRow['status'], string> = { private: '나만 대화', pending: '공개 검수 중', public: '공개됨', rejected: '공개 반려' };

/** An image the member picked, made smaller (longest side 1024 px) before it is sent. */
async function smallerImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

function Field({ label, hint, problem, children }: { label: string; hint?: string; problem?: string; children: ReactNode }) {
  return <label className={`lounge-creator-field ${problem ? 'has-problem' : ''}`}>
    <span>{label}{hint && <small>{hint}</small>}</span>{children}{problem && <em role="alert">{problem}</em>}
  </label>;
}

/**
 * Making a character: a few lines, the AI drafts the rest, the member edits it, then a portrait. The sheet must meet
 * the same standard as the house characters (the rules in loungeCustomCharacters.ts and an AI review on save).
 */
export function LoungeCharacterCreator({ user, editId, onLoginRequest }: { user: AppUser | null; editId?: string; onLoginRequest: () => void }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<LoungeCustomSheet>(emptySheet);
  const [template, setTemplate] = useState<RelationshipTemplateId>('warm');
  const [flirtation, setFlirtation] = useState(true);
  const [voice, setVoice] = useState<string>(loungeVoicePresets[0].id);
  const [theme, setTheme] = useState<string>(loungeCustomThemes[0].id);
  const [drafted, setDrafted] = useState(false);
  const [row, setRow] = useState<LoungeCustomCharacterRow | null>(null);
  const [candidate, setCandidate] = useState<{ path: string; url: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'save' | 'portrait' | 'choose' | 'upload' | 'chat' | 'submit' | null>(null);
  const [problems, setProblems] = useState<Array<{ field: string; message: string }>>([]);
  const [notice, setNotice] = useState<{ kind: 'error' | 'done'; text: string } | null>(null);
  const [loading, setLoading] = useState(Boolean(editId));

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    loadLoungeCustomCharacter(editId).then(found => {
      if (cancelled) return;
      if (!found || found.owner_id !== user?.id) { setNotice({ kind: 'error', text: '내가 만든 캐릭터만 고칠 수 있어요.' }); setLoading(false); return; }
      setRow(found); setSheet(normalizeLoungeCustomSheet(found.sheet)); setTemplate(found.template); setFlirtation(found.flirtation); setVoice(found.voice); setTheme(found.theme); setDrafted(true); setLoading(false);
    }).catch(err => { if (!cancelled) { setNotice({ kind: 'error', text: errorText(err) }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [editId, user?.id]);

  if (!user || user.isAnonymous) return <main className="lounge-join-gate"><Sparkles size={40} /><h1>나만의 캐릭터 만들기</h1><p>캐릭터는 회원만 만들 수 있어요.</p><button type="button" className="lounge-primary" onClick={onLoginRequest}>로그인하기</button></main>;
  if (loading) return <main className="lounge-join-gate"><LoaderCircle size={32} className="lounge-spin" /><h1>캐릭터를 불러오는 중…</h1></main>;

  const problemFor = (field: string) => problems.find(problem => problem.field === field || problem.field.startsWith(`${field}.`))?.message;
  const set = <K extends keyof LoungeCustomSheet>(key: K, value: LoungeCustomSheet[K]) => setSheet(previous => ({ ...previous, [key]: value }));
  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind); setNotice(null); setProblems([]);
    try { await task(); }
    catch (err) { setNotice({ kind: 'error', text: errorText(err) }); if (err instanceof LoungeCharacterError) setProblems(err.problems); }
    finally { setBusy(null); }
  };
  const draft = () => run('draft', async () => {
    const result = await draftLoungeCharacter({ name: sheet.name, age: sheet.age, gender: sheet.gender, job: sheet.job, concept: sheet.concept });
    setSheet(result.sheet); setDrafted(true);
    setNotice({ kind: 'done', text: 'AI가 소개, 성격, 취향을 썼어요. 내 캐릭터답게 고친 뒤 저장해 주세요.' });
  });
  const changeGender = (gender: LoungeCustomGender) => {
    set('gender', gender);
    if (gender !== 'other' && voiceGender[voice] !== gender) setVoice(loungeVoicePresets.find(preset => voiceGender[preset.id] === gender)!.id);
  };
  const save = () => run('save', async () => {
    const result = await saveLoungeCharacter({ ...(row ? { id: row.id } : {}), sheet, template, flirtation, voice, theme });
    setRow(result.character); registerLoungeCustomRow(result.character);
    setNotice({ kind: 'done', text: result.character.status === 'pending' ? '저장했어요. 공개 중이던 캐릭터라 바뀐 내용은 다시 검수를 거쳐요.' : '저장했어요. 이제 대표 사진을 정해 주세요.' });
  });
  const makePortrait = () => run('portrait', async () => { if (row) setCandidate(await makeLoungeCharacterPortrait(row.id)); });
  const choose = () => run('choose', async () => {
    if (!row || !candidate) return;
    const result = await chooseLoungeCharacterPortrait(row.id, candidate.path);
    setRow(result.character); registerLoungeCustomRow(result.character); setCandidate(null);
    setNotice({ kind: 'done', text: '대표 사진을 정했어요. 이 얼굴로 대화 중에 사진도 보낼 수 있어요.' });
  });
  const upload = (file: File) => run('upload', async () => {
    if (!row) return;
    const result = await uploadLoungeCharacterPortrait(row.id, await smallerImage(file));
    setRow(result.character); registerLoungeCustomRow(result.character); setCandidate(null);
    setNotice({ kind: 'done', text: '대표 사진으로 정했어요. 올린 사진으로는 대화 중 사진을 만들지 않아요.' });
  });
  const startChat = () => run('chat', async () => { if (row) navigate(`/lounge/${await startLoungeCustomChat(row.id, user.nickname)}`); });
  const submit = () => run('submit', async () => {
    if (!row) return;
    const status = await setLoungeCustomStatus(row.id, 'submit');
    setRow({ ...row, status: status as LoungeCustomCharacterRow['status'] });
    setNotice({ kind: 'done', text: '공개 신청했어요. 검수가 끝나면 다른 사람도 대화할 수 있어요.' });
  });
  const portraitUrl = row ? loungeCustomPortrait(row) : null;
  const rules = loungeCustomRules;

  return <main className="lounge-character lounge-creator">
    <nav className="lounge-character-nav"><Link to="/lounge" className="lounge-character-back"><ArrowLeft size={15} /> 사석</Link></nav>
    <header className="lounge-creator-head">
      <span className="lounge-character-eyebrow">나만의 캐릭터 · 한 사람당 {loungeCustomLimit}개</span>
      <h1>{editId ? `${row?.name ?? '캐릭터'} 고치기` : '캐릭터 만들기'}</h1>
      <p>네 가지만 적으면 돼요. 쓰기 어려우면 이름·나이·직업만 적고 AI에게 맡겨 보세요. 저장하면 검수를 거쳐 대화할 수 있어요.{row && <> 지금 상태: <b>{statusLabels[row.status]}</b>{row.status === 'rejected' && row.review_note && ` · ${row.review_note}`}</>}</p>
    </header>

    <section className="lounge-creator-step">
      <h2><span>1</span> 기본 정보</h2>
      <div className="lounge-creator-grid">
        <Field label="이름" hint={`${rules.name[1]}자 이내`} problem={problemFor('name')}><input value={sheet.name} maxLength={rules.name[1]} onChange={event => set('name', event.target.value)} placeholder="예: 한지안" /></Field>
        <Field label="나이" hint="20세 이상 성인" problem={problemFor('age')}><input type="number" min={20} max={80} value={sheet.age} onChange={event => set('age', Number(event.target.value))} /></Field>
        <Field label="성별" problem={problemFor('gender')}><select value={sheet.gender} onChange={event => changeGender(event.target.value as LoungeCustomGender)}><option value="female">여성</option><option value="male">남성</option><option value="other">밝히지 않음</option></select></Field>
        <Field label="직업" problem={problemFor('job')}><input value={sheet.job} maxLength={rules.job[1]} onChange={event => set('job', event.target.value)} placeholder="예: 새벽 라디오 PD" /></Field>
      </div>
      <div className="lounge-creator-ai">
        <Field label="AI에게 맡기기" hint="이름·나이·직업만 적고, 떠오르는 분위기가 있으면 한 줄 (선택)"><input value={sheet.concept} maxLength={rules.concept[1]} onChange={event => set('concept', event.target.value)} placeholder="예: 겉으로는 무심한데 남의 사연은 끝까지 들어 주는 사람" /></Field>
        <button type="button" className="lounge-character-secondary" onClick={() => void draft()} disabled={Boolean(busy)}>{busy === 'draft' ? <LoaderCircle size={16} className="lounge-spin" /> : <Wand2 size={16} />}{drafted ? 'AI로 다시 쓰기' : 'AI로 2~4번 쓰기'}</button>
      </div>
    </section>

    <section className="lounge-creator-step">
      <h2><span>2</span> 캐릭터 소개</h2>
      <Field label="어떤 사람인가요?" hint="하는 일, 자라 온 과정, 삶에서 중요했던 일" problem={problemFor('intro')}>
        <textarea rows={7} value={sheet.intro} maxLength={rules.intro[1]} onChange={event => set('intro', event.target.value)} placeholder="예: 대학 방송국에서 처음 마이크를 잡았고, 남의 이야기를 고르는 일이 좋아 PD가 됐다. 첫 생방송에서 사연을 잘못 읽어 청취자를 울린 뒤로, 한 줄도 끝까지 듣고 고른다." />
      </Field>
    </section>

    <section className="lounge-creator-step">
      <h2><span>3</span> 캐릭터 성격</h2>
      <Field label="어떤 성격과 말투인가요?" hint="가치관과 말투를 함께" problem={problemFor('personality')}>
        <textarea rows={5} value={sheet.personality} maxLength={rules.personality[1]} onChange={event => set('personality', event.target.value)} placeholder="예: 빈말을 싫어하고 끝까지 듣는다. 말은 짧고 차분한 존댓말이며, 가끔 마른 농담을 한다." />
      </Field>
    </section>

    <section className="lounge-creator-step">
      <h2><span>4</span> 취향</h2>
      <Field label="무엇을 좋아하고 싫어하나요?" hint="관심 분야, 좋아하는 것, 싫어하는 것" problem={problemFor('tastes')}>
        <textarea rows={5} value={sheet.tastes} maxLength={rules.tastes[1]} onChange={event => set('tastes', event.target.value)} placeholder={'관심 분야: 오래된 노래, 새벽 라디오\n좋아하는 것: 따뜻한 보리차, 비 오는 날\n싫어하는 것: 생색내기, 시끄러운 회식'} />
      </Field>
    </section>

    <section className="lounge-creator-step lounge-creator-more">
      <details>
        <summary>더 다듬기 <small>선택 · 비워 두면 AI가 채워요</small></summary>
        <Field label="한 줄 소개" hint={`${rules.tagline[0]}~${rules.tagline[1]}자`} problem={problemFor('tagline')}><input value={sheet.tagline} maxLength={rules.tagline[1]} onChange={event => set('tagline', event.target.value)} /></Field>
        <Field label="외모" hint="대표 사진과 대화 중 사진에 쓰여요" problem={problemFor('look')}><textarea rows={2} value={sheet.look} maxLength={rules.look[1]} onChange={event => set('look', event.target.value)} /></Field>
        <Field label="첫 인사" problem={problemFor('greeting')}><input value={sheet.greeting} maxLength={rules.greeting[1]} onChange={event => set('greeting', event.target.value)} /></Field>
        <h3>관계 유형</h3>
        <div className="lounge-creator-choices" role="radiogroup" aria-label="관계 유형">
          {relationshipTemplateIds.map(id => <button key={id} type="button" role="radio" aria-checked={template === id} onClick={() => setTemplate(id)}><strong>{relationshipTemplates[id].label}</strong><small>{relationshipTemplates[id].description}</small></button>)}
        </div>
        <label className="lounge-creator-check"><input type="checkbox" checked={flirtation} onChange={event => setFlirtation(event.target.checked)} /> 관계가 깊어지면 가벼운 플러팅을 허용해요 (노골적인 표현은 하지 않아요)</label>
        <div className="lounge-creator-grid">
          <Field label="목소리" hint="음성 대화에서 쓰여요">
            <span className="lounge-creator-voice"><select value={voice} onChange={event => setVoice(event.target.value)}>{loungeVoicePresets.filter(preset => sheet.gender === 'other' || voiceGender[preset.id] === sheet.gender).map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
              <button type="button" aria-label="목소리 미리 듣기" onClick={() => void new Audio(loungeVoicePresetSample(voice)).play().catch(() => {})}><Play size={14} /></button></span>
          </Field>
          <Field label="대화할 장소"><select value={theme} onChange={event => setTheme(event.target.value)}>{loungeCustomThemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </div>
      </details>
      <button type="button" className="lounge-character-cta" onClick={() => void save()} disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={16} className="lounge-spin" /> : <Check size={16} />}{busy === 'save' ? '검수하는 중…' : row ? '고친 내용 저장' : '저장하기'}</button>
    </section>

    {row && <section className="lounge-creator-step">
      <h2><span>3</span> 대표 사진</h2>
      <div className="lounge-creator-portrait">
        <figure>{candidate ? <img src={candidate.url} alt="새로 만든 대표 사진 후보" /> : portraitUrl ? <img src={portraitUrl} alt={`${row.name}의 대표 사진`} /> : <span><Camera size={28} />아직 사진이 없어요</span>}{candidate && <figcaption>후보</figcaption>}</figure>
        <div>
          <p className="lounge-character-lead">외모 설명으로 AI가 사진을 만들어요(하루 10장). 이 얼굴로 대화 중에 사진도 보낼 수 있어요.</p>
          <div className="lounge-character-actions">
            <button type="button" className="lounge-character-secondary" onClick={() => void makePortrait()} disabled={Boolean(busy)}>{busy === 'portrait' ? <LoaderCircle size={15} className="lounge-spin" /> : <Wand2 size={15} />}{candidate || portraitUrl ? '다시 만들기' : 'AI로 만들기'}</button>
            {candidate && <button type="button" className="lounge-character-cta" onClick={() => void choose()} disabled={Boolean(busy)}>{busy === 'choose' ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}이 사진으로 정하기</button>}
          </div>
          <div className="lounge-creator-upload">
            <label className="lounge-creator-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> 직접 만들었거나 쓸 권리가 있는 이미지이고, 실존 인물을 흉내 내지 않아요. 올린 사진은 프로필에만 쓰이고 대화 중 사진은 만들어지지 않아요.</label>
            <label className={`lounge-character-secondary ${!consent || busy ? 'disabled' : ''}`}>{busy === 'upload' ? <LoaderCircle size={15} className="lounge-spin" /> : <Upload size={15} />}내 이미지 올리기
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!consent || Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} /></label>
          </div>
        </div>
      </div>
    </section>}

    {row?.portrait_path && <section className="lounge-creator-step">
      <h2><span>4</span> 대화하기</h2>
      <div className="lounge-character-actions">
        <button type="button" className="lounge-character-cta" onClick={() => void startChat()} disabled={Boolean(busy)}>{busy === 'chat' ? <LoaderCircle size={16} className="lounge-spin" /> : <MessageCircle size={16} />}{koreanWith(row.name)} 대화 시작</button>
        {(row.status === 'private' || row.status === 'rejected') && <button type="button" className="lounge-character-secondary" onClick={() => void submit()} disabled={Boolean(busy)}><Send size={15} />공개 신청</button>}
        <Link className="lounge-character-secondary" to={`/lounge/characters/${row.id}`}>캐릭터 페이지</Link>
      </div>
    </section>}

    {notice && <p className={`lounge-creator-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
  </main>;
}
