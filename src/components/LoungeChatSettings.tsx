import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';

export type LoungeSettingsItem = { key: string; icon: ReactNode; label: string; hint?: string; onSelect: () => void };

/**
 * "대화 설정" beside the relationship card of a one-to-one chat (2026-10-29): the conversation's tools in one menu (the
 * record, the background, the memories) and its choices below them (the persona, the photo model). Before, the record
 * and the background were buttons at the top and the memories sat at the bottom of the relationship card.
 */
export function LoungeChatSettings({ items, children }: { items: LoungeSettingsItem[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return <div className="lounge-chat-settings" ref={root}>
    <button type="button" ref={toggle} className="lounge-chat-settings-toggle" aria-haspopup="true" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)} title="대화 설정">
      <Settings2 size={16} /><span>대화 설정</span>
    </button>
    {open && <div className="lounge-chat-settings-menu" id={menuId}>
      <div className="lounge-chat-settings-items">{items.map(item => <button key={item.key} type="button" onClick={() => { setOpen(false); item.onSelect(); }}>
        {item.icon}<span>{item.label}{item.hint && <small>{item.hint}</small>}</span>
      </button>)}</div>
      {children}
    </div>}
  </div>;
}

/** One choice in the menu, as a group of options (the persona, the photo model). */
export function LoungeSettingsChoice({ title, options, value, onChange, busy, note }: {
  title: string; options: Array<{ value: string; label: string; hint?: string }>; value: string; onChange: (value: string) => void; busy?: boolean; note?: ReactNode;
}) {
  const name = useId();
  return <fieldset className="lounge-chat-settings-choice" disabled={busy}>
    <legend>{title}</legend>
    {options.map(option => <label key={option.value}>
      <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span>{option.label}{option.hint && <small>{option.hint}</small>}</span>
    </label>)}
    {note && <p>{note}</p>}
  </fieldset>;
}
