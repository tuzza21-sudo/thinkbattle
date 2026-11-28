import { useEffect, useState, type ReactNode } from 'react';
import { LoaderCircle, MessageCircle } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { startLoungeScenario } from '../lib/loungeApi';
import { personalizeLoungeStory, type LoungeScenarioRow } from '../lib/loungeScenarios';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * The way into a conversation on a character's page (2026-11-20, by the owner): the stories are shown at once as small cards with only a title,
 * under the "대화 시작하기" button; tapping a card picks it and shows its short summary, and the button starts the picked story (the first
 * one until another is picked; a conversation the member already has with the character goes on). The persona button (`extra`) sits at the
 * button's right. `scenarios` is null while they load. Nothing of the stories is shown while there are none, but the persona button is.
 */
export function LoungeStoryStart({ scenarios, user, extra, label = '대화 시작하기' }: { scenarios: LoungeScenarioRow[] | null; user: AppUser | null; extra?: ReactNode; /** The button's words: 여행하기, 탐험하기 for a travel companion. */ label?: string }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // "둘만의 이야기" on the home links here (#stories): the list appears once loaded, so it is scrolled to then.
  const listed = Boolean(scenarios?.length);
  useEffect(() => { if (listed && hash === '#stories') document.getElementById('stories')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [listed, hash]);
  if (scenarios?.length === 0) return extra ? <div className="lounge-character-actions lounge-character-start">{extra}</div> : null;
  const current = scenarios?.find(scenario => scenario.id === picked) ?? scenarios?.[0];
  const start = async () => {
    if (!user || !current || busy) return;
    setBusy(true); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(current.id, user.nickname)}`); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return <>
    <div id="stories" className="lounge-character-actions lounge-character-start">
      {user ? <button type="button" className="lounge-character-cta" disabled={busy || !current} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="lounge-spin" /> : <MessageCircle size={17} />}{label}</button>
        : <Link to="/" className="lounge-character-cta"><MessageCircle size={17} />로그인하고 시작하기</Link>}
      {extra}
    </div>
    {scenarios ? <div className="lounge-story-start">
      <ul className="lounge-story-chips" aria-label="함께할 이야기">
        {scenarios.map(scenario => <li key={scenario.id}>
          <button type="button" aria-pressed={scenario.id === current?.id} disabled={busy} onClick={() => setPicked(scenario.id)}>{scenario.title}</button>
        </li>)}
      </ul>
      {current && <div className="lounge-story-summary">
        <p>{personalizeLoungeStory(current.hook, user?.nickname)}</p>
        <small>{personalizeLoungeStory('당신의 역할', user?.nickname)} · {personalizeLoungeStory(current.user_role, user?.nickname)}</small>
      </div>}
      {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
    </div> : <p className="lounge-story-hint">이야기를 불러오는 중…</p>}
  </>;
}
