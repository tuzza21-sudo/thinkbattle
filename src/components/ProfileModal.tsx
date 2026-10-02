import React, { useState } from 'react';
import { Check, LoaderCircle, Mail, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppUser } from '../types';
import { LoungeAvatarEditor } from './LoungeAvatarEditor';
import { LoungeAccountDialog } from './LoungeAccountDialog';

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

  return <LoungeAccountDialog title="대화 속 나를 소개해요" description={serviceName === '수다 라운지' ? '편한 이름과 나를 닮은 얼굴로, 내 대화석을 꾸며요.' : serviceName + '에서 사용할 이름과 라운지 아바타를 관리해요.'} eyebrow="YOUR PLACE IN THE LOUNGE" onClose={onClose} displayName={nickname.trim() || user.nickname} avatarUrl={user.loungeAvatarUrl}>
    <div className="lounge-account-identity"><Mail size={17} /><div><small>로그인 계정</small><span>{user.email || '소셜 계정 · 이메일 정보 없음'}</span></div></div>
    <span className="lounge-account-section-label">01 · 대화에서 불릴 이름</span>
    <form className="lounge-account-form" onSubmit={event => { event.preventDefault(); void handleSave(); }} aria-busy={loading}>
      <label className="form-field"><span>닉네임</span><input data-dialog-autofocus value={nickname} onChange={event => { setNickname(event.target.value); setSuccess(false); }} placeholder="새 닉네임 입력" maxLength={20} autoComplete="nickname" required disabled={loading} /><small className="lounge-account-field-note">실명 대신 편한 이름도 좋아요. 최대 20자.</small></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <p className="lounge-account-success" role="status"><Check size={16} />이 이름으로 함께 이야기할게요. 저장했어요.</p>}
      <button type="submit" className="btn btn-primary lounge-account-submit" disabled={loading || success}>{loading ? <LoaderCircle size={17} className="lounge-spin" /> : <Save size={16} />}{loading ? '저장 중…' : success ? '저장했어요' : '변경 사항 저장'}</button>
    </form>
    {!user.isAnonymous && <LoungeAvatarEditor user={user} onSaved={onProfileUpdated} />}
  </LoungeAccountDialog>;
};
