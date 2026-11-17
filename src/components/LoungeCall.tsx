import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, LoaderCircle, PhoneOff } from 'lucide-react';
import type { LoungeHostId } from '../lib/lounge';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import { useScreenWakeLock } from '../lib/useScreenWakeLock';
import { loungeCallAllowanceText } from '../lib/loungePlans';
import type { LoungeCallUsage } from '../lib/loungeApi';
import './LoungeCall.css';
import { startCallKeepAlive, stopCallKeepAlive } from '../lib/appCall';

export type LoungeCallProps = {
  hostId: LoungeHostId; name: string; job?: string; place: string;
  /** The time left today or in the room, as the room shows it. */
  remaining: string;
  /** This month's time in calls as the server counted it, and when ("이번 달 통화 12분 34초 / 60분"); the screen adds the seconds since. */
  usage?: (LoungeCallUsage & { at: number }) | null;
  /** The call was just placed and the character has not picked up: nothing of the call's own state (mute) shows yet. */
  ringing?: boolean;
  preview?: boolean; lobby: boolean; connecting?: boolean; connected: boolean; audioReady?: boolean; starting?: boolean; needsConnection: boolean;
  micOn: boolean; micDisabled: boolean; hostSpeaking: boolean; userSpeaking: boolean; pending: boolean; replyDelayed: boolean;
  topicDisabled: boolean; chatDisabled?: boolean; chatBusy?: boolean;
  /** The model and voice pickers, shown small above the call buttons. */
  options?: ReactNode;
  notice?: ReactNode; error?: string;
  onConnect: () => void; onMic: () => void; onTopic: () => void; onChat?: () => void; onHangUp: () => void;
};

const clock = (ms: number) => { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };

/**
 * A one-to-one voice conversation as a phone call: the character's portrait and name, how the call is going, and the
 * call buttons. Nothing of what is said is written on the screen; the conversation is kept and can be read in the chat.
 */
export function LoungeCall(props: LoungeCallProps) {
  // In the app the call goes on with the screen off: a foreground service runs while this screen is open (appCall.ts).
  useEffect(() => {
    if (props.preview) return;
    void startCallKeepAlive();
    return () => { void stopCallKeepAlive(); };
  }, [props.preview]);
  // A call keeps the screen on, as a phone call does: a screen turning off stopped the page and dropped the call.
  useScreenWakeLock(!props.preview);
  const live = !props.preview && !props.lobby && !props.needsConnection;
  // The call time counts from the moment the character answers, as on a phone (not while it is ringing).
  const startedAt = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const answered = live && !props.ringing;
  if ((answered || props.preview) && startedAt.current === null) startedAt.current = Date.now();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // 소리 켜기 shows only when a tap is really needed: the line is down, or the sound has stayed blocked for a few seconds
  // (the page keeps trying by itself before that, and the status line says what is going on).
  const [soundBlockedLong, setSoundBlockedLong] = useState(false);
  const soundBlocked = props.needsConnection && props.connected && !props.audioReady && !props.connecting;
  useEffect(() => {
    if (!soundBlocked) { setSoundBlockedLong(false); return; }
    const timer = window.setTimeout(() => setSoundBlockedLong(true), 6000);
    return () => window.clearTimeout(timer);
  }, [soundBlocked]);
  const showConnect = props.needsConnection && !props.connecting && !props.starting && (!props.connected || soundBlockedLong || (props.connected && props.audioReady));
  const status = props.ringing && !props.preview ? '음성모드 연결중…'
    : props.connecting ? '음성모드 연결중…'
    : props.needsConnection ? !props.connected ? '연결이 끊겼어요' : !props.audioReady ? (soundBlockedLong ? '소리를 켜면 통화가 시작돼요' : '음성모드 연결중…') : props.lobby ? '음성모드 연결중…' : '통화가 잠시 멈췄어요'
    : props.lobby ? '음성모드 연결중…'
    : props.hostSpeaking ? '말하는 중'
    : props.userSpeaking ? '듣고 있어요'
    // A slow reply looks like any wait ("…"): the page keeps trying by itself, so there is nothing to say about it.
    : props.pending || props.replyDelayed ? '…'
    : '';
  const connectLabel = props.connecting ? '음성모드 연결중…' : !props.connected ? '다시 연결' : !props.audioReady ? '소리 켜기' : props.starting ? '준비 중…' : '통화 이어가기';
  return <section className={`lounge-call-screen ${props.hostSpeaking ? 'host-speaking' : ''} ${props.userSpeaking ? 'user-speaking' : ''}`} aria-label={`${props.name}와 통화`}>
    <div className="lounge-call-backdrop" aria-hidden="true"><span /></div>
    <header className="lounge-call-top">
      <span className="lounge-call-place">{props.preview ? '통화 미리보기' : props.place}</span>
      <span className="lounge-call-remaining">{props.remaining}</span>
    </header>
    {props.usage && <p className="lounge-call-allowance">{loungeCallAllowanceText(props.usage, answered ? Math.min(60, Math.max(0, Math.floor((now - props.usage.at) / 1000))) : 0)}</p>}
    {props.notice}
    <div className="lounge-call-person">
      <div className="lounge-call-portrait"><span className="lounge-call-ring" aria-hidden="true" /><span className="lounge-call-ring second" aria-hidden="true" /><LoungeHostPortrait hostId={props.hostId} /></div>
      <h1>{props.name}</h1>
      {props.job && <p className="lounge-call-job">{props.job}</p>}
      <p className="lounge-call-time">{startedAt.current !== null && !props.lobby ? clock(now - startedAt.current) : ' '}</p>
      <p className="lounge-call-status" role="status" aria-live="polite">{status || ' '}</p>
      {showConnect && <button type="button" className="lounge-call-connect" onClick={props.onConnect} disabled={props.connecting || (props.connected && props.audioReady && props.starting)}>{props.connecting || props.starting ? <LoaderCircle size={16} className="lounge-spin" /> : <Headphones size={16} />}{connectLabel}</button>}
    </div>
    <div className="lounge-call-dock">
      {props.error && <p className="lounge-call-error" role="alert">{props.error}</p>}
      {props.options && <div className="lounge-room-controls lounge-call-options">{props.options}</div>}
      <button type="button" className="lounge-call-hangup" onClick={props.onHangUp} aria-label="통화 종료"><PhoneOff size={28} /></button>
    </div>
  </section>;
}
