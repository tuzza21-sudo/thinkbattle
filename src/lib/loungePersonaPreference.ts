/**
 * The persona a member picked on a character's page for the conversations they open with that character (2026-11-18): an empty value is the default
 * persona (nothing is stored), 'none' is no persona, anything else is a persona's id. It lives in the browser; a conversation takes it once, the
 * first time it is opened, if the member has not chosen a persona in it yet.
 */
const key = (characterId: string) => `lounge-persona:${characterId}`;
export function loadLoungePersonaPreference(characterId: string): string {
  try { return localStorage.getItem(key(characterId)) ?? ''; } catch { return ''; }
}
export function saveLoungePersonaPreference(characterId: string, value: string) {
  try { if (value) localStorage.setItem(key(characterId), value); else localStorage.removeItem(key(characterId)); } catch { /* A private window keeps nothing. */ }
}
/** What to set on a new conversation: undefined leaves it to the default. */
export function loungePersonaToApply(preference: string, personaIds: readonly string[]): { none: true } | { id: string } | undefined {
  if (preference === 'none') return { none: true };
  return preference && personaIds.includes(preference) ? { id: preference } : undefined;
}
