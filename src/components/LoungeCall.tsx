import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, LoaderCircle, MessageCircle, Mic, MicOff, PhoneOff, Sparkles } from 'lucide-react';
import type { LoungeHostId } from '../lib/lounge';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import './LoungeCall.css';

export type LoungeCallProps = {
  hostId: LoungeHostId; name: string; job?: string; place: string;
  /** The time left today or in the room, as the room shows it. */
  remaining: string;
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
  const live = !props.preview && !props.lobby && !props.needsConnection;
  // The call time counts from the moment the call is connected, as on a phone.
  const startedAt = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  if ((live || props.preview) && startedAt.current === null) startedAt.current = Date.now();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const status = props.connecting ? '연결 중…'
    : props.needsConnection ? !props.connected ? '연결이 끊겼어요' : !props.audioReady ? '소리를 켜면 통화가 시작돼요' : props.lobby ? '전화 거는 중…' : '통화가 잠시 멈췄어요'
    : props.lobby ? '전화 거는 중…'
    : props.hostSpeaking ? '말하는 중'
    : props.userSpeaking ? '듣고 있어요'
    : props.replyDelayed ? '연결이 잠시 느려요'
    : props.pending ? '…'
    : !props.micOn && !props.preview ? '음소거 중이에요'
    : '';
  const connectLabel = props.connecting ? '연결 중…' : !props.connected ? '다시 연결' : !props.audioReady ? '소리 켜기' : props.starting ? '준비 중…' : '통화 이어가기';
  return <section className={`lounge-call-screen ${props.hostSpeaking ? 'host-speaking' : ''} ${props.userSpeaking ? 'user-speaking' : ''}`} aria-label={`${props.name}와 통화`}>
    <div className="lounge-call-backdrop" aria-hidden="true"><span /></div>
    <header className="lounge-call-top">
      <span className="lounge-call-place">{props.preview ? '통화 미리보기' : props.place}</span>
      <span className="lounge-call-remaining">{props.remaining}</span>
    </header>
    {props.notice}
    <div className="lounge-call-person">
      <div className="lounge-call-portrait"><span className="lounge-call-ring" aria-hidden="true" /><span className="lounge-call-ring second" aria-hidden="true" /><LoungeHostPortrait hostId={props.hostId} /></div>
      <h1>{props.name}</h1>
      {props.job && <p className="lounge-call-job">{props.job}</p>}
      <p className="lounge-call-time">{startedAt.current !== null && !props.lobby ? clock(now - startedAt.current) : ' '}</p>
      <p className="lounge-call-status" role="status" aria-live="polite">{status || ' '}</p>
      {props.needsConnection && <button type="button" className="lounge-call-connect" onClick={props.onConnect} disabled={props.connecting || (props.connected && props.audioReady && props.starting)}>{props.connecting || props.starting ? <LoaderCircle size={16} className="lounge-spin" /> : <Headphones size={16} />}{connectLabel}</button>}
    </div>
    <div className="lounge-call-dock">
      {props.error && <p className="lounge-call-error" role="alert">{props.error}</p>}
      {props.options && <div className="lounge-room-controls lounge-call-options">{props.options}</div>}
      <div className="lounge-call-buttons">
        <button type="button" className={`lounge-call-button ${props.micOn ? '' : 'muted'}`} onClick={props.onMic} disabled={props.micDisabled} aria-pressed={!props.micOn}>
          <span>{props.micOn ? <Mic size={24} /> : <MicOff size={24} />}</span>{props.micOn ? '음소거' : '음소거 해제'}
        </button>
        <button type="button" className="lounge-call-button" onClick={props.onTopic} disabled={props.topicDisabled}><span><Sparkles size={24} /></span>화제 던지기</button>
        {props.onChat && <button type="button" className="lounge-call-button" onClick={props.onChat} disabled={props.chatDisabled}><span>{props.chatBusy ? <LoaderCircle size={24} className="lounge-spin" /> : <MessageCircle size={24} />}</span>채팅으로</button>}
      </div>
      <button type="button" className="lounge-call-hangup" onClick={props.onHangUp} aria-label="통화 종료"><PhoneOff size={28} /></button>
    </div>
  </section>;
}
