import { useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, Sparkles } from 'lucide-react';
import type { AppUser } from '../types';
import { generateLoungeAvatar, saveLoungeAvatar, validateAvatarFile, type AvatarImage } from '../lib/loungeAvatar';
import './LoungeAvatarEditor.css';

export function AvatarPhotoInput({ file, onChange, disabled = false, language = 'ko' }: { file: File | null; onChange: (file: File | null) => void; disabled?: boolean; language?: 'ko' | 'en' }) {
  const preview = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const en = language === 'en';
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); if (preview.current) preview.current.src = url; return () => URL.revokeObjectURL(url); }, [file]);
  return <div className="avatar-photo-input"><label><span className="avatar-photo-thumb">{file ? <img ref={preview} alt={en ? 'Selected photo' : '선택한 사진'} /> : <Camera size={24} />}</span><span><strong>{en ? 'Add your photo' : '내 사진 첨부'}</strong><small>{file ? file.name : en ? 'One clear face · JPG, PNG, WebP · up to 10MB' : '혼자 나온 선명한 얼굴 · JPG, PNG, WebP · 10MB 이하'}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label={en ? 'Profile photo' : '프로필 사진 첨부'} onChange={event => { const selected = event.target.files?.[0]; setError(''); if (selected) { try { validateAvatarFile(selected); onChange(selected); } catch (err) { setError(err instanceof Error ? err.message : '사진을 확인해 주세요.'); } } event.target.value = ''; }} /></label>{file && <button type="button" className="avatar-text-button" disabled={disabled} onClick={() => onChange(null)}>{en ? 'Remove photo' : '사진 지우기'}</button>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

export function LoungeAvatarEditor({ user, initialFile = null, onSaved, language = 'ko' }: { user: AppUser; initialFile?: File | null; onSaved: (user: AppUser) => void; language?: 'ko' | 'en' }) {
  const en = language === 'en';
  const [file, setFile] = useState<File | null>(initialFile);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<AvatarImage | null>(null);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
  const generate = async () => {
    if (!file || !consent || busy) return;
    setBusy('generate'); setError(''); setSaved(false);
    const controller = new AbortController(); abort.current = controller;
    try { const image = await generateLoungeAvatar(file, controller.signal); if (alive.current && !controller.signal.aborted) setResult(image); }
    catch (err) { if (alive.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : '사진 변환에 실패했어요.'); }
    finally { if (alive.current) setBusy(null); }
  };
  const save = async () => {
    if (!result || busy) return;
    setBusy('save'); setError('');
    try { const updated = await saveLoungeAvatar(user, result); if (alive.current) { setSaved(true); onSaved(updated); } }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : '아바타 저장에 실패했어요.'); }
    finally { if (alive.current) setBusy(null); }
  };
  return <section className="lounge-avatar-editor" aria-label={en ? 'Lounge profile avatar' : '라운지 프로필 아바타'}>
    <div className="avatar-editor-heading"><span><Sparkles size={16} /> YOUR LOUNGE PORTRAIT</span><h3>{en ? 'An avatar that looks like you' : '나를 닮은 라운지 아바타'}</h3><p>{en ? 'Keep your distinctive features with a subtle illustrated finish. Review the result before sharing.' : '얼굴의 개성은 살리고, 분위기는 부드럽게. 결과를 직접 확인한 뒤 라운지에 적용하세요.'}</p></div>
    <AvatarPhotoInput file={file} disabled={!!busy} language={language} onChange={value => { setFile(value); setResult(null); setSaved(false); setError(''); setConsent(false); }} />
    <label className="avatar-photo-consent"><input type="checkbox" checked={consent} disabled={!!busy} onChange={event => setConsent(event.target.checked)} /><span>{en ? 'This is my photo. I agree to send it to Google AI for conversion. Only the avatar I approve will be stored and shown to lounge participants. A recognizable avatar does not guarantee anonymity.' : '본인 사진이며 Google AI에 전송해 변환하는 데 동의합니다. 원본 사진은 서비스에 저장하지 않으며, 승인한 아바타만 저장해 라운지 참가자에게 보여 줍니다. 닮은 아바타는 완전한 익명성을 보장하지 않습니다.'}</span></label>
    <button type="button" className="btn btn-secondary avatar-generate" disabled={!file || !consent || !!busy} onClick={() => void generate()}>{busy === 'generate' ? <LoaderCircle size={17} className="lounge-spin" /> : <Sparkles size={17} />}{busy === 'generate' ? en ? 'Creating your avatar…' : '나를 닮은 아바타 만드는 중…' : en ? result ? 'Try again' : 'Create avatar' : result ? '다시 변환하기' : '내 사진으로 아바타 만들기'}</button>
    <small className="avatar-usage-note">{en ? 'Up to 3 attempts per day. May take about a minute. Failed attempts count toward the limit.' : '하루 3회까지 · 약 1분 정도 걸릴 수 있어요 · 실패한 시도도 횟수에 포함됩니다.'}</small>
    {result && <div className="avatar-result"><img src={`data:${result.mimeType};base64,${result.image}`} alt={en ? 'Generated avatar preview' : '변환된 아바타 미리보기'} /><p>{en ? 'Does this feel like you?' : '나를 닮았나요?'}</p><button type="button" className="btn btn-primary" disabled={!!busy || saved || !consent} onClick={() => void save()}>{busy === 'save' ? <LoaderCircle size={16} className="lounge-spin" /> : <Check size={16} />}{saved ? en ? 'Avatar saved' : '프로필에 적용했어요' : en ? 'Use this avatar' : '이 아바타로 프로필 적용'}</button></div>}
    {!file && user.loungeAvatarUrl && <img className="avatar-current" src={user.loungeAvatarUrl} alt={en ? 'Current avatar' : '현재 라운지 아바타'} />}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
