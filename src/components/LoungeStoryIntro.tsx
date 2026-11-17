import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { personalizeLoungeStory, storyPageParagraphs, type LoungeRoomScenario } from '../lib/loungeScenarios';
import type { CSSProperties } from 'react';

type Props = {
  scenario: LoungeRoomScenario;
  characterName: string;
  portrait: string;
  /** The room's scenery behind the text, and its accent colour. */
  image: string;
  accent: string;
  /** The member's nickname, told in place of "당신". */
  memberName?: string;
  onStart: () => void;
  /** The word before the character's name ("프롤로그", or the episode for a story in episodes). */
  kicker?: string;
  startLabel?: string;
};

/**
 * A story's prologue, full screen before the first scene. Since 2026-11-17 it is one page: the whole text is there at once,
 * every prologue cut into the same kind of paragraphs (storyPageParagraphs), and the member reads down the page at their
 * own speed and starts the story with the button below. (It was told block by block, each after a wait, which was slow
 * and looked different from one story to the next.) The character speaks only once the member has started and written.
 * On a phone it fills the screen and scrolls; on a computer it is a column over the scenery.
 */
export function LoungeStoryIntro({ scenario, characterName, portrait, image, accent, memberName, onStart, kicker = '프롤로그', startLabel = '이야기 시작하기' }: Props) {
  const paragraphs = storyPageParagraphs(personalizeLoungeStory(scenario.prologue, memberName));
  const startButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { startButton.current?.focus({ preventScroll: true }); }, []);
  const style = { '--story-intro-image': `url('${image}')`, '--story-intro-accent': accent } as CSSProperties;
  return <div className="lounge-story-intro" role="dialog" aria-modal="true" aria-labelledby="lounge-story-intro-title" style={style}>
    <div className="lounge-story-intro-scroll">
      <article className="lounge-story-intro-page">
        <header>
          <img src={portrait} alt="" />
          <div><span>{kicker} · {characterName}</span><h1 id="lounge-story-intro-title">{scenario.title}</h1></div>
        </header>
        {paragraphs.map((paragraph, index) => <p key={index} className={paragraph.kind === 'line' ? 'lounge-story-intro-line' : paragraph.kind === 'note' ? 'lounge-story-intro-note' : undefined}>{paragraph.text}</p>)}
      </article>
    </div>
    <footer className="lounge-story-intro-footer">
      <small>{personalizeLoungeStory('당신의 역할', memberName)} · {personalizeLoungeStory(scenario.user_role, memberName)}</small>
      <button ref={startButton} type="button" className="lounge-story-intro-start" onClick={onStart}>{startLabel} <ArrowRight size={17} /></button>
    </footer>
  </div>;
}
