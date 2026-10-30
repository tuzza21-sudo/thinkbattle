import { ArrowLeft, MessageCircle, UserCog } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AppUser } from '../types';
import { loungePersonaLimits } from '../lib/loungePersonas';
import { LoungePersonaManager } from './LoungePersonaManager';
import './LoungeAccountDialog.css';
import './LoungePersonaPage.css';

/**
 * The member's persona page (2026-10-30): who they are in a one-to-one conversation, made and kept before any
 * conversation starts. The same list is chosen from in a room's settings and used from the first reply of a new chat
 * (the default one). The profile dialog and the story's start link here instead of keeping a second copy of the list.
 */
export function LoungePersonaPage({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest: () => void }) {
  const member = user && !user.isAnonymous ? user : null;
  return <main className="lounge-persona-page">
    <div className="lounge-persona-page-inner">
      <Link to="/lounge" className="lounge-persona-page-back"><ArrowLeft size={15} /> 사석</Link>
      <header>
        <span className="lounge-persona-page-eyebrow">MY PERSONA</span>
        <h1><UserCog size={26} aria-hidden="true" /> 내 페르소나</h1>
        <p>캐릭터와 1:1로 이야기할 때의 나를 미리 만들어 두세요. 부를 이름, 직업, 성격, 좋아하는 것을 적어 두면 캐릭터가 그런 사람으로 대하고, 어울릴 때 먼저 이야기해요.</p>
      </header>
      <ul className="lounge-persona-page-steps">
        <li><b>대화 전에</b> 만들어 두면 첫 인사부터 적용돼요. 기본 페르소나는 새 대화마다 자동으로 쓰여요.</li>
        <li><b>대화 중에는</b> 설정 › 대화 속 나에서 다른 페르소나를 고르거나 쓰지 않을 수 있어요.</li>
        <li>페르소나는 최대 {loungePersonaLimits.count}개까지 만들 수 있고, 언제든 고치거나 지울 수 있어요. 지워도 이미 한 대화는 그대로예요.</li>
      </ul>
      <section className="lounge-account-dialog lounge-persona-page-card" aria-label="내 페르소나 목록">
        {member ? <LoungePersonaManager />
          : <div className="lounge-persona-page-login">
            <p>페르소나는 로그인한 계정에 저장돼요. {user?.isAnonymous ? '게스트로는 만들 수 없어요.' : '로그인하면 만들 수 있어요.'}</p>
            <button type="button" className="btn btn-primary" onClick={onLoginRequest}>로그인하기</button>
          </div>}
      </section>
      <Link to="/lounge" className="lounge-persona-page-go"><MessageCircle size={16} /> 대화하러 가기</Link>
    </div>
  </main>;
}
