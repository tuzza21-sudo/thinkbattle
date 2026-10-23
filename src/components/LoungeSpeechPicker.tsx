import { useEffect, useId, useRef, useState } from 'react';
import { AudioLines, Check, ChevronDown } from 'lucide-react';
import { getLoungeSpeechEngine, loungeSpeechEngines, type LoungeSpeechEngine } from '../lib/lounge';

/**
 * The voice engine of a one-to-one voice room: the same pill and menu as the model picker. An engine the server cannot
 * use yet (no key or no voice for the character) still answers, in the OpenAI voice.
 */
export function LoungeSpeechPicker({ value, disabled, onChange }: { value: LoungeSpeechEngine; disabled: boolean; onChange: (engine: LoungeSpeechEngine) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = getLoungeSpeechEngine(value);
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
    <button type="button" ref={trigger} className="lounge-model-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen(value => !value)} title="대화 상대의 목소리를 만드는 음성 엔진">
      <AudioLines size={15} /><span>{current.label}</span><ChevronDown size={14} className="lounge-model-chevron" />
    </button>
    {open && <div className="lounge-model-menu" id={menuId} role="menu" aria-label="음성 엔진">
      <p>음성 엔진</p>
      {loungeSpeechEngines.map(engine => {
        const selected = engine.id === current.id;
        return <button key={engine.id} type="button" role="menuitemradio" aria-checked={selected} className={selected ? 'selected' : ''} onClick={() => choose(engine.id)}>
          <i><AudioLines size={17} /></i><span><strong>{engine.label}</strong><small>{engine.description}</small></span>{selected && <Check size={16} className="lounge-model-check" />}
        </button>;
      })}
    </div>}
  </div>;
}
