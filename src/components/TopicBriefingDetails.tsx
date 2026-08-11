import { BookOpen, ExternalLink, Newspaper, Scale, Sparkles } from 'lucide-react';
import type { TopicBriefing } from '../types';

export const TopicBriefingDetails = ({
  briefing,
  initiallyOpen = false,
  language = 'ko',
  embedded = false,
}: {
  briefing: TopicBriefing;
  initiallyOpen?: boolean;
  language?: 'ko' | 'en';
  embedded?: boolean;
}) => {
  const content = (
    <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: '1rem' }}>
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="flex items-center gap-2"><BookOpen size={18} color="var(--primary)" /> {language === 'en' ? 'Background' : '배경 설명'}</h3>
          <p style={{ color: 'var(--text-main)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{briefing.context}</p>
        </section>
        {!!briefing.recentCases?.length && (
          <section>
            <h3 className="flex items-center gap-2"><Newspaper size={18} color="var(--accent-amber)" /> {language === 'en' ? 'Cases and factual considerations' : '확인할 사례와 사실'}</h3>
            <ul className="topic-briefing-fact-list" style={{ color: 'var(--text-main)', lineHeight: 1.7 }}>
              {briefing.recentCases.map(item => <li key={item}>{item}</li>)}
            </ul>
          </section>
        )}
        <section>
          <h3 className="flex items-center gap-2"><Scale size={18} color="var(--secondary)" /> {language === 'en' ? 'Key arguments' : '찬반 핵심 논점'}</h3>
          {[briefing.affirmative, briefing.negative].map(side => (
            <div key={side.title} className="topic-briefing-side" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '.8rem', marginBottom: '1rem' }}>
              <strong>{side.title}</strong>
              <ul style={{ color: 'var(--text-main)', lineHeight: 1.65 }}>
                {side.points.map(point => <li key={point}>{point}</li>)}
              </ul>
            </div>
          ))}
        </section>
      </div>
      <aside className="flex flex-col gap-6">
        {!!briefing.newsLinks?.length && (
          <section>
            <h3 className="flex items-center gap-2"><ExternalLink size={18} color="var(--primary)" /> {language === 'en' ? 'Related coverage' : '관련 배경 기사'}</h3>
            <div className="flex flex-col gap-2">
              {briefing.newsLinks.map(link => (
                <a key={`${link.label}-${link.url}`} className="btn btn-secondary" href={link.url} target="_blank" rel="noreferrer" style={{ justifyContent: 'space-between', textDecoration: 'none' }}>
                  {link.label}<ExternalLink size={15} />
                </a>
              ))}
            </div>
          </section>
        )}
        {!!briefing.prepQuestions?.length && (
          <section>
            <h3 className="flex items-center gap-2"><Sparkles size={18} color="var(--secondary)" /> {language === 'en' ? 'Questions before the debate' : '토론 전 질문'}</h3>
            <ol style={{ color: 'var(--text-main)', lineHeight: 1.7 }}>
              {briefing.prepQuestions.map(question => <li key={question}>{question}</li>)}
            </ol>
          </section>
        )}
      </aside>
    </div>
  );

  if (embedded) return <div className="topic-briefing-embedded">{content}</div>;

  return (
    <details className="card" open={initiallyOpen} style={{ padding: '1rem 1.2rem', margin: '1rem 0' }}>
      <summary style={{ cursor: 'pointer', color: 'var(--text-light)', fontWeight: 800 }}>
        <BookOpen size={17} style={{ marginRight: '.45rem', verticalAlign: 'text-bottom' }} />
        {language === 'en' ? 'View background and key arguments' : '토론 배경과 찬반 쟁점 보기'}
      </summary>
      {content}
    </details>
  );
};
