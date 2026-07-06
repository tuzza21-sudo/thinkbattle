import { supabase } from './supabase';
import type { AppUser } from '../types';

export const getCurrentUser = async (): Promise<AppUser | null> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.warn('getCurrentUser profile error:', profileError);
      
      // Fallback: 카카오/구글 로그인 등으로 auth.users는 생성되었으나 public.users 프로필이 없을 경우 자동 생성
      const nickname = user.user_metadata?.nickname || 
                       user.user_metadata?.name || 
                       user.user_metadata?.full_name || 
                       user.email?.split('@')[0] || 
                       '사용자';
      const email = user.email || '';
      const provider = (user.app_metadata?.provider as 'email' | 'kakao' | 'google') || 'kakao';

      console.log('Attempting to create missing profile for OAuth user:', { id: user.id, email, nickname, provider });

      const { data: newProfile, error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email,
          nickname,
          provider,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to self-heal user profile:', insertError);
        return null;
      }

      return {
        id: newProfile.id,
        email: newProfile.email,
        nickname: newProfile.nickname,
        provider: newProfile.provider,
        createdAt: newProfile.created_at,
      };
    }

    return {
      id: user.id,
      email: profile.email,
      nickname: profile.nickname,
      provider: profile.provider,
      createdAt: profile.created_at,
    };
  } catch (e) {
    console.error('Failed to get current user:', e);
    return null;
  }
};


export const signUpWithEmail = async (email: string, password: string, nickname: string): Promise<AppUser> => {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedNickname = nickname.trim();

  // 닉네임 중복 확인
  const { data: existingUsers, error: checkError } = await supabase
    .from('users')
    .select('id')
    .eq('nickname', trimmedNickname)
    .limit(1);

  if (checkError) {
    console.error('Nickname check error during signup:', checkError);
  } else if (existingUsers && existingUsers.length > 0) {
    throw new Error('이미 사용 중인 닉네임입니다.');
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { nickname: trimmedNickname },
    },
  });

  if (authError) {
    if (authError.message.includes('User already registered')) {
      throw new Error('이미 가입된 이메일입니다.');
    }
    throw new Error(authError.message);
  }

  if (!authData.user) {
    throw new Error('회원가입에 실패했습니다.');
  }

  // DB 트리거(handle_new_user)가 프로필을 자동 생성하므로 조회만 수행
  // 트리거 실행 시간을 고려하여 짧은 대기 후 조회
  await new Promise(resolve => setTimeout(resolve, 500));

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile fetch error:', profileError);
    throw new Error('프로필 생성을 확인할 수 없습니다. 다시 로그인해 주세요.');
  }

  return {
    id: profile.id,
    email: profile.email,
    nickname: profile.nickname,
    provider: profile.provider,
    createdAt: profile.created_at,
  };
};

export const signInWithEmail = async (email: string, password: string): Promise<AppUser> => {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (authError || !authData.user) {
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(`사용자 프로필을 찾을 수 없습니다: ${profileError?.message || '알 수 없는 에러'}`);
  }

  return {
    id: profile.id,
    email: profile.email,
    nickname: profile.nickname,
    provider: profile.provider,
    createdAt: profile.created_at,
  };
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

export const signInWithKakao = async (): Promise<void> => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const signInWithGoogle = async (): Promise<void> => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
};


