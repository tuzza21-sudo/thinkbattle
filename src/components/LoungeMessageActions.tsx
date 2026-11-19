import { useState } from 'react';
import { LoaderCircle, RefreshCw, Square, Undo2, Volume2 } from 'lucide-react';
import { loungeMessageVoiceUsageText } from '../lib/loungeMessageActions';
import type { LoungeMessageVoiceUsage } from '../lib/loungeApi';

export type LoungeMessageActionKind = 'regenerate' | 'voice' | 'rewind';

/**
 * What a tapped message of a one-to-one chat offers, under the bubble: 다시 쓰기 (the character's last reply), 음성으로 듣기 (a reply
 * of the character) and 되감기 (the member's message and the reply to it, from one of the member's last five exchanges; asked
 * once more, with what would go dimmed, before anything is removed).
 */
export function LoungeMessageActions({ name, own, regenerate, voice, rewindCount, busy, locked, playing, usage, note, onAction, onConfirming }: {
  /** The character's name, for the question before going back. */
  name: string;
  /** The member's own message (shown on the right). */
  own: boolean;
  regenerate: boolean; voice: boolean;
  /** How many messages of the two going back from here takes back (the member's message included); none when it cannot. */
  rewindCount?: number;
  /** Going back is being confirmed (true) or no longer (false): the messages it takes back are shown dimmed. */
  onConfirming?: (on: boolean) => void;
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
  const [confirming, setConfirmingState] = useState(false);
  const setConfirming = (on: boolean) => { setConfirmingState(on); onConfirming?.(on); };
  const rewind = rewindCount !== undefined && rewindCount > 0;
  const waiting = busy !== null;
  const usageText = voice ? loungeMessageVoiceUsageText(usage) : '';
  if (confirming) return <div className={`lounge-message-actions ${own ? 'own' : ''}`} role="group" aria-label="되감기 확인">
    <p className="lounge-message-actions-note">{rewindCount === 1 ? '내 말이 지워져요.' : `내 말과 ${name}의 답, 대화 ${rewindCount}개가 지워져요.`} {name}도 그 대화를 기억하지 않아요.</p>
    <button type="button" className="danger" disabled={waiting || locked} onClick={() => onAction('rewind')}>{busy === 'rewind' ? <LoaderCircle size={14} className="lounge-spin" /> : <Undo2 size={14} />}되감기</button>
    <button type="button" disabled={waiting} onClick={() => setConfirming(false)}>취소</button>
    {note && <p className="lounge-message-actions-note" role="alert">{note}</p>}
  </div>;
  return <div className={`lounge-message-actions ${own ? 'own' : ''}`} role="group" aria-label="메시지 메뉴">
    {regenerate && <button type="button" disabled={waiting || locked} onClick={() => onAction('regenerate')}>{busy === 'regenerate' ? <LoaderCircle size={14} className="lounge-spin" /> : <RefreshCw size={14} />}다시 쓰기</button>}
    {voice && (playing
      ? <button type="button" onClick={() => onAction('stop')}><Square size={13} />멈추기</button>
      : <button type="button" disabled={waiting} onClick={() => onAction('voice')}>{busy === 'voice' ? <LoaderCircle size={14} className="lounge-spin" /> : <Volume2 size={14} />}음성으로 듣기</button>)}
    {rewind && <button type="button" disabled={waiting || locked} onClick={() => setConfirming(true)}><Undo2 size={14} />되감기 · 대화 {rewindCount}개</button>}
    {(note || usageText) && <p className="lounge-message-actions-note" role={note ? 'alert' : undefined}>{note || usageText}</p>}
  </div>;
}
