import { useCallback, useEffect, useRef, useState } from 'react';
import { getLoungeHostLoudness, loungeHosts, type LoungeHostId } from './lounge';

/** Plays a host's recorded voice sample, one at a time, with the same extra gain the host gets in the room. */
export function useLoungeVoicePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const gainContext = useRef<AudioContext | null>(null);
  const [playing, setPlaying] = useState<LoungeHostId | null>(null);
  const [error, setError] = useState('');
  const release = useCallback(() => { audio.current?.pause(); audio.current = null; void gainContext.current?.close().catch(() => undefined); gainContext.current = null; }, []);
  useEffect(() => release, [release]);
  const stop = useCallback(() => { release(); setPlaying(null); }, [release]);
  const listen = useCallback(async (id: LoungeHostId) => {
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
  }, [playing, stop]);
  return { playing, error, listen, stop };
}
