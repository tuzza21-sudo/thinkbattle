import { useEffect, useRef, useState } from 'react';
import { Check, Headphones, Square } from 'lucide-react';
import { getLoungeHostLoudness, loungeCharacterProfiles, loungeHostGroups, loungeHosts, type LoungeHostId } from '../lib/lounge';
import { LoungeHostPortrait } from './LoungeHostPortrait';

export function LoungeHostOptions({ selected, onSelect }: { selected: LoungeHostId; onSelect: (id: LoungeHostId) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const gainContext = useRef<AudioContext | null>(null);
  const [playing, setPlaying] = useState<LoungeHostId | null>(null);
  const [error, setError] = useState('');
  useEffect(() => () => { audio.current?.pause(); audio.current = null; void gainContext.current?.close().catch(() => undefined); gainContext.current = null; }, []);
  const stop =() => { audio.current?.pause(); audio.current = null; void gainContext.current?.close().catch(() => undefined); gainContext.current = null; setPlaying(null); };
  const listen = async (id: LoungeHostId) => {
    const same = playing === id;
    stop(); setError('');
    if (same) return;
    const host = loungeHosts.find(item => item.id === id)!;
    const sample = new Audio(host.voiceSample);
    audio.current = sample; setPlaying(id);
    // A quietly rendered voice gets the same extra gain it gets in the room, so the preview matches.
    const loudness = getLoungeHostLoudness(id);
    if (loudness > 1) {
      try {
        const context = new AudioContext(), gain = context.createGain(), limiter = context.createDynamicsCompressor();
        gain.gain.value = loudness; limiter.threshold.value = -3; limiter.knee.value = 6; limiter.ratio.value = 12;
        context.createMediaElementSource(sample).connect(gain); gain.connect(limiter); limiter.connect(context.destination);
        gainContext.current = context; void context.resume();
      } catch { /* the sample then plays at its original volume */ }
    }
    sample.onended = () => { if (audio.current === sample) stop(); };
    sample.onerror = () => { if (audio.current === sample) { stop(); setError('음성 예시를 재생하지 못했어요. 다시 눌러 주세요.'); } };
    try { await sample.play(); }
    catch { if (audio.current === sample) { stop(); setError('소리를 재생하지 못했어요. 다시 눌러 주세요.'); } }
  };
  const card = (host: typeof loungeHosts[number]) => {
    const profile = loungeCharacterProfiles[host.id];
    // A character added without a recorded sample shows its voice description instead of a play button.
    const voiceSample: string = host.voiceSample;
    return <div className={`lounge-host-card ${profile ? 'character' : ''}`} key={host.id}>
      <button type="button" className={`lounge-host-option ${selected === host.id ? 'selected' : ''}`} onClick={() => { stop(); onSelect(host.id); }} aria-pressed={selected === host.id}>
        <LoungeHostPortrait hostId={host.id} /><strong>{host.name}</strong><small className="lounge-host-mood">{host.tag}</small>
        {profile && <><ul className="lounge-host-traits" aria-label={`${host.name}의 특징`}>{profile.traits.map(trait => <li key={trait}>{trait}</li>)}</ul><small className="lounge-host-summary">{profile.summary}</small></>}
        <span className="lounge-selection-check">{selected === host.id ? <Check size={14} /> : '+'}</span>
      </button>
      <div className="lounge-host-voice">{!voiceSample ? <span className="lounge-voice-preview pending">{host.voiceLabel}</span> : <button type="button" className="lounge-voice-preview" onClick={() => void listen(host.id)} aria-pressed={playing === host.id} aria-label={`${host.name} ${playing === host.id ? '음성 예시 정지' : '목소리 듣기'}`}>{playing === host.id ? <Square size={13} /> : <Headphones size={14} />}{playing === host.id ? '듣기 중지' : '목소리 듣기'}</button>}</div>
    </div>;
  };
  return <>
    {loungeHostGroups.map(group => <div key={group.id} className="lounge-host-section">
      <div className="lounge-host-group"><h3>{group.title} <span>{group.subtitle}</span></h3><p>{group.description}</p></div>
      <div className={`lounge-host-options ${group.hostIds.length < 4 ? 'centered' : ''}`}>{group.hostIds.map(id => loungeHosts.find(host => host.id === id)!).map(card)}</div>
    </div>)}
    <div className="lounge-host-group">
      <p>혼자 대화(1:1)에서는 만날수록 관계가 쌓이고 캐릭터의 태도가 달라져요. 여럿이 함께할 때는 관계가 바뀌지 않고, 캐릭터의 말투로 가볍게 대화를 돕기만 해요. 날은 주장과 계획에만 세우고 사람은 깎아내리지 않아요.</p>
    </div>
    {error && <p className="lounge-voice-error" role="alert">{error}</p>}
  </>;
}
