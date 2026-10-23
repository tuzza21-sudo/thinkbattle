import { useEffect, useState, type FormEvent } from 'react';
import { CircleCheck, Timer, UserPlus } from 'lucide-react';
import { addLoungeBetaTester, getLoungeBetaOverview, removeLoungeBetaTester, setLoungeBetaLimits, type LoungeBetaOverview } from '../lib/superAdmin';

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
const minutes = (seconds: number) => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;

// Beta usage limits for the lounge: daily minutes for new members, and the testers who are not limited.
export const LoungeBetaLimits = () => {
  const [data, setData] = useState<LoungeBetaOverview | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [solo, setSolo] = useState('8');
  const [group, setGroup] = useState('15');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const apply = (next: LoungeBetaOverview) => {
    setData(next);
    setEnabled(next.settings.enabled);
    setSolo(String(next.settings.soloMinutes));
    setGroup(String(next.settings.groupMinutes));
  };

  useEffect(() => {
    let cancelled = false;
    getLoungeBetaOverview()
      .then(next => { if (!cancelled) apply(next); })
      .catch(reason => { if (!cancelled) setNotice({ type: 'error', message: errorText(reason) }); });
    return () => { cancelled = true; };
  }, []);

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true); setNotice(null);
    try { await work(); apply(await getLoungeBetaOverview()); setNotice({ type: 'success', message: done }); }
    catch (reason) { setNotice({ type: 'error', message: errorText(reason) }); }
    finally { setBusy(false); }
  };

  const saveLimits = (event: FormEvent) => {
    event.preventDefault();
    void run(() => setLoungeBetaLimits(enabled, Number(solo), Number(group)), '이용 제한을 저장했습니다. 바로 적용됩니다.');
  };

  const addTester = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    void run(async () => { await addLoungeBetaTester(email, note); setEmail(''); setNote(''); }, '베타테스터로 지정했습니다. 이용 시간 제한을 받지 않습니다.');
  };

  return (
    <section className="card admin-panel">
      <div className="super-admin-section-heading">
        <div>
          <span className="admin-eyebrow">BETA LIMITS</span>
          <h2><Timer size={20} style={{ verticalAlign: 'middle' }} /> 사석 베타 이용 제한</h2>
        </div>
      </div>
      <p className="admin-lead">
        {data
          ? `${new Date(data.settings.appliesFrom).toLocaleString('ko-KR')} 이후 가입한 회원(게스트 포함)에게만 적용됩니다. 그 전에 가입한 회원, 아래 베타테스터, 슈퍼 관리자는 제한이 없습니다. 하루는 한국 시간 자정에 초기화됩니다.`
          : '설정을 불러오는 중입니다.'}
      </p>
      {notice && (
        <div className={`super-admin-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.type === 'success' && <CircleCheck size={18} />}{notice.message}
        </div>
      )}

      <div className="super-admin-form-grid">
        <form className="super-admin-form-card" onSubmit={saveLimits}>
          <div className="super-admin-form-title"><Timer size={20} /><strong>하루 이용 시간</strong></div>
          <label className="admin-label" htmlFor="beta-solo">캐릭터 1:1 음성 대화 (분 · 채팅은 제한 없음)</label>
          <input id="beta-solo" className="input-field" type="number" min={1} max={1440} value={solo} onChange={event => setSolo(event.target.value)} required />
          <label className="admin-label" htmlFor="beta-group">함께하는 대화방 (분)</label>
          <input id="beta-group" className="input-field" type="number" min={1} max={1440} value={group} onChange={event => setGroup(event.target.value)} required />
          <label className="admin-label" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> 제한 사용
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || !data}>저장</button>
        </form>

        <form className="super-admin-form-card" onSubmit={addTester}>
          <div className="super-admin-form-title"><UserPlus size={20} /><strong>베타테스터 추가</strong></div>
          <label className="admin-label" htmlFor="beta-tester-email">가입한 이메일</label>
          <input id="beta-tester-email" className="input-field" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="tester@example.com" required />
          <label className="admin-label" htmlFor="beta-tester-note">메모 (선택)</label>
          <input id="beta-tester-note" className="input-field" value={note} onChange={event => setNote(event.target.value)} maxLength={80} placeholder="예: 협력 크리에이터" />
          <button className="btn btn-secondary" type="submit" disabled={busy || !data || !email.trim()}>테스터로 지정</button>
        </form>
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>베타테스터 ({data?.testers.length ?? 0})</h3>
      <div className="super-admin-table-wrap">
        <table className="super-admin-table">
          <thead><tr>{['닉네임', '이메일', '메모', '지정일', ''].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{(data?.testers ?? []).map(tester => (
            <tr key={tester.userId}>
              <td>{tester.nickname ?? '—'}</td><td>{tester.email ?? '—'}</td><td>{tester.note || '—'}</td>
              <td>{new Date(tester.addedAt).toLocaleDateString('ko-KR')}</td>
              <td><button className="btn btn-secondary" style={{ padding: '.4rem .6rem' }} disabled={busy}
                onClick={() => { if (window.confirm(`${tester.nickname ?? tester.email}님을 베타테스터에서 뺄까요? 이후 가입한 회원이면 제한을 받습니다.`)) void run(() => removeLoungeBetaTester(tester.userId), '베타테스터에서 뺐습니다.'); }}>해제</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {data && !data.testers.length && <p className="super-admin-list-empty">지정된 베타테스터가 없습니다.</p>}

      <h3 style={{ marginTop: '1.5rem' }}>오늘 제한 대상 회원의 이용 시간</h3>
      <div className="super-admin-table-wrap">
        <table className="super-admin-table">
          <thead><tr>{['닉네임', '이메일', '1:1 음성', '함께하는 대화방'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{(data?.today ?? []).map(row => (
            <tr key={row.userId}>
              <td>{row.nickname ?? '게스트'}</td><td>{row.email ?? '—'}</td>
              <td>{minutes(row.soloSeconds)}{data && row.soloSeconds >= data.settings.soloMinutes * 60 ? ' · 소진' : ''}</td>
              <td>{minutes(row.groupSeconds)}{data && row.groupSeconds >= data.settings.groupMinutes * 60 ? ' · 소진' : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {data && !data.today.length && <p className="super-admin-list-empty">오늘 이용 기록이 없습니다.</p>}
    </section>
  );
};
