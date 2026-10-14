import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import type { AppUser, AppUserGender } from '../types';
import { saveLoungeProfile, saveUserGender } from '../lib/auth';
import { LoungeAccountDialog } from './LoungeAccountDialog';
import { LoungeProfileFields, type LoungeProfileFieldsValue } from './LoungeProfileFields';

/**
 * Gender, age group, region and introduction are required of every member. Email signup asks for them on the form;
 * a member who came in through Kakao or Google, or joined before they were required, fills them in here before the lounge opens.
 */
export function ProfileCompletionDialog({ user, onSaved, onLogout }: { user: AppUser; onSaved: (user: AppUser) => void; onLogout: () => void }) {
  const [gender, setGender] = useState<AppUserGender | null>(user.gender ?? null);
  const [fields, setFields] = useState<LoungeProfileFieldsValue>({ ageGroup: user.ageGroup ?? '', region: user.region ?? '', bio: user.bio ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy) return;
    if (!gender) { setError('성별을 선택해 주세요.'); return; }
    if (!fields.ageGroup) { setError('나이대를 선택해 주세요.'); return; }
    if (!fields.region.trim()) { setError('지역을 입력해 주세요.'); return; }
    if (!fields.bio.trim()) { setError('자기소개를 적어 주세요.'); return; }
    setBusy(true); setError('');
    try {
      const withGender = user.gender === gender ? user : await saveUserGender(user, gender);
      onSaved(await saveLoungeProfile(withGender, fields));
    } catch (err) { setError(err instanceof Error ? err.message : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); setBusy(false); }
  };
  return <LoungeAccountDialog title="내 소개를 채워 주세요" description="대화를 시작하기 전에 성별, 나이대, 지역, 자기소개를 입력해 주세요. 한 번만 하면 돼요." eyebrow="ONE LAST STEP" onClose={onLogout} dismissible={false} displayName={user.nickname} avatarUrl={user.loungeAvatarUrl}>
    <form className="lounge-account-form" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <fieldset className="form-field lounge-account-gender" disabled={busy}><legend>성별<em className="lounge-required"> 필수</em></legend><div>
        {(['female', 'male'] as const).map(value => <label key={value}><input type="radio" name="complete-gender" value={value} checked={gender === value} onChange={() => setGender(value)} required /><span>{value === 'female' ? '여성' : '남성'}</span></label>)}
      </div><small className="lounge-account-field-note">대화방에는 참가자 성별이 인원수로만 표시돼요.</small></fieldset>
      <LoungeProfileFields value={fields} onChange={setFields} disabled={busy} required />
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary lounge-account-submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="lounge-spin" /> : null}{busy ? '저장 중…' : '저장하고 시작하기'}{!busy && <ArrowRight size={17} />}</button>
      <button type="button" className="avatar-text-button" onClick={onLogout} disabled={busy}>로그아웃</button>
    </form>
  </LoungeAccountDialog>;
}
