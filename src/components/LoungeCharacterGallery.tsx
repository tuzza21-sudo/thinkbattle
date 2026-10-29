import { useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { loadLoungeCharacterGallery, type LoungePhotoView } from '../lib/loungeGallery';
import { loungeCharacterGalleryPhotos } from '../lib/loungeCharacters';
import { useDialog } from '../lib/useDialog';

type Photo = { id: string; url: string; caption: string; created_at?: string };
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
const shown = (photo: LoungePhotoView): Photo => ({ id: photo.id, url: photo.url, caption: photo.caption ?? '', created_at: photo.created_at });

/** One photo over the page, with the ones before and after it. */
function GalleryViewer({ photos, index, name, onMove, onClose }: { photos: Photo[]; index: number; name: string; onMove: (index: number) => void; onClose: () => void }) {
  const closeButton = useDialog(onClose);
  const photo = photos[index];
  const move = (step: number) => onMove((index + step + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') move(-1); if (event.key === 'ArrowRight') move(1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return <div className="lounge-gallery-viewer" role="dialog" aria-modal="true" aria-label={`${name}의 사진 ${index + 1}/${photos.length}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button ref={closeButton} type="button" className="lounge-gallery-viewer-close" onClick={onClose} aria-label="닫기"><X size={20} /></button>
    <figure>
      <img src={photo.url} alt={photo.caption || `${name}의 사진`} />
      <figcaption>{photo.caption && <span>{photo.caption}</span>}<small>{index + 1} / {photos.length}{photo.created_at && ` · ${day(photo.created_at)}`}</small></figcaption>
    </figure>
    {photos.length > 1 && <>
      <button type="button" className="lounge-gallery-viewer-step prev" onClick={() => move(-1)} aria-label="이전 사진"><ChevronLeft size={24} /></button>
      <button type="button" className="lounge-gallery-viewer-step next" onClick={() => move(1)} aria-label="다음 사진"><ChevronRight size={24} /></button>
    </>}
  </div>;
}

/**
 * A character's gallery: photos from their own day for everyone (the ones that come with the page, shown at once, and
 * the daily posts), and the photos they sent this member in one-to-one conversations, which only the member sees. A
 * photo opens over the page.
 */
export function LoungeCharacterGallery({ characterId, name }: { characterId: string; name: string }) {
  const [gallery, setGallery] = useState<{ shared: LoungePhotoView[]; mine: LoungePhotoView[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'shared' | 'mine'>('shared');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLoungeCharacterGallery(characterId).then(value => { if (!cancelled) setGallery(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [characterId]);
  const own = (loungeCharacterGalleryPhotos[characterId] ?? []).map((photo, index): Photo => ({ id: `own-${index}`, url: photo.src, caption: photo.caption }));
  const lists = { shared: [...(gallery?.shared ?? []).map(shown), ...own], mine: (gallery?.mine ?? []).map(shown) };
  const photos = lists[tab];
  const empty = tab === 'shared' ? `${name}의 일상 사진이 아직 없어요. 하루에 한 장씩 올라와요.` : '1:1 대화에서 받은 사진이 여기에 모여요. 대화 중에 “지금 모습 보여줘”를 눌러 보세요.';
  const waiting = !gallery && !failed;
  return <section className="lounge-character-section lounge-character-gallery">
    <h2><Camera size={20} />갤러리</h2>
    <div className="lounge-gallery-tabs" role="tablist" aria-label="갤러리 종류">
      {(['shared', 'mine'] as const).map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setOpen(null); }}>
        {id === 'shared' ? '일상' : '나에게 보낸 사진'}{(gallery || id === 'shared') && <span>{lists[id].length}</span>}
      </button>)}
    </div>
    {photos.length > 0 && <div className="lounge-gallery-grid" role="tabpanel">{photos.map((photo, index) => <figure key={photo.id}>
      <button type="button" onClick={() => setOpen(index)} aria-label={`${photo.caption || `${name}의 사진`} 크게 보기`}><img src={photo.url} alt={photo.caption || `${name}의 사진`} loading="lazy" /></button>
      <figcaption>{photo.caption && <span>{photo.caption}</span>}{photo.created_at && <time dateTime={photo.created_at}>{day(photo.created_at)}</time>}</figcaption>
    </figure>)}</div>}
    {waiting ? <p className="lounge-gallery-empty"><LoaderCircle size={15} className="lounge-spin" /> {photos.length ? '사진을 더 불러오는 중…' : '사진을 불러오는 중…'}</p>
      : failed && tab === 'mine' ? <p className="lounge-gallery-empty">갤러리를 불러오지 못했어요. 잠시 뒤 다시 들러 주세요.</p>
      : !photos.length && <p className="lounge-gallery-empty">{empty}</p>}
    <small className="lounge-gallery-note">AI로 만든 가상의 인물 사진이에요. 대화에서 받은 사진은 나만 볼 수 있어요.</small>
    {open !== null && photos[open] && <GalleryViewer photos={photos} index={open} name={name} onMove={setOpen} onClose={() => setOpen(null)} />}
  </section>;
}
