import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { listLoungeScenarios, startLoungeScenario } from '../lib/loungeApi';
import type { LoungeScenarioRow } from '../lib/loungeScenarios';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * The stories a member can start with a character. Starting one opens (or continues) a chat in that story, where the
 * prologue is told first and the character opens the scene. Nothing is shown while there are none (or before the
 * scenarios are installed).
 */
export function LoungeScenarioCards({ characterId, user }: { characterId: string; user: AppUser | null }) {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<LoungeScenarioRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void listLoungeScenarios(characterId).then(rows => { if (!cancelled) setScenarios(rows); });
    return () => { cancelled = true; };
  }, [characterId]);
  if (!scenarios.length) return null;
  const start = async (id: string) => {
    if (!user) return;
    setBusy(id); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(id, user.nickname)}`); }
    catch (err) { setError(errorText(err)); setBusy(null); }
  };
  return <section className="lounge-character-section lounge-scenarios">
    <h2><BookOpen size={18} /> 함께할 이야기</h2>
    <p className="lounge-character-lead">이야기를 고르면 짧은 프롤로그가 먼저 나오고, 장면 속에서 대화가 시작돼요.</p>
    <div className="lounge-scenario-list">
      {scenarios.map(scenario => <article key={scenario.id} className="lounge-scenario-card">
        <h3>{scenario.title}</h3>
        <p>{scenario.hook}</p>
        <small>당신의 역할 · {scenario.user_role}</small>
        {user ? <button type="button" className="lounge-character-cta" disabled={Boolean(busy)} onClick={() => void start(scenario.id)}>{busy === scenario.id ? <LoaderCircle size={15} className="lounge-spin" /> : <Play size={15} />}이 이야기로 시작</button>
          : <Link to="/lounge" className="lounge-character-cta"><Play size={15} />로그인하고 시작</Link>}
      </article>)}
    </div>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </section>;
}
