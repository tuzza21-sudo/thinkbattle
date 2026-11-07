import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { listLoungeUsage, type LoungeUsageMember } from '../lib/superAdmin';
import { loungeCallDuration, loungeCallMinutes, loungeFreeCallMinutesDefault } from '../lib/loungePlans';

const planLabel = { plus: 'Plus', pro: 'Pro' } as const;
const number = (value: number) => value.toLocaleString('ko-KR');
const monthStart = (back: number) => {
  const now = new Date(Date.now() + 9 * 3600_000);
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return date.toISOString().slice(0, 10);
};

// Every member's month in the lounge: minutes in voice calls next to the premium-voice credits (one per character
// spoken in ElevenLabs or Typecast), with the plan and what it allows. A month at a time (this one or the one before).
export const LoungeAdminUsage = () => {
  const [back, setBack] = useState(0);
  const [query, setQuery] = useState('');
  // The answer for one month; while another month is asked for, the list shows as loading.
  const [loaded, setLoaded] = useState<{ back: number; month: string; members: LoungeUsageMember[]; error: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    listLoungeUsage(monthStart(back))
      .then(result => { if (!cancelled) setLoaded({ back, month: result.month, members: result.members, error: '' }); })
      .catch(reason => { if (!cancelled) setLoaded({ back, month: '', members: [], error: reason instanceof Error ? reason.message : '이용량을 불러오지 못했습니다.' }); });
    return () => { cancelled = true; };
  }, [back]);
  const current = loaded?.back === back ? loaded : null;
  const members = current && !current.error ? current.members : null, month = current?.month ?? '', error = current?.error ?? '';
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (members ?? []).filter(member => !text || `${member.nickname ?? ''} ${member.email ?? ''}`.toLowerCase().includes(text));
  }, [members, query]);
  const total = useMemo(() => (members ?? []).reduce((sum, member) => ({ seconds: sum.seconds + member.seconds, credits: sum.credits + member.credits }), { seconds: 0, credits: 0 }), [members]);
  return <section className="card admin-panel">
    <div className="super-admin-section-heading">
      <div><span className="admin-eyebrow">LOUNGE USAGE</span><h2><Clock size={20} style={{ verticalAlign: 'middle' }} /> 회원 음성 이용량</h2></div>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <input className="input-field super-admin-search" placeholder="닉네임 · 이메일 검색" value={query} onChange={event => setQuery(event.target.value)} />
        <select className="input-field" value={back} onChange={event => setBack(Number(event.target.value))} aria-label="조회할 달"><option value={0}>이번 달</option><option value={1}>지난달</option></select>
      </div>
    </div>
    <p className="admin-lead">
      통화는 연결된 시간을 서버가 30초마다 세어 분으로 보여 주고, 크레딧은 프리미엄 목소리(ElevenLabs·Typecast)로 말한 글자 수입니다(한 글자에 1크레딧).
      한도는 Plus {loungeCallMinutes.plus}분, Pro {loungeCallMinutes.pro}분, 이용권이 없으면 {loungeFreeCallMinutesDefault}분(설정으로 바꿀 수 있음)이며, 서버에서 LOUNGE_CALL_LIMITS=on일 때만 적용됩니다.
    </p>
    {error && <div className="super-admin-notice error" role="alert">{error}</div>}
    {members && <p className="admin-lead"><b>{month.slice(0, 7)}</b> · 이용 회원 {number(members.length)}명 · 통화 합계 <b>{loungeCallDuration(total.seconds)}</b> · 크레딧 합계 <b>{number(total.credits)}</b></p>}
    <div className="super-admin-table-wrap">
      <table className="super-admin-table">
        <thead><tr>{['닉네임', '이메일', '요금제', '통화(분·초)', '한도(분)', '크레딧'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{shown.map(member => {
          const limit = member.plan ? loungeCallMinutes[member.plan] : loungeFreeCallMinutesDefault;
          return <tr key={member.user_id}>
            <td>{member.nickname || '—'}</td><td>{member.email || '—'}</td>
            <td>{member.plan ? planLabel[member.plan] : '무료'}</td>
            <td style={{ fontVariantNumeric: 'tabular-nums', ...(member.seconds >= limit * 60 ? { color: '#c0392b', fontWeight: 700 } : {}) }}>{loungeCallDuration(member.seconds)}</td>
            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{limit}</td>
            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{number(member.credits)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {members && !shown.length && <p className="super-admin-list-empty">{members.length ? '조건에 맞는 회원이 없습니다.' : '이 달에 통화나 프리미엄 목소리를 쓴 회원이 없습니다.'}</p>}
    {!members && !error && <p className="super-admin-loading">이용량을 불러오는 중입니다.</p>}
  </section>;
};
