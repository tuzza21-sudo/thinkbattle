/**
 * The tone heard while a call is being put through (2026-11-07): the ringback of a phone, 440 Hz and 480 Hz together for
 * one second, then two seconds of quiet, until the character picks up (its first word) or a failsafe ends it. Made with
 * the Web Audio API, so there is no sound file to ship. It starts from the member's click (the call button), where the
 * browser lets a page make sound.
 */

// The level was 0.07, which a phone speaker barely showed; 0.2 is clearly heard at a normal volume (2026-11-09).
const ringSeconds = 1, quietSeconds = 2, failsafeMs = 20_000, level = 0.2, fadeSeconds = 0.25;

export function startCallRingback(onEnd?: () => void): () => void {
  let audio: AudioContext;
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return () => {};
    audio = new AudioContextClass();
  } catch { return () => {}; }
  // `onEnd` tells the page the ringing is over, however it ended (the first word, an error, the failsafe).
  void audio.resume().catch(() => {});
  const gain = audio.createGain();
  gain.gain.value = 0;
  gain.connect(audio.destination);
  const tones = [440, 480].map(frequency => {
    const oscillator = audio.createOscillator();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    oscillator.connect(gain); oscillator.start();
    return oscillator;
  });
  const ring = () => {
    const at = audio.currentTime;
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.03);
    gain.gain.setValueAtTime(level, at + ringSeconds - 0.05);
    gain.gain.linearRampToValueAtTime(0, at + ringSeconds);
  };
  ring();
  const repeat = window.setInterval(ring, (ringSeconds + quietSeconds) * 1000);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(repeat); window.clearTimeout(failsafe); onEnd?.();
    try {
      const at = audio.currentTime;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(gain.gain.value, at);
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
