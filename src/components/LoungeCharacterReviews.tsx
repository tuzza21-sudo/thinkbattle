import { useEffect, useState } from 'react';
import { Check, CircleCheck, UserRoundCheck, X } from 'lucide-react';
import { listLoungeCharacterReviews, reviewLoungeCharacter, type LoungeCharacterReview } from '../lib/superAdmin';
import { loungeCustomPortrait } from '../lib/loungeCustomClient';
import { normalizeLoungeCustomSheet } from '../lib/loungeCustomCharacters';
import { relationshipTemplates, type RelationshipTemplateId } from '../lib/relationship/templates';

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';

// Member characters that asked to be public: the whole sheet and portrait, then approve or send back with a reason.
export const LoungeCharacterReviews = () => {
  const [items, setItems] = useState<LoungeCharacterReview[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    listLoungeCharacterReviews().then(list => { if (!cancelled) setItems(list); }).catch(reason => { if (!cancelled) setNotice({ type: 'error', message: errorText(reason) }); });
    return () => { cancelled = true; };
  }, []);
  const decide = async (item: LoungeCharacterReview, approve: boolean) => {
    if (!approve && !notes[item.id]?.trim()) { setNotice({ type: 'error', message: '반려할 때는 회원에게 보여 줄 이유를 적어 주세요.' }); return; }
    setBusy(item.id); setNotice(null);
    try {
      await reviewLoungeCharacter(item.id, approve, notes[item.id] ?? '');
      setItems(list => list?.filter(entry => entry.id !== item.id) ?? null);
      setNotice({ type: 'success', message: `${item.name}을(를) ${approve ? '공개했습니다' : '반려했습니다'}.` });
    } catch (reason) { setNotice({ type: 'error', message: errorText(reason) }); }
    finally { setBusy(null); }
  };
  return <section className="card admin-panel">
    <div className="super-admin-section-heading"><div><span className="admin-eyebrow">CHARACTER REVIEW</span><h2><UserRoundCheck size={20} style={{ verticalAlign: 'middle' }} /> 사용자 캐릭터 공개 검수</h2></div></div>
    <p className="admin-lead">회원이 공개를 신청한 캐릭터입니다. 저장할 때 AI 검수를 이미 통과했지만, 공개 전에 미성년·실존 인물·노골적 설정이 없는지와 대화 상대로서의 완성도를 확인해 주세요.</p>
    {notice && <div className={`super-admin-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.type === 'success' && <CircleCheck size={18} />}{notice.message}</div>}
    {!items ? <p className="admin-lead">불러오는 중입니다.</p> : !items.length ? <p className="admin-lead">기다리는 캐릭터가 없습니다.</p>
      : items.map(item => {
        const portrait = loungeCustomPortrait({ portrait_path: item.portraitPath });
        const sheet = normalizeLoungeCustomSheet(item.sheet);
        return <article key={item.id} className="super-admin-form-card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: '1rem' }}>
            {portrait ? <img src={portrait} alt="" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', borderRadius: 12 }} /> : <div />}
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <strong style={{ fontSize: 16 }}>{item.name}</strong> · {sheet.age}세 · {sheet.job} · 만든 사람 {item.owner ?? '알 수 없음'}
              <p>{sheet.tagline}</p>
              <p>관계: {relationshipTemplates[item.template as RelationshipTemplateId]?.label ?? item.template} · 플러팅 {item.flirtation ? '허용' : '안 함'} · 사진 {item.portraitSource === 'upload' ? '직접 올림' : 'AI 생성'}</p>
              <details><summary>전체 설정 보기</summary>
                <p><b>소개</b> {sheet.intro}</p>
                <p><b>성격과 말투</b> {sheet.personality}</p>
                <p><b>취향</b> {sheet.tastes}</p>
                <p><b>외모</b> {sheet.look}</p><p><b>첫 인사</b> {sheet.greeting}</p>
              </details>
            </div>
          </div>
          <label className="admin-label" htmlFor={`review-${item.id}`}>반려 이유 (회원에게 보여요)</label>
          <input id={`review-${item.id}`} className="input-field" maxLength={300} value={notes[item.id] ?? ''} onChange={event => setNotes(previous => ({ ...previous, [item.id]: event.target.value }))} />
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button type="button" className="btn btn-primary" disabled={busy === item.id} onClick={() => void decide(item, true)}><Check size={16} /> 공개</button>
            <button type="button" className="btn btn-secondary" disabled={busy === item.id} onClick={() => void decide(item, false)}><X size={16} /> 반려</button>
          </div>
        </article>;
      })}
  </section>;
};
