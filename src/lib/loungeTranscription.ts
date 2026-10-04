// Keep recorded utterances in order and respect the database's two-second gap.
export function createLoungeTranscriptionQueue(
  now = () => Date.now(),
  wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
) {
  let tail = Promise.resolve();
  let lastStarted: number | undefined;
  return {
    flush: () => tail,
    enqueue(task: () => Promise<void>, isCurrent: () => boolean) {
      const next = tail.then(async () => {
        if (!isCurrent()) return;
        const delay = lastStarted === undefined ? 0 : Math.max(0, lastStarted + 2500 - now());
        if (delay) await wait(delay);
        if (!isCurrent()) return;
        lastStarted = now();
        await task();
      });
      tail = next.catch(() => {});
      return next;
    },
  };
}
