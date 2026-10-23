import { useEffect, useState, type FormEvent } from 'react';
import { Camera, CircleCheck } from 'lucide-react';
import { getLoungeImageSettings, setLoungeImageSettings, type LoungeImageSettings } from '../lib/superAdmin';

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';

// Character photos: turn them on or off and set how many one member may receive a day (each costs an image generation).
export const LoungeImageLimits = () => {
  const [data, setData] = useState<LoungeImageSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [daily, setDaily] = useState('5');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const apply = (next: LoungeImageSettings) => { setData(next); setEnabled(next.enabled); setDaily(String(next.daily)); };
  useEffect(() => {
    let cancelled = false;
    getLoungeImageSettings().then(next => { if (!cancelled) apply(next); }).catch(reason => { if (!cancelled) setNotice({ type: 'error', message: errorText(reason) }); });
    return () => { cancelled = true; };
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try { await setLoungeImageSettings(enabled, Number(daily)); apply(await getLoungeImageSettings()); setNotice({ type: 'success', message: '사진 설정을 저장했습니다. 바로 적용됩니다.' }); }
    catch (reason) { setNotice({ type: 'error', message: errorText(reason) }); }
    finally { setBusy(false); }
  };
  return <section className="card admin-panel">
    <div className="super-admin-section-heading"><div><span className="admin-eyebrow">CHARACTER PHOTOS</span><h2><Camera size={20} style={{ verticalAlign: 'middle' }} /> 캐릭터 사진</h2></div></div>
    <p className="admin-lead">1:1 채팅에서 캐릭터가 보내는 사진입니다. 회원이 요청하거나 캐릭터가 먼저 보낸 사진을 합쳐 하루 장수를 셉니다(먼저 보내는 사진은 하루 2장까지). 캐릭터별 일상 사진은 하루 한 번 자동으로 공개 갤러리에 올라갑니다.{data ? ` 오늘 만든 사진: ${data.today}장.` : ''}</p>
    {notice && <div className={`super-admin-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.type === 'success' && <CircleCheck size={18} />}{notice.message}</div>}
    <form className="super-admin-form-card" onSubmit={event => void save(event)}>
      <label className="admin-label" htmlFor="image-daily">회원 한 명당 하루 사진 (장)</label>
      <input id="image-daily" className="input-field" type="number" min={0} max={100} value={daily} onChange={event => setDaily(event.target.value)} required />
      <label className="admin-label" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> 사진 기능 사용
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy || !data}>저장</button>
    </form>
  </section>;
};
