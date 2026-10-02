import { useEffect, useRef, useState } from 'react';
import { Check, Headphones, Square } from 'lucide-react';
import { loungeHosts, type LoungeHostId } from '../lib/lounge';
import { LoungeHostPortrait } from './LoungeHostPortrait';

export function LoungeHostOptions({ selected, onSelect }: { selected: LoungeHostId; onSelect: (id: LoungeHostId) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<LoungeHostId | null>(null);
  const [error, setError] = useState('');
  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);
  const stop = () => { audio.current?.pause(); audio.current = null; setPlaying(null); };
  const listen = async (id: LoungeHostId) => {
    const same = playing === id;
    stop(); setError('');
    if (same) return;
    const host = loungeHosts.find(item => item.id === id)!;
    const sample = new Audio(host.voiceSample);
    audio.current = sample; setPlaying(id);
    sample.onended = () => { if (audio.current === sample) stop(); };
    sample.onerror = () => { if (audio.current === sample) { stop(); setError('음성 예시를 재생하지 못했어요. 다시 눌러 주세요.'); } };
    try { await sample.play(); }
    catch { if (audio.current === sample) { stop(); setError('소리를 재생하지 못했어요. 다시 눌러 주세요.'); } }
  };
  return <><div className="lounge-host-options">{loungeHosts.map(host => <div className="lounge-host-card" key={host.id}>
    <button type="button" className={`lounge-host-option ${selected === host.id ? 'selected' : ''}`} onClick={() => { stop(); onSelect(host.id); }} aria-pressed={selected === host.id}>
      <LoungeHostPortrait hostId={host.id} /><strong>{host.name}</strong><small className="lounge-host-mood">{host.tag}</small><span className="lounge-selection-check">{selected === host.id ? <Check size={14} /> : '+'}</span>
    </button>
    <div className="lounge-host-voice"><button type="button" className="lounge-voice-preview" onClick={() => void listen(host.id)} aria-pressed={playing === host.id} aria-label={`${host.name} ${playing === host.id ? '음성 예시 정지' : '목소리 듣기'}`}>{playing === host.id ? <Square size={13} /> : <Headphones size={14} />}{playing === host.id ? '듣기 중지' : '목소리 듣기'}</button></div>
  </div>)}</div>{error && <p className="lounge-voice-error" role="alert">{error}</p>}</>;
}
