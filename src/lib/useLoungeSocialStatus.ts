import { useCallback, useEffect, useState } from 'react';
import type { AppUser } from '../types';
import { countLoungeUnreadNotes, touchLoungePresence } from './loungeSocial';

/** Keeps a registered member's online status fresh for friends and counts unread notes. Guests do neither. */
export function useLoungeSocialStatus(user: AppUser | null) {
  const [unread, setUnread] = useState(0);
  const userId = user && !user.isAnonymous ? user.id : null;
  const refresh = useCallback(() => { if (userId) void countLoungeUnreadNotes().then(count => setUnread(Number(count) || 0), () => {}); }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const tick = () => { if (document.visibilityState !== 'visible') return; void touchLoungePresence().catch(() => {}); refresh(); };
    tick();
    const interval = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [userId, refresh]);
  return { unread: userId ? unread : 0, refresh };
}

