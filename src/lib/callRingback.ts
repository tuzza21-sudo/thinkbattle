/**
 * The tone heard while a call is being put through (2026-11-07): the ringback of a phone, 440 Hz and 480 Hz together,
 * until the character picks up (its first word) or a failsafe ends it. Made with the Web Audio API, so there is no sound
 * file to ship. It starts from the member's click (the call button), where the browser lets a page make sound.
 *
 * 2026-11-20 (the tone cut out in the middle while the call was connecting): every ring of the failsafe's length is now
 * scheduled on the audio clock at the start, so a page busy with the connection can no longer make a ring late, early or
 * clipped (they were started from a timer, which the connecting work held up). Each ring swells in and fades out
 * slowly instead of starting and stopping at once, and a context the browser pauses is resumed.
 */

const ringSeconds = 1.3, quietSeconds = 1.7, failsafeMs = 20_000, level = 0.2, attackSeconds = 0.14, releaseSeconds = 0.4, fadeSeconds = 0.3;

/** When each ring starts and ends (seconds from the start), enough of them to cover the failsafe. */
export function ringbackSchedule(totalSeconds = failsafeMs / 1000): Array<{ start: number; end: number }> {
  const rings: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < totalSeconds; start += ringSeconds + quietSeconds) rings.push({ start, end: start + ringSeconds });
  return rings;
}

export function startCallRingback(onEnd?: () => void): () => void {
  let audio: AudioContext;
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return () => {};
    audio = new AudioContextClass();
  } catch { return () => {}; }
  // `onEnd` tells the page the ringing is over, however it ended (the first word, an error, the failsafe).
  void audio.resume().catch(() => {});
  let stopped = false;
  // The browser may pause the context while the call connects (the microphone opens, another sound starts): the clock stops with it, so the
  // rings already scheduled wait and go on from where they were once it runs again.
  audio.onstatechange = () => { if (!stopped && audio.state !== 'running' && audio.state !== 'closed') void audio.resume().catch(() => {}); };
  const gain = audio.createGain();
  gain.gain.value = 0;
  gain.connect(audio.destination);
  const tones = [440, 480].map(frequency => {
    const oscillator = audio.createOscillator();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    oscillator.connect(gain); oscillator.start();
    return oscillator;
  });
  const begin = audio.currentTime + 0.03;
  gain.gain.setValueAtTime(0, begin);
  for (const { start, end } of ringbackSchedule()) {
    gain.gain.setValueAtTime(0, begin + start);
    gain.gain.linearRampToValueAtTime(level, begin + start + attackSeconds);
    gain.gain.setValueAtTime(level, begin + end - releaseSeconds);
    gain.gain.linearRampToValueAtTime(0, begin + end);
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(failsafe); onEnd?.();
    try {
      const at = audio.currentTime;
      const held = gain.gain.value;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(held, at);
      gain.gain.linearRampToValueAtTime(0, at + fadeSeconds);
    } catch { /* the tone is stopped below either way */ }
    window.setTimeout(() => {
      for (const oscillator of tones) { try { oscillator.stop(); } catch { /* already stopped */ } }
      void audio.close().catch(() => {});
    }, fadeSeconds * 1000 + 50);
  };
  const failsafe = window.setTimeout(stop, failsafeMs);
  return stop;
}
