import { useEffect, useState } from 'react';
import { listLoungeScenarios } from './loungeApi';
import type { LoungeScenarioRow } from './loungeScenarios';

/** The stories of a character, loaded once for the page (its "대화 시작하기" and the list below); null while loading. */
export function useLoungeScenarios(characterId: string) {
  const [scenarios, setScenarios] = useState<{ id: string; rows: LoungeScenarioRow[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listLoungeScenarios(characterId).then(rows => { if (!cancelled) setScenarios({ id: characterId, rows }); });
    return () => { cancelled = true; };
  }, [characterId]);
  return scenarios?.id === characterId ? scenarios.rows : null;
}
