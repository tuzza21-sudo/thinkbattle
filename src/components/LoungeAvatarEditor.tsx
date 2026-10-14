import { useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, UserRound } from 'lucide-react';
import type { AppUser } from '../types';
import { saveLoungeAvatar, validateAvatarFile } from '../lib/loungeAvatar';
import './LoungeAvatarEditor.css';

export function AvatarPhotoInput({ file, onChange, disabled = false, language = 'ko' }: { file: File | null; onChange: (file: File | null) => void; disabled?: boolean; language?: 'ko' | 'en' }) {
  const preview = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const en = language === 'en';
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); if (preview.current) preview.current.src = url; return () => URL.revokeObjectURL(url); }, [file]);
  return <div className="avatar-photo-input"><label><span className="avatar-photo-thumb">{file ? <img ref={preview} alt={en ? 'Selected photo' : '선택한 사진'} /> : <Camera size={24} />}</span><span><strong>{en ? 'Choose a photo' : '프로필 사진 선택'}</strong><small>{file ? file.name : en ? 'Cropped to a square · JPG, PNG, WebP · up to 10MB' : '정사각형으로 잘려요 · JPG, PNG, WebP · 10MB 이하'}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label={en ? 'Profile photo' : '프로필 사진 첨부'} onChange={event => { const selected = event.target.files?.[0]; setError(''); if (selected) { try { validateAvatarFile(selected); onChange(selected); } catch (err) { setError(err instanceof Error ? err.message : '사진을 확인해 주세요.'); } } event.target.value = ''; }} /></label>{file && <button type="button" className="avatar-text-button" disabled={disabled} onClick={() => onChange(null)}>{en ? 'Remove photo' : '사진 지우기'}</button>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

export function LoungeAvatarEditor({ user, initialFile = null, onSaved, language = 'ko' }: { user: AppUser; initialFile?: File | null; onSaved: (user: AppUser) => void; language?: 'ko' | 'en' }) {
  const en = language === 'en';
  const [file, setFile] = useState<File | null>(initialFile);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async () => {
    if (!file || !consent || busy) return;
    setBusy(true); setError('');
    try { const updated = await saveLoungeAvatar(user, file); if (alive.current) { setSaved(true); onSaved(updated); } }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : '사진 저장에 실패했어요.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <section className="lounge-avatar-editor" aria-label={en ? 'Lounge profile photo' : '라운지 프로필 사진'}>
    <div className="avatar-editor-heading"><span><UserRound size={16} /> YOUR LOUNGE PHOTO</span><h3>{en ? 'Profile photo' : '프로필 사진'}</h3><p>{en ? 'This is the picture shown at your seat in the lounge. It does not have to be your face: a character, a landscape or a pet works too.' : '라운지에서 내 자리에 보이는 사진이에요. 본인 얼굴이 아니어도 괜찮아요. 캐릭터, 풍경, 반려동물 사진도 좋아요.'}</p></div>
    <AvatarPhotoInput file={file} disabled={busy} language={language} onChange={value => { setFile(value); setSaved(false); setError(''); setConsent(false); }} />
    <label className="avatar-photo-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{en ? 'I agree that this photo is shown as it is to lounge participants. It is resized and stored privately and is not sent to any AI service. A photo of a face can be recognized.' : '이 사진이 라운지 참가자에게 그대로 보이는 데 동의합니다. 사진은 줄여서 비공개로 저장하며 외부 AI로 보내지 않습니다. 얼굴이 나온 사진은 알아볼 수 있어요.'}</span></label>
    <button type="button" className="btn btn-primary avatar-generate" disabled={!file || !consent || busy || saved} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="lounge-spin" /> : <Check size={16} />}{saved ? en ? 'Photo saved' : '프로필에 적용했어요' : en ? 'Use this photo' : '이 사진으로 프로필 적용'}</button>
    {!file && user.loungeAvatarUrl && <img className="avatar-current" src={user.loungeAvatarUrl} alt={en ? 'Current profile photo' : '현재 프로필 사진'} />}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
