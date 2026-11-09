import { useEffect, useState } from 'react';
import { Bell, BellOff, LoaderCircle } from 'lucide-react';
import { pushState, turnOffPush, turnOnPush, type PushState } from '../lib/appPush';
import { isSaseokApp } from '../lib/nativeApp';
import { getLoungeReachOut, loungeAuthorizedFetch, setLoungeReachOut } from '../lib/loungeApi';

/** 계정 관리 › 알림 (the Android app only): turn the phone's notifications on or off, and send a test one. */
export function LoungeAppNotifications() {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reachOut, setReachOut] = useState<boolean | null>(null);
  useEffect(() => { if (isSaseokApp()) void pushState().then(setState, () => setState('off')); }, []);
  useEffect(() => { if (state === 'on') void getLoungeReachOut().then(setReachOut, () => setReachOut(null)); }, [state]);
  const toggleReachOut = async (next: boolean) => {
    setReachOut(next); setNote('');
    try { await setLoungeReachOut(next); }
    catch (failure) { setReachOut(!next); setNote(failure instanceof Error ? failure.message : '설정을 바꾸지 못했어요.'); }
  };
  if (!isSaseokApp() || state === 'unsupported') return null;

  const run = async (action: () => Promise<PushState>) => {
    setBusy(true); setNote('');
    try { setState(await action()); }
    catch (failure) { setNote(failure instanceof Error ? failure.message : '알림을 바꾸지 못했어요.'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setNote('');
    try {
      const response = await loungeAuthorizedFetch('/api/push?action=test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, '알림 서버');
      const body = await response.json().catch(() => ({})) as { error?: string };
      setNote(response.ok ? '테스트 알림을 보냈어요. 잠시 뒤 알림이 오는지 확인해 주세요.' : body.error || '알림을 보내지 못했어요.');
    } catch (failure) { setNote(failure instanceof Error ? failure.message : '알림을 보내지 못했어요.'); }
    finally { setBusy(false); }
  };

  return <div className="lounge-app-notifications">
    {state === 'blocked' ? <p className="lounge-persona-note"><BellOff size={13} /> 이 기기에서 알림이 꺼져 있어요. 휴대폰 설정 → 앱 → 사석에서 → 알림에서 켜 주세요.</p>
      : state === 'on' ? <>
        <p className="lounge-persona-note"><Bell size={13} /> 이 기기로 알림을 받고 있어요.</p>
        {reachOut !== null && <label className="lounge-app-notifications-switch"><input type="checkbox" checked={reachOut} onChange={event => void toggleReachOut(event.target.checked)} /> 캐릭터가 먼저 말을 걸어도 좋아요 <small>하루에 한 번까지, 낮 시간에만 와요.</small></label>}
        <div className="lounge-app-notifications-row">
          <button type="button" className="btn lounge-persona-open" disabled={busy} onClick={() => void test()}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : <Bell size={15} />}테스트 알림 받기</button>
          <button type="button" className="btn lounge-subscription-back" disabled={busy} onClick={() => void run(turnOffPush)}>알림 끄기</button>
        </div>
      </> : <>
        <p className="lounge-persona-note">알림을 켜면 캐릭터의 소식을 앱이 닫혀 있어도 받을 수 있어요.</p>
        <button type="button" className="btn lounge-persona-open" disabled={busy} onClick={() => void run(turnOnPush)}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : <Bell size={15} />}알림 켜기</button>
      </>}
    {note && <p className="lounge-persona-note" role="status">{note}</p>}
  </div>;
}
