import React, { useState } from 'react';
import { X, User, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppUser } from '../types';

interface ProfileModalProps {
  user: AppUser;
  onClose: () => void;
  onProfileUpdated: (updatedUser: AppUser) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose, onProfileUpdated }) => {
  const [nickname, setNickname] = useState(user.nickname);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
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
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Failed to update nickname:', err);
      setError(err instanceof Error ? err.message : '닉네임 수정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content auth-modal" style={{ maxWidth: '450px', padding: '2rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ color: 'var(--primary)', fontSize: '1.6rem', margin: 0 }}>
              프로필 수정
            </h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              ThinkFit에서 사용할 프로필 정보를 관리합니다.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4" style={{ marginBottom: '1.5rem' }}>
          <label className="form-field">
            <span>계정 이메일</span>
            <input 
              value={user.email || '소셜 계정(이메일 정보 없음)'} 
              disabled 
              style={{ opacity: 0.6, cursor: 'not-allowed', backgroundColor: 'rgba(255,255,255,0.03)' }} 
            />
          </label>
          <label className="form-field">
            <span>닉네임</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                value={nickname} 
                onChange={e => setNickname(e.target.value)} 
                placeholder="새 닉네임 입력" 
                maxLength={20}
                style={{ paddingLeft: '2.5rem', width: '100%' }}
              />
              <User size={16} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
            </div>
          </label>
        </div>

        {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {success && <div style={{ color: 'var(--primary)', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center', fontWeight: 'bold' }}>✓ 닉네임이 성공적으로 변경되었습니다!</div>}

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} 
          onClick={handleSave} 
          disabled={loading || success}
        >
          <Save size={16} />
          {loading ? '저장 중...' : '변경 사항 저장'}
        </button>
      </div>
    </div>
  );
};
