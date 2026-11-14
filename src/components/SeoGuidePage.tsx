import { Coffee } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { loungeCharacters } from '../lib/loungeCharacters';
import { seoCharacterPortrait, seoGuideByPath, seoGuides, seoVirtualNotice } from '../lib/seoContent';
import { LoungeBusinessFooter } from './LoungeBusinessFooter';
import './SeoGuidePage.css';

/**
 * The keyword pages (AI companion, AI call, voice chat, character chat): the same text the build writes into the static
 * HTML for search engines and AI answer engines, so a visitor reads what a crawler read.
 */
export function SeoGuidePage() {
  const { pathname } = useLocation();
  const guide = seoGuideByPath(pathname.replace(/\/+$/, ''));
  if (!guide) return null;
  return <main className="seo-guide page-scroll">
    <header className="seo-guide-top">
      <Link to="/lounge" className="seo-guide-brand"><Coffee size={22} /><strong>사석<span>진짜 대화는 사석에서</span></strong></Link>
      <Link to="/lounge" className="seo-guide-start">대화 시작하기</Link>
    </header>
    <article className="seo-guide-body">
      <h1>{guide.h1}</h1>
      <p className="seo-guide-lead">{guide.lead}</p>
      {guide.sections.map(section => <section key={section.heading}>
        <h2>{section.heading}</h2>
        {section.paragraphs.map(text => <p key={text}>{text}</p>)}
        {section.bullets && <ul>{section.bullets.map(text => <li key={text}>{text}</li>)}</ul>}
      </section>)}
      {guide.showCast && <section>
        <h2>사석의 캐릭터</h2>
        <ul className="seo-guide-cast">
          {loungeCharacters.map(character => <li key={character.id}>
            <Link to={`/lounge/characters/${character.id}`}>
              <img src={seoCharacterPortrait(character)} alt={`${character.name}, ${character.job}. AI로 만든 가상의 캐릭터`} width="72" height="72" loading="lazy" />
              <span><strong>{character.name}</strong><em>{character.job}</em></span>
            </Link>
          </li>)}
        </ul>
      </section>}
      <section>
        <h2>자주 묻는 질문</h2>
        <dl className="seo-guide-faq">
          {guide.faq.map(item => <div key={item.question}><dt>{item.question}</dt><dd>{item.answer}</dd></div>)}
        </dl>
      </section>
      <p className="seo-guide-notice">{seoVirtualNotice}</p>
      <nav className="seo-guide-related" aria-label="함께 보면 좋은 안내">
        <b>함께 보면 좋은 안내</b>
        {guide.related.map(path => <Link key={path} to={path}>{seoGuides.find(item => item.path === path)?.label}</Link>)}
        <Link to="/lounge">사석 홈</Link>
      </nav>
      <Link to="/lounge" className="seo-guide-cta">지금 캐릭터 만나러 가기</Link>
    </article>
    <LoungeBusinessFooter />
  </main>;
}
