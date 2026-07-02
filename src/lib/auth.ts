import { supabase } from './supabase';
import type { AppUser } from '../types';

export const getCurrentUser = async (): Promise<AppUser | null> => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: profile.email,
    nickname: profile.nickname,
    provider: profile.provider,
    createdAt: profile.created_at,
  };
};

export const signUpWithEmail = async (email: string, password: string, nickname: string): Promise<AppUser> => {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedNickname = nickname.trim();

  if (!normalizedEmail || !password || !trimmedNickname) {
    throw new Error('이메일, 비밀번호, 닉네임을 모두 입력해 주세요.');
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .insert([
      {
        id: authData.user.id,
        email: normalizedEmail,
        nickname: trimmedNickname,
        provider: 'email'
      }
    ])
    .select()
    .single();

  if (profileError || !profile) {
    console.error('Profile creation error:', profileError);
    throw new Error('프로필 생성에 실패했습니다.');
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

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (!profile) {
    throw new Error('사용자 프로필을 찾을 수 없습니다.');
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
