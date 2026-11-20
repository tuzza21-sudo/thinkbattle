import { useEffect, useId, useState } from 'react';
import { ChevronDown, LoaderCircle, MessageCircle } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { listLoungeChats, startLoungeScenario } from '../lib/loungeApi';
import type { LoungeScenarioRow } from '../lib/loungeScenarios';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * The way into a conversation on a character's page (2026-11-20, by the owner): the "대화 시작하기" button opens the stories right under it, each a
 * small card with only its title, and a tap starts it (a conversation the member already has with the character goes on). It replaces the
 * list of full story cards further down the page, which the button used to scroll to. Nothing is shown while there are no stories.
 * `scenarios` is null while they load.
 */
export function LoungeStoryStart({ scenarios, user }: { scenarios: LoungeScenarioRow[] | null; user: AppUser | null }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const listId = useId();
  // "둘만의 이야기" on the home links here (#stories): the stories are already open then.
  const [open, setOpen] = useState(hash === '#stories');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [begun, setBegun] = useState(false);
  const member = Boolean(user && !user.isAnonymous);
  const characterId = scenarios?.[0]?.character_id;
  useEffect(() => {
    if (!member || !characterId) return;
    let cancelled = false;
    void listLoungeChats().then(chats => { if (!cancelled) setBegun(chats.some(chat => chat.character_id === characterId)); }, () => {});
    return () => { cancelled = true; };
  }, [member, characterId]);
  const listed = Boolean(scenarios?.length);
  useEffect(() => { if (listed && hash === '#stories') { document.getElementById('stories')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, [listed, hash]);
  if (scenarios?.length === 0) return null;
  const start = async (id: string) => {
    if (!user || busy) return;
    setBusy(id); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(id, user.nickname)}`); }
    catch (err) { setError(errorText(err)); setBusy(null); }
  };
  return <>
    <div id="stories" className="lounge-character-actions lounge-character-start">
      <button type="button" className="lounge-character-cta" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(current => !current)}>
        <MessageCircle size={17} />대화 시작하기<ChevronDown size={16} className={`lounge-character-cta-arrow ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>
      <span className="lounge-character-cta-note">{scenarios ? `함께할 이야기 ${scenarios.length}개 중에서 골라요` : '이야기를 불러오는 중…'}</span>
    </div>
    {open && scenarios && <div id={listId} className="lounge-story-start">
      <ul className="lounge-story-chips">
        {scenarios.map(scenario => <li key={scenario.id}>
          {user ? <button type="button" disabled={Boolean(busy)} onClick={() => void start(scenario.id)}>{busy === scenario.id ? <LoaderCircle size={14} className="lounge-spin" /> : null}{scenario.title}</button>
            : <Link to="/">{scenario.title}</Link>}
        </li>)}
      </ul>
      <p className="lounge-story-hint">{!user ? '로그인하면 이야기를 시작할 수 있어요.' : begun ? '이야기를 누르면 하던 대화가 이어져요.' : '이야기를 누르면 프롤로그가 먼저 나오고, 장면 속에서 대화가 시작돼요.'}</p>
      {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
    </div>}
  </>;
}
