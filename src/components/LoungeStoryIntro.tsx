import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { personalizeLoungeStory, storyIntroBlocks, type LoungeRoomScenario } from '../lib/loungeScenarios';

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
};

/**
 * A story's prologue, full screen before the first scene (2026-10-25): it used to be a box at the top of the chat that
 * the character's first line pushed away. Blocks of several paragraphs come in one after another (a tap shows the rest at once), and the
 * character speaks only once the member starts the story. On a phone it fills the screen and scrolls; on a computer it
 * is a column over the scenery.
 */
export function LoungeStoryIntro({ scenario, characterName, portrait, image, accent, memberName, onStart }: Props) {
  const blocks = storyIntroBlocks(personalizeLoungeStory(scenario.prologue, memberName).split(/\n+/).map(paragraph => paragraph.trim()).filter(Boolean));
  const [shown, setShown] = useState(1);
  const startButton = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // While paragraphs come in one by one the page follows the newest; a tap that shows the rest leaves the reader where they are.
  const following = useRef(true);
  const done = shown >= blocks.length;
  useEffect(() => {
    if (done) return;
    // The first block is there at once; each next one follows after 1.4 s, long enough to read the start of it.
    const timer = setTimeout(() => setShown(count => count + 1), 1400);
    return () => clearTimeout(timer);
  }, [shown, done]);
  useEffect(() => { if (done) startButton.current?.focus({ preventScroll: true }); }, [done]);
  useEffect(() => {
    const element = scroller.current;
    if (element && following.current && shown > 1) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [shown]);
  const showAll = () => { following.current = false; setShown(blocks.length); };
  const style = { '--story-intro-image': `url('${image}')`, '--story-intro-accent': accent } as CSSProperties;
  return <div className="lounge-story-intro" role="dialog" aria-modal="true" aria-labelledby="lounge-story-intro-title" style={style}
    onClick={showAll}>
    <div className="lounge-story-intro-scroll" ref={scroller}>
      <article className="lounge-story-intro-page">
        <header>
          <img src={portrait} alt="" />
          <div><span>프롤로그 · {characterName}</span><h1 id="lounge-story-intro-title">{scenario.title}</h1></div>
        </header>
        {blocks.slice(0, shown).map((block, index) => <div key={index} className="lounge-story-intro-block">{block.map((paragraph, line) =>
          <p key={line} className={/^["“]/.test(paragraph) ? 'lounge-story-intro-line' : undefined}>{paragraph}</p>)}</div>)}
        {!done && <span className="lounge-story-intro-more" aria-hidden="true">화면을 누르면 끝까지 볼 수 있어요</span>}
      </article>
    </div>
    <footer className="lounge-story-intro-footer" onClick={event => event.stopPropagation()}>
      <small>{personalizeLoungeStory('당신의 역할', memberName)} · {personalizeLoungeStory(scenario.user_role, memberName)}</small>
      <button ref={startButton} type="button" className="lounge-story-intro-start" onClick={done ? onStart : showAll}>
        {done ? <>이야기 시작하기 <ArrowRight size={17} /></> : '끝까지 보기'}
      </button>
    </footer>
  </div>;
}
