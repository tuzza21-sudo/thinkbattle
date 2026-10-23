import { useEffect, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { loadLoungeCharacterGallery, type LoungePhotoView } from '../lib/loungeGallery';

const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/**
 * A character's gallery: photos from their own day, posted for everyone (the start of their social feed), and the
 * photos they sent this member in one-to-one conversations, which only the member sees.
 */
export function LoungeCharacterGallery({ characterId, name }: { characterId: string; name: string }) {
  const [gallery, setGallery] = useState<{ shared: LoungePhotoView[]; mine: LoungePhotoView[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'shared' | 'mine'>('shared');
  useEffect(() => {
    let cancelled = false;
    loadLoungeCharacterGallery(characterId).then(value => { if (!cancelled) setGallery(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [characterId]);
  const photos = gallery ? gallery[tab] : [];
  const empty = tab === 'shared' ? `${name}의 일상 사진이 아직 없어요. 하루에 한 장씩 올라와요.` : '1:1 대화에서 받은 사진이 여기에 모여요. 대화 중에 “지금 모습 보여줘”를 눌러 보세요.';
  return <section className="lounge-character-section lounge-character-gallery">
    <h2><Camera size={20} />갤러리</h2>
    <div className="lounge-gallery-tabs" role="tablist" aria-label="갤러리 종류">
      {(['shared', 'mine'] as const).map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
        {id === 'shared' ? '일상' : '나에게 보낸 사진'}{gallery && <span>{gallery[id].length}</span>}
      </button>)}
    </div>
    {failed ? <p className="lounge-gallery-empty">갤러리를 불러오지 못했어요. 잠시 뒤 다시 들러 주세요.</p>
      : !gallery ? <p className="lounge-gallery-empty"><LoaderCircle size={15} className="lounge-spin" /> 사진을 불러오는 중…</p>
      : !photos.length ? <p className="lounge-gallery-empty">{empty}</p>
      : <div className="lounge-gallery-grid" role="tabpanel">{photos.map(photo => <figure key={photo.id}>
        <a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.caption || `${name}의 사진`} loading="lazy" /></a>
        <figcaption>{photo.caption && <span>{photo.caption}</span>}<time dateTime={photo.created_at}>{day(photo.created_at)}</time></figcaption>
      </figure>)}</div>}
    <small className="lounge-gallery-note">AI로 만든 가상의 인물 사진이에요. 대화에서 받은 사진은 나만 볼 수 있어요.</small>
  </section>;
}
