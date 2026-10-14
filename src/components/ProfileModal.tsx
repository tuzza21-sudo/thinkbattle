import React, { useState } from 'react';
import { Check, LoaderCircle, Mail, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppUser } from '../types';
import { LoungeAvatarEditor } from './LoungeAvatarEditor';
import { LoungeAccountDialog } from './LoungeAccountDialog';
import { LoungeProfileFields, type LoungeProfileFieldsValue } from './LoungeProfileFields';
import { saveLoungeProfile } from '../lib/auth';

interface ProfileModalProps {
  user: AppUser;
  onClose: () => void;
  onProfileUpdated: (updatedUser: AppUser) => void;
  serviceName?: string;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose, onProfileUpdated, serviceName = '생각근육' }) => {
  const [nickname, setNickname] = useState(user.nickname);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fields, setFields] = useState<LoungeProfileFieldsValue>({ ageGroup: user.ageGroup ?? '', region: user.region ?? '', bio: user.bio ?? '' });
  const [showPresence, setShowPresence] = useState(user.showPresence !== false);
  const [introState, setIntroState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [introError, setIntroError] = useState('');

  const saveIntroduction = async () => {
    if (introState === 'saving') return;
    if (!fields.ageGroup || !fields.region.trim() || !fields.bio.trim()) { setIntroError('나이대, 지역, 자기소개는 비워 둘 수 없어요.'); return; }
    setIntroState('saving'); setIntroError('');
    try { onProfileUpdated(await saveLoungeProfile(user, { ...fields, showPresence })); setIntroState('saved'); }
    catch (err) { setIntroError(err instanceof Error ? err.message : '프로필을 저장하지 못했어요.'); setIntroState('idle'); }
  };

  const handleSave = async () => {
    if (loading) return;
    setError('');
    setSuccess(false);
    
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError('닉네임을 입력해 주세요.');
      return;
    }
    
    if (trimmedNickname.length > 20) {
      setError('닉네임은 최대 20자까지 가능합니다.');
      return;
    }

    setLoading(true);

    try {
      // 닉네임 중복 확인 (본인 제외)
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('nickname', trimmedNickname)
        .neq('id', user.id)
        .limit(1);

      if (checkError) {
        throw checkError;
      }

      if (existingUsers && existingUsers.length > 0) {
        setError('이미 사용 중인 닉네임입니다.');
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ nickname: trimmedNickname })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      onProfileUpdated({
        ...user,
        nickname: trimmedNickname
      });
      
      setSuccess(true);
    } catch (err) {
      console.error('Failed to update nickname:', err);
      setError(err instanceof Error ? err.message : '닉네임 수정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return <LoungeAccountDialog title="대화 속 나를 소개해요" description={serviceName === '대화 라운지' ? '편한 이름과 프로필 사진으로, 내 대화석을 꾸며요.' : serviceName + '에서 사용할 이름과 프로필 사진을 관리해요.'} eyebrow="YOUR PLACE IN THE LOUNGE" onClose={onClose} displayName={nickname.trim() || user.nickname} avatarUrl={user.loungeAvatarUrl}>
    <div className="lounge-account-identity"><Mail size={17} /><div><small>로그인 계정</small><span>{user.email || '소셜 계정 · 이메일 정보 없음'}</span></div></div>
    <span className="lounge-account-section-label">01 · 대화에서 불릴 이름</span>
    <form className="lounge-account-form" onSubmit={event => { event.preventDefault(); void handleSave(); }} aria-busy={loading}>
      <label className="form-field"><span>닉네임</span><input data-dialog-autofocus value={nickname} onChange={event => { setNickname(event.target.value); setSuccess(false); }} placeholder="새 닉네임 입력" maxLength={20} autoComplete="nickname" required disabled={loading} /><small className="lounge-account-field-note">실명 대신 편한 이름도 좋아요. 최대 20자.</small></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <p className="lounge-account-success" role="status"><Check size={16} />이 이름으로 함께 이야기할게요. 저장했어요.</p>}
      <button type="submit" className="btn btn-primary lounge-account-submit" disabled={loading || success}>{loading ? <LoaderCircle size={17} className="lounge-spin" /> : <Save size={16} />}{loading ? '저장 중…' : success ? '저장했어요' : '변경 사항 저장'}</button>
    </form>
    {!user.isAnonymous && <>
      <span className="lounge-account-section-label">02 · 다른 분께 보이는 소개</span>
      <form className="lounge-account-form" onSubmit={event => { event.preventDefault(); void saveIntroduction(); }} aria-busy={introState === 'saving'}>
        <LoungeProfileFields value={fields} onChange={next => { setFields(next); setIntroState('idle'); }} disabled={introState === 'saving'} required />
        <label className="lounge-presence-check"><input type="checkbox" checked={showPresence} onChange={event => { setShowPresence(event.target.checked); setIntroState('idle'); }} /><span>친구에게 내 접속 상태와 대화 중인 방 보여주기<small>끄면 친구 목록에 접속 중인지, 어느 방에 있는지 보이지 않아요.</small></span></label>
        {introError && <div className="form-error" role="alert">{introError}</div>}
        {introState === 'saved' && <p className="lounge-account-success" role="status"><Check size={16} />소개를 저장했어요.</p>}
        <button type="submit" className="btn btn-primary lounge-account-submit" disabled={introState !== 'idle'}>{introState === 'saving' ? <LoaderCircle size={17} className="lounge-spin" /> : <Save size={16} />}{introState === 'saving' ? '저장 중…' : introState === 'saved' ? '저장했어요' : '소개 저장'}</button>
      </form>
      <LoungeAvatarEditor user={user} onSaved={onProfileUpdated} />
    </>}
  </LoungeAccountDialog>;
};
