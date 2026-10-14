import { supabase } from './supabase';
import type { AppUser, AppUserAgeGroup, AppUserGender } from '../types';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { loadLoungeAvatar } from './loungeAvatar';

export class EmailConfirmationRequiredError extends Error {
  constructor() { super('가입 확인 메일을 보냈어요. 이메일 인증 후 로그인해 프로필에서 사진을 변환해 주세요.'); }
}

type OAuthProvider = 'google' | 'kakao';
type AppUserProvider = AppUser['provider'];

const readGender = (value: unknown): AppUserGender | undefined => value === 'male' || value === 'female' ? value : undefined;

const ageGroups: readonly AppUserAgeGroup[] = ['20s', '30s', '40s', '50s', '60s'];
export const readAgeGroup = (value: unknown): AppUserAgeGroup | undefined => ageGroups.find(group => group === value);
const readText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
/** The optional profile fields other members see on the profile card. */
const readProfileFields = (profile: Record<string, unknown>) => ({
  ageGroup: readAgeGroup(profile.age_group), region: readText(profile.region), bio: readText(profile.bio), showPresence: profile.show_presence !== false,
});
export type LoungeProfileInput = { ageGroup?: AppUserAgeGroup | ''; region?: string; bio?: string; showPresence?: boolean };
/** Saves the member's age group, region, introduction and presence setting. */
export const saveLoungeProfile = async (user: AppUser, input: LoungeProfileInput): Promise<AppUser> => {
  const region = input.region?.trim().slice(0, 30) ?? '', bio = input.bio?.trim().slice(0, 200) ?? '';
  const { error } = await supabase.rpc('update_lounge_profile', { p_age_group: input.ageGroup ?? '', p_region: region, p_bio: bio, p_show_presence: input.showPresence ?? user.showPresence ?? true });
  if (error) throw new Error('프로필을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return { ...user, ageGroup: readAgeGroup(input.ageGroup), region: region || undefined, bio: bio || undefined, showPresence: input.showPresence ?? user.showPresence ?? true };
};
/** Fields typed on the signup form travel in the sign-up metadata, so they are saved on the first sign-in even when email confirmation came first. */
const signupFields = (metadata: Record<string, unknown> | undefined): LoungeProfileInput | null => {
  const ageGroup = readAgeGroup(metadata?.age_group), region = readText(metadata?.region), bio = readText(metadata?.bio);
  return ageGroup || region || bio ? { ageGroup, region, bio } : null;
};

/** Gender, age group, region and introduction are required of every member (guests are exempt). */
export const isLoungeProfileComplete = (user: AppUser) => Boolean(user.gender && user.ageGroup && user.region?.trim() && user.bio?.trim());

/** Saves the gender shown on lounge rooms to the user's own profile. */
export const saveUserGender = async (user: AppUser, gender: AppUserGender): Promise<AppUser> => {
  const { error } = await supabase.from('users').update({ gender }).eq('id', user.id);
  if (error) throw new Error('성별을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return { ...user, gender };
};

const oauthErrorParams = ['error', 'error_code', 'error_description'] as const;

const readOAuthParams = () => {
  if (typeof window === 'undefined') return new URLSearchParams();

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  hashParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
};

export const getOAuthCallbackError = (): string | null => {
  const params = readOAuthParams();
  const description = params.get('error_description');
  if (description) return description.replace(/\+/g, ' ');
  return params.get('error') ? '소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요.' : null;
};

export const clearOAuthCallbackError = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  oauthErrorParams.forEach(param => {
    url.searchParams.delete(param);
  });

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  oauthErrorParams.forEach(param => {
    hashParams.delete(param);
  });
  url.hash = hashParams.toString() ? `#${hashParams.toString()}` : '';
  window.history.replaceState(window.history.state, '', url);
};

export const subscribeToAuthChanges = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => supabase.auth.onAuthStateChange(callback).data.subscription;

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
      const isAnonymous = Boolean(user.is_anonymous);
      const provider: AppUserProvider = isAnonymous
        ? 'anonymous'
        : (user.app_metadata?.provider as Exclude<AppUserProvider, 'anonymous'>) || 'kakao';

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
        isAnonymous,
        createdAt: newProfile.created_at,
      };
    }

    const current: AppUser = {
      id: user.id,
      email: profile.email,
      nickname: profile.nickname,
      provider: profile.provider,
      isAnonymous: Boolean(user.is_anonymous),
      createdAt: profile.created_at,
      gender: readGender(profile.gender),
      ...readProfileFields(profile),
      ...await loadLoungeAvatar(profile.lounge_avatar_path),
    };
    const pending = signupFields(user.user_metadata);
    if (pending && !user.is_anonymous && !current.ageGroup && !current.region && !current.bio) return await saveLoungeProfile(current, pending).catch(() => current);
    return current;
  } catch (e) {
    console.error('Failed to get current user:', e);
    return null;
  }
};


export const signUpWithEmail = async (email: string, password: string, nickname: string, gender: AppUserGender, extras: LoungeProfileInput = {}): Promise<AppUser> => {
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
      data: { nickname: trimmedNickname, gender, ...(extras.ageGroup ? { age_group: extras.ageGroup } : {}), ...(extras.region?.trim() ? { region: extras.region.trim().slice(0, 30) } : {}), ...(extras.bio?.trim() ? { bio: extras.bio.trim().slice(0, 200) } : {}) },
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

  if (!authData.session) throw new EmailConfirmationRequiredError();

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

  const created: AppUser = {
    id: profile.id,
    email: profile.email,
    nickname: profile.nickname,
    provider: profile.provider,
    isAnonymous: false,
    createdAt: profile.created_at,
    gender: readGender(profile.gender),
    ...readProfileFields(profile),
    ...await loadLoungeAvatar(profile.lounge_avatar_path),
  };
  // A database whose signup trigger predates the gender column leaves it empty; the client writes it instead.
  const withGender = created.gender ? created : await saveUserGender(created, gender).catch(() => created);
  const hasExtras = Boolean(extras.ageGroup || extras.region?.trim() || extras.bio?.trim());
  return hasExtras ? saveLoungeProfile(withGender, extras).catch(() => withGender) : withGender;
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

  const signedIn: AppUser = {
    id: profile.id,
    email: profile.email,
    nickname: profile.nickname,
    provider: profile.provider,
    isAnonymous: false,
    createdAt: profile.created_at,
    gender: readGender(profile.gender),
    ...readProfileFields(profile),
    ...await loadLoungeAvatar(profile.lounge_avatar_path),
  };
  const pending = signupFields(authData.user.user_metadata);
  return pending && !signedIn.ageGroup && !signedIn.region && !signedIn.bio ? saveLoungeProfile(signedIn, pending).catch(() => signedIn) : signedIn;
};

export const signInAsGuest = async (): Promise<AppUser> => {
  const currentUser = await getCurrentUser();
  if (currentUser) return currentUser;

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: { nickname: '게스트' },
    },
  });

  if (error || !data.user) {
    if (error?.message.toLowerCase().includes('anonymous sign-ins are disabled')) {
      throw new Error('게스트 체험이 아직 활성화되지 않았습니다. 관리자에게 문의해 주세요.');
    }
    throw new Error(error?.message || '게스트 체험을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const guestUser = await getCurrentUser();
  if (!guestUser) throw new Error('게스트 프로필을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return guestUser;
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

const signInWithOAuth = async (provider: OAuthProvider): Promise<void> => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: new URL('/', window.location.origin).toString(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const signInWithKakao = () => signInWithOAuth('kakao');

export const signInWithGoogle = () => signInWithOAuth('google');
