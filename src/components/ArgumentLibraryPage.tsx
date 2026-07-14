import React, { useEffect, useState } from 'react';
import { BookOpen, Lightbulb } from 'lucide-react';
import { getPublicArguments } from '../lib/argumentLibrary';
import type { PublicArgument } from '../types';

export const ArgumentLibraryPage: React.FC = () => {
  const [items, setItems] = useState<PublicArgument[]>([]);
  useEffect(() => { void getPublicArguments().then(setItems); }, []);
  return <main className="app-container page-scroll shared-report-page">
    <section className="shared-report-sheet">
      <header className="report-hero shared-report-hero"><div className="report-hero-bg" /><div className="report-hero-content" style={{ position: 'relative' }}><BookOpen size={24} color="var(--primary)" /><h1 className="report-title">익명 논증 아카이브</h1><p className="report-subtitle">완료된 토론에서 사용자가 직접 공개한 주장·이유·근거입니다.</p></div></header>
      {items.length === 0 ? <section className="report-panel">아직 공개된 논증이 없습니다.</section> : items.map(item => <article className="report-panel" key={item.id}>
        <div className="report-transcript-meta"><strong>{item.anonymousName}</strong><em>{item.position === 'affirmative' ? '찬성' : '반대'}</em></div>
        <h2 style={{ marginTop: '0.8rem' }}>{item.topic}</h2>
        <p><b>핵심 주장</b><br />{item.claim}</p><p><b>이유</b><br />{item.reason}</p><p><b>근거</b><br />{item.evidence}</p>
      </article>)}
      <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}><Lightbulb size={15} /> 참고용 논증입니다. 자신의 관점과 근거로 다시 검증해 보세요.</p>
    </section>
  </main>;
};
