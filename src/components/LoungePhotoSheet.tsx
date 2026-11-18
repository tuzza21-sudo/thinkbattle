import { useEffect, useId, useState } from 'react';
import { LoaderCircle, Trash2, X } from 'lucide-react';
import { deleteLoungePhoto } from '../lib/loungeApi';
import { loadLoungeCharacterGallery, type LoungePhotoView } from '../lib/loungeGallery';
import './LoungePhotoSheet.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
/** The longest description of a photo the member can write (the server cuts the same). */
export const loungePhotoRequestLimit = 500;

/**
 * The member describes the photo they want (2026-11-18): the place, the clothes, the pose, the look, the light, the framing.
 * The character writes the scene from it, as close to the words as the rules for a photo allow (an adult, dressed, nothing sexual).
 * Left empty it is the usual "what are you doing now".
 */
export function LoungePhotoRequestSheet({ name, left, onSubmit, onClose }: { name: string; left?: number; onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <>
    <div className="lounge-background-backdrop" onClick={onClose} />
    <section className="lounge-background-sheet lounge-photo-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>{name}에게 사진 부탁하기</b><button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button></header>
      <form className="lounge-photo-form" onSubmit={event => { event.preventDefault(); onSubmit(text.trim()); }}>
        <label>
          <span>어떤 사진을 원해요?</span>
          <textarea rows={6} maxLength={loungePhotoRequestLimit} value={text} onChange={event => setText(event.target.value)} autoFocus
            placeholder={'장소, 옷차림과 색, 자세, 표정, 시간대와 빛, 구도를 자세히 적을수록 그대로 담겨요.\n예: 비 오는 저녁 창가 자리에서 베이지 트렌치코트를 입고 와인잔을 든 채, 고개를 살짝 기울여 웃는 모습. 가까이서 찍은 느낌으로'} />
        </label>
        <small className="lounge-photo-count">{text.length} / {loungePhotoRequestLimit}자 · 비워 두면 지금 모습을 보내 줘요</small>
        <small>성인이 옷을 갖춰 입은 일상 사진만 만들 수 있어요. 노출이나 성적인 장면은 일상적인 모습으로 바뀌어요.</small>
        {typeof left === 'number' && <small className="lounge-photo-left">오늘 받을 수 있는 사진 {left}장 남았어요</small>}
        <div className="lounge-photo-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" className="primary" disabled={left === 0}>사진 받기</button></div>
      </form>
    </section>
  </>;
}

/** The photos this character sent the member, kept automatically; the member can look at them and delete them. */
export function LoungePhotoGallerySheet({ characterId, name, onClose, onDeleted }: { characterId: string; name: string; onClose: () => void; onDeleted?: (id: string) => void }) {
  const [photos, setPhotos] = useState<LoungePhotoView[] | null>(null);
  const [open, setOpen] = useState<LoungePhotoView | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const titleId = useId();
  useEffect(() => {
    let cancelled = false;
    loadLoungeCharacterGallery(characterId).then(value => { if (!cancelled) setPhotos(value.mine); }, err => { if (!cancelled) { setPhotos([]); setError(errorText(err)); } });
    return () => { cancelled = true; };
  }, [characterId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { if (open) setOpen(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose, open]);
  const remove = async (photo: LoungePhotoView) => {
    if (!window.confirm('이 사진을 지울까요? 지운 사진은 되돌릴 수 없어요. (오늘 받을 수 있는 장수는 늘어나지 않아요)')) return;
    setBusy(photo.id); setError('');
    try {
      await deleteLoungePhoto(photo.id);
      setPhotos(list => (list ?? []).filter(item => item.id !== photo.id));
      setOpen(current => current?.id === photo.id ? null : current);
      onDeleted?.(photo.id);
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-photo-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>{name}이(가) 보낸 사진</b><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button></header>
      {!photos ? <p className="lounge-memory-empty"><LoaderCircle size={15} className="lounge-spin" /> 불러오는 중…</p>
        : photos.length ? <div className="lounge-gallery-grid lounge-photo-grid">{photos.map(photo => <figure key={photo.id}>
          <button type="button" onClick={() => setOpen(photo)} aria-label={`${photo.caption || `${name}의 사진`} 크게 보기`}><img src={photo.url} alt={photo.caption || `${name}의 사진`} loading="lazy" /></button>
          <figcaption>{photo.caption && <span>{photo.caption}</span>}<time dateTime={photo.created_at}>{day(photo.created_at)}</time></figcaption>
          <button type="button" className="lounge-photo-delete" title="지우기" aria-label="이 사진 지우기" disabled={Boolean(busy)} onClick={() => void remove(photo)}>{busy === photo.id ? <LoaderCircle size={14} className="lounge-spin" /> : <Trash2 size={14} />}</button>
        </figure>)}</div>
          : <p className="lounge-memory-empty">아직 받은 사진이 없어요. 대화 중에 “사진 받기”로 원하는 사진을 부탁해 보세요. 받은 사진은 여기에 자동으로 모여요.</p>}
      {error && <p className="lounge-memory-error" role="alert">{error}</p>}
      <small className="lounge-memory-fine">AI로 만든 가상의 인물 사진이에요. 나만 볼 수 있어요.</small>
      {open && <div className="lounge-photo-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={event => { if (event.target === event.currentTarget) setOpen(null); }}>
        <button type="button" className="lounge-photo-viewer-close" onClick={() => setOpen(null)} aria-label="닫기"><X size={20} /></button>
        <figure><img src={open.url} alt={open.caption || `${name}의 사진`} />{open.caption && <figcaption>{open.caption}</figcaption>}</figure>
      </div>}
    </section>
  </>;
}
