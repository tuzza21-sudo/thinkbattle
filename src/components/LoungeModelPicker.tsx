import { useEffect, useId, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Sparkles, Zap } from 'lucide-react';
import { getLoungeChatModel, loungeOfferedChatModels } from '../lib/loungeModels';

const modelIcons: Record<string, typeof Zap> = { gpt: Zap, 'gpt-reasoning': Brain };

/**
 * The conversation model of a one-to-one room: a pill with the model in use that opens a short menu above it, each
 * model with what it is good for. The menu closes on a choice, on Escape and on a click outside it.
 */
export function LoungeModelPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (model: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = getLoungeChatModel(value);
  const Icon = modelIcons[current.id] ?? Sparkles;
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (model: string) => {
    setOpen(false); trigger.current?.focus();
    if (model !== current.id) onChange(model);
  };
  return <div className="lounge-model-picker lounge-chat-model-picker" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button type="button" ref={trigger} className="lounge-model-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen(value => !value)} title="대화 상대가 답할 때 쓰는 AI 모델이에요">
      <Icon size={15} /><span>{current.label}</span><ChevronDown size={14} className="lounge-model-chevron" />
    </button>
    {open && <div className="lounge-model-menu" id={menuId} role="menu" aria-label="대화 모델">
      <p>대화 모델</p>
      {loungeOfferedChatModels.map(model => {
        const ModelIcon = modelIcons[model.id] ?? Sparkles, selected = model.id === current.id;
        return <button key={model.id} type="button" role="menuitemradio" aria-checked={selected} className={selected ? 'selected' : ''} onClick={() => choose(model.id)}>
          <i><ModelIcon size={17} /></i><span><strong>{model.label}</strong><small>{model.description}</small></span>{selected && <Check size={16} className="lounge-model-check" />}
        </button>;
      })}
    </div>}
  </div>;
}
