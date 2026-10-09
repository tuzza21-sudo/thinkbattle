import { useSyncExternalStore } from 'react';

/**
 * The visitor's place in line for a full space. It is kept while they move around the house and across reloads
 * (for 30 minutes); a watcher on every lounge page checks in with the server and seats them when a seat is free.
 */
export type LoungeWaitIntent = { spaceId: string; spaceName: string; since: number; ahead: number | null };
const storageKey = 'lounge-wait';
const maxAgeMs = 30 * 60_000;
const listeners = new Set<() => void>();
let cached: LoungeWaitIntent | null | undefined;

function read(): LoungeWaitIntent | null {
  if (cached !== undefined) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    cached = raw && typeof raw.spaceId === 'string' && typeof raw.spaceName === 'string' && typeof raw.since === 'number' && Date.now() - raw.since < maxAgeMs
      ? { spaceId: raw.spaceId, spaceName: raw.spaceName, since: raw.since, ahead: null } : null;
  } catch { cached = null; }
  return cached;
}
function write(value: LoungeWaitIntent | null) {
  cached = value;
  try { if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); } catch { /* The wait still lasts for this page. */ }
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const useLoungeWait = () => useSyncExternalStore(subscribe, read, () => null);
export const currentLoungeWait = read;
export const startLoungeWait = (spaceId: string, spaceName: string) => write({ spaceId, spaceName, since: Date.now(), ahead: null });
export const stopLoungeWait = () => write(null);
/** How many people are ahead, as the server last said. */
export function setLoungeWaitAhead(spaceId: string, ahead: number) {
  const wait = read();
  if (wait?.spaceId === spaceId && wait.ahead !== ahead) write({ ...wait, ahead });
}
