import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle, Play } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { startLoungeScenario } from '../lib/loungeApi';
import { loungeMemberNoteLimits, personalizeLoungeStory, type LoungeScenarioRow } from '../lib/loungeScenarios';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * The stories a member can start with a character. Starting one opens (or continues) a chat in that story, where the
 * prologue is told first and the character opens the scene. Nothing is shown while there are none (or before the
 * scenarios are installed).
 */
export function LoungeScenarioCards({ scenarios, user }: { scenarios: LoungeScenarioRow[]; user: AppUser | null }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // "둘만의 이야기" links here (#stories): the list appears once loaded, so it is scrolled to then.
  const listed = scenarios.length > 0;
  useEffect(() => { if (listed && hash === '#stories') document.getElementById('stories')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [listed, hash]);
  if (!scenarios.length) return null;
  const start = async (id: string) => {
    if (!user) return;
    setBusy(id); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(id, user.nickname, note)}`); }
    catch (err) { setError(errorText(err)); setBusy(null); }
  };
  return <section id="stories" className="lounge-character-section lounge-scenarios">
    <h2><BookOpen size={18} /> 대화 시작하기</h2>
    <p className="lounge-character-lead">함께할 이야기를 고르면 짧은 프롤로그가 먼저 나오고, 장면 속에서 대화가 시작돼요.</p>
    {user && <details className="lounge-scenario-note">
      <summary>나를 소개하고 시작하기 <small>선택</small></summary>
      <label>
        <span>내 성격, 말투, 좋아하는 것, 이 이야기에서 바라는 것을 적으면 캐릭터가 그걸 알고 시작해요. 이야기 속에서만 쓰이고, 아래 어느 이야기로 시작하든 같이 전해져요.</span>
        <textarea rows={4} value={note} maxLength={loungeMemberNoteLimits.current} onChange={event => setNote(event.target.value)} placeholder="예: 낯을 가리지만 친해지면 장난을 많이 쳐요. 말은 짧고 느린 편이고, 고양이와 새벽 산책을 좋아해요. 이야기에서는 천천히 가까워지는 걸 바라요." />
        <small>{note.length}/{loungeMemberNoteLimits.current}자</small>
      </label>
    </details>}
    <div className="lounge-scenario-list">
      {scenarios.map(scenario => <article key={scenario.id} className="lounge-scenario-card">
        <h3>{scenario.title}</h3>
        <p>{personalizeLoungeStory(scenario.hook, user?.nickname)}</p>
        <small>{personalizeLoungeStory('당신의 역할', user?.nickname)} · {personalizeLoungeStory(scenario.user_role, user?.nickname)}</small>
        {user ? <button type="button" className="lounge-character-cta" disabled={Boolean(busy)} onClick={() => void start(scenario.id)}>{busy === scenario.id ? <LoaderCircle size={15} className="lounge-spin" /> : <Play size={15} />}이 이야기로 시작</button>
          : <Link to="/lounge" className="lounge-character-cta"><Play size={15} />로그인하고 시작</Link>}
      </article>)}
    </div>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </section>;
}
