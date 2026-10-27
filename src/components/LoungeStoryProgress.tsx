import { useState } from 'react';
import { BookOpen, Check, ChevronDown, Circle } from 'lucide-react';
import type { LoungeStoryEpisode, LoungeStoryState } from '../lib/loungeStory';

/**
 * Where a story in episodes stands, at the top of its chat: the episode and how many of its moments have happened, and on a
 * tap the list of them (what to do, ticked when done). The labels are written for the member, so they guide without
 * telling the story ahead.
 */
export function LoungeStoryProgress({ title, episodes, state }: { title: string; episodes: readonly LoungeStoryEpisode[]; state: LoungeStoryState }) {
  const [open, setOpen] = useState(false);
  const episode = episodes[state.episode];
  if (!episode) return null;
  const done = new Set(state.done), count = episode.checkpoints.filter(point => done.has(point.id)).length;
  const allDone = count === episode.checkpoints.length;
  return <div className={`lounge-story-progress ${open ? 'open' : ''}`}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <BookOpen size={14} />
      <span><b>{title} · {episode.number}화</b> <small>/ {episodes.length}화</small> {episode.title}</span>
      <i aria-label={`이번 화 ${count}/${episode.checkpoints.length}`}>{episode.checkpoints.map(point => <em key={point.id} className={done.has(point.id) ? 'done' : ''} />)}</i>
      <ChevronDown size={14} className="chevron" />
    </button>
    {open && <div className="lounge-story-progress-list">
      <p>{state.complete ? '이야기가 끝났어요. 여운이 남는 대화를 이어 가도 좋아요.' : allDone ? '이번 화의 일이 모두 이뤄졌어요. 대화를 이어 가면 이 화가 끝나고 다음 화가 열려요.' : '대화 속에서 이런 순간이 오면 다음 화로 넘어가요. 대화 상대가 이끌어 줄 거예요.'}</p>
      <ol>{episode.checkpoints.map(point => <li key={point.id} className={done.has(point.id) ? 'done' : ''}>{done.has(point.id) ? <Check size={14} /> : <Circle size={14} />}{point.label}</li>)}</ol>
    </div>}
  </div>;
}
