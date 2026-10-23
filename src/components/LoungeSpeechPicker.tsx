import { useEffect, useId, useRef, useState } from 'react';
import { AudioLines, Check, ChevronDown } from 'lucide-react';
import { getLoungeSpeechEngine, loungeSpeechCharsPerMinute, loungeSpeechEngines, type LoungeSpeechEngine } from '../lib/lounge';
import type { LoungeSpeechUsage } from '../lib/loungeApi';

/** What a premium engine offers this member now: a line under its name, and whether it can be chosen. */
function premiumState(engine: LoungeSpeechEngine, usage?: LoungeSpeechUsage) {
  const status = usage?.[engine];
  if (!status) return { note: '', blocked: false };
  if (!status.member) return { note: '회원 전용이에요', blocked: true };
  if (!status.available) return { note: '곧 열려요', blocked: true };
  if (status.unavailable) return { note: '지금은 쓸 수 없어요', blocked: true };
  if (!status.allowed) return { note: status.reason === 'total' ? '이번 달 사용량이 모두 찼어요' : '이번 달 분량을 모두 썼어요 · 다음 달에 다시 열려요', blocked: true };
  const minutes = Math.floor(status.left / loungeSpeechCharsPerMinute);
  return { note: minutes >= 1 ? `이번 달 약 ${minutes}분 남음` : '이번 달 1분 미만 남음', blocked: false };
}

/**
 * The voice engine of a one-to-one voice room: the same pill and menu as the model picker. A premium engine (it costs
 * per character) shows what is left of the member's month; one that cannot speak now (a guest, no key, the month's
 * allowance used) is shown but cannot be chosen, and the character speaks in its ordinary voice.
 */
export function LoungeSpeechPicker({ value, disabled, usage, onChange }: { value: LoungeSpeechEngine; disabled: boolean; usage?: LoungeSpeechUsage; onChange: (engine: LoungeSpeechEngine) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = getLoungeSpeechEngine(value);
  const currentBlocked = current.premium && premiumState(current.id, usage).blocked;
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (engine: LoungeSpeechEngine) => {
    setOpen(false); trigger.current?.focus();
    if (engine !== current.id) onChange(engine);
  };
  return <div className="lounge-model-picker" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button type="button" ref={trigger} className="lounge-model-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen(value => !value)} title={currentBlocked ? '이 음성은 지금 쓸 수 없어 기본 목소리로 말해요' : '대화 상대의 목소리를 만드는 음성 엔진'}>
      <AudioLines size={15} /><span>{currentBlocked ? `${current.label} · 기본 목소리` : current.label}</span><ChevronDown size={14} className="lounge-model-chevron" />
    </button>
    {open && <div className="lounge-model-menu" id={menuId} role="menu" aria-label="음성 엔진">
      <p>음성 엔진</p>
      {loungeSpeechEngines.map(engine => {
        const selected = engine.id === current.id;
        const state = engine.premium ? premiumState(engine.id, usage) : { note: '', blocked: false };
        return <button key={engine.id} type="button" role="menuitemradio" aria-checked={selected} className={selected ? 'selected' : ''} disabled={state.blocked && !selected} onClick={() => choose(engine.id)}>
          <i><AudioLines size={17} /></i><span><strong>{engine.label}</strong><small>{engine.description}</small>{state.note && <small className="lounge-model-note">{state.note}</small>}</span>{selected && <Check size={16} className="lounge-model-check" />}
        </button>;
      })}
    </div>}
  </div>;
}
