import { useState } from 'react';
import { LoaderCircle, RefreshCw, Square, Undo2, Volume2 } from 'lucide-react';
import { loungeMessageVoiceUsageText } from '../lib/loungeMessageActions';
import type { LoungeMessageVoiceUsage } from '../lib/loungeApi';

export type LoungeMessageActionKind = 'regenerate' | 'voice' | 'rewind';

/**
 * What a tapped message of a one-to-one chat offers, under the bubble: 다시 쓰기 (the character's last reply), 음성으로 듣기 (a reply
 * of the character) and 되감기 (one of the last ten messages; asked once more before anything is removed).
 */
export function LoungeMessageActions({ name, own, regenerate, voice, rewind, busy, locked, playing, usage, note, onAction }: {
  /** The character's name, for the question before going back. */
  name: string;
  /** The member's own message (shown on the right). */
  own: boolean;
  regenerate: boolean; voice: boolean; rewind: boolean;
  /** The action under way, if any. */
  busy: LoungeMessageActionKind | null;
  /** A reply is on its way: the chat cannot be written again or gone back now. */
  locked: boolean;
  /** This message's voice is playing. */
  playing: boolean;
  usage?: LoungeMessageVoiceUsage | null;
  /** A line under the buttons: what failed. */
  note?: string;
  onAction: (kind: LoungeMessageActionKind | 'stop') => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const waiting = busy !== null;
  const usageText = voice ? loungeMessageVoiceUsageText(usage) : '';
  if (confirming) return <div className={`lounge-message-actions ${own ? 'own' : ''}`} role="group" aria-label="되감기 확인">
    <p className="lounge-message-actions-note">이 메시지부터 그 뒤의 대화가 지워지고, {name}도 그 대화를 기억하지 않아요.</p>
    <button type="button" className="danger" disabled={waiting || locked} onClick={() => onAction('rewind')}>{busy === 'rewind' ? <LoaderCircle size={14} className="lounge-spin" /> : <Undo2 size={14} />}되감기</button>
    <button type="button" disabled={waiting} onClick={() => setConfirming(false)}>취소</button>
    {note && <p className="lounge-message-actions-note" role="alert">{note}</p>}
  </div>;
  return <div className={`lounge-message-actions ${own ? 'own' : ''}`} role="group" aria-label="메시지 메뉴">
    {regenerate && <button type="button" disabled={waiting || locked} onClick={() => onAction('regenerate')}>{busy === 'regenerate' ? <LoaderCircle size={14} className="lounge-spin" /> : <RefreshCw size={14} />}다시 쓰기</button>}
    {voice && (playing
      ? <button type="button" onClick={() => onAction('stop')}><Square size={13} />멈추기</button>
      : <button type="button" disabled={waiting} onClick={() => onAction('voice')}>{busy === 'voice' ? <LoaderCircle size={14} className="lounge-spin" /> : <Volume2 size={14} />}음성으로 듣기</button>)}
    {rewind && <button type="button" disabled={waiting || locked} onClick={() => setConfirming(true)}><Undo2 size={14} />여기서 되감기</button>}
    {(note || usageText) && <p className="lounge-message-actions-note" role={note ? 'alert' : undefined}>{note || usageText}</p>}
  </div>;
}
