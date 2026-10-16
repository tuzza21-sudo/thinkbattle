import { supabase } from './supabase';
import type { LoungeAdminActivity, LoungeAdminConversation, LoungeAdminUser, SuperAdminDashboard, SuperAdminOrganization } from '../types';

export const SUPER_ADMIN_EMAIL = 'piorne@naver.com';
// The Kakao login of the same developer has an empty sign-in email, so it is recognised by account id (mirrors is_super_admin()).
const SUPER_ADMIN_USER_IDS = ['d8771e72-7ae4-4402-b8cc-dc52e13bebff'];

export const isSuperAdminUser = (user: { id: string; email?: string | null } | null | undefined) => Boolean(
  user && (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL || SUPER_ADMIN_USER_IDS.includes(user.id)),
);

export const getSuperAdminDashboard = async (): Promise<SuperAdminDashboard | null> => {
  const { data, error } = await supabase.rpc('get_super_admin_dashboard');
  if (error || !data) {
    if (error) console.error('Failed to load super admin dashboard:', error);
    return null;
  }
  return data as SuperAdminDashboard;
};

export const getLoungeAdminUsers = async (query: string): Promise<LoungeAdminUser[]> => {
  const { data, error } = await supabase.rpc('admin_lounge_users', { p_query: query.trim(), p_limit: 100 });
  if (error) throw new Error(error.message.includes('not authorized') ? '슈퍼 관리자 권한을 확인하지 못했습니다.' : '회원 목록을 불러오지 못했습니다.');
  return Array.isArray(data) ? data as LoungeAdminUser[] : [];
};

// Opening a member or a conversation is written to the access log on the server.
export const getLoungeAdminActivity = async (userId: string): Promise<LoungeAdminActivity> => {
  const { data, error } = await supabase.rpc('admin_lounge_user_activity', { p_user: userId });
  if (error || !data) throw new Error('회원 활동을 불러오지 못했습니다.');
  return data as LoungeAdminActivity;
};

export const getLoungeAdminConversation = async (roomId: string, userId: string): Promise<LoungeAdminConversation> => {
  const { data, error } = await supabase.rpc('admin_lounge_room_messages', { p_room: roomId, p_user: userId });
  if (error || !data) throw new Error('대화를 불러오지 못했습니다. 보관 기간이 지나 삭제되었을 수 있습니다.');
  return data as LoungeAdminConversation;
};

export type LoungeBetaOverview = {
  settings: { enabled: boolean; soloMinutes: number; groupMinutes: number; appliesFrom: string; updatedAt: string };
  testers: { userId: string; nickname: string | null; email: string | null; note: string; addedAt: string }[];
  today: { userId: string; nickname: string | null; email: string | null; soloSeconds: number; groupSeconds: number }[];
};

const betaErrorMessage = (message: string) => {
  if (message.includes('not authorized')) return '슈퍼 관리자 권한을 확인하지 못했습니다.';
  if (message.includes('user not found')) return '해당 이메일로 가입한 계정을 찾지 못했습니다.';
  if (message.includes('minutes out of range')) return '시간은 1~1440분 사이로 입력해 주세요.';
  return '요청을 처리하지 못했습니다. 베타 제한 마이그레이션이 적용되었는지 확인해 주세요.';
};

export const getLoungeBetaOverview = async (): Promise<LoungeBetaOverview> => {
  const { data, error } = await supabase.rpc('admin_get_lounge_beta');
  if (error || !data) throw new Error(betaErrorMessage(error?.message ?? ''));
  return data as LoungeBetaOverview;
};

export const setLoungeBetaLimits = async (enabled: boolean, soloMinutes: number, groupMinutes: number) => {
  const { error } = await supabase.rpc('admin_set_lounge_beta_limits', { p_enabled: enabled, p_solo_minutes: soloMinutes, p_group_minutes: groupMinutes });
  if (error) throw new Error(betaErrorMessage(error.message));
};

export const addLoungeBetaTester = async (email: string, note: string) => {
  const { error } = await supabase.rpc('admin_add_lounge_beta_tester', { p_email: email.trim().toLowerCase(), p_note: note.trim() });
  if (error) throw new Error(betaErrorMessage(error.message));
};

export const removeLoungeBetaTester = async (userId: string) => {
  const { error } = await supabase.rpc('admin_remove_lounge_beta_tester', { p_user: userId });
  if (error) throw new Error(betaErrorMessage(error.message));
};

const organizationErrorMessage = (message: string) => {
  if (message.includes('owner account not found')) {
    return '해당 이메일로 가입한 계정을 찾지 못했습니다. 먼저 회원가입을 완료해 주세요.';
  }
  if (message.includes('organization already exists')) {
    return '이미 같은 이름의 기관이 있습니다.';
  }
  if (message.includes('not authorized')) {
    return '슈퍼 관리자 권한을 확인하지 못했습니다.';
  }
  return '기관 설정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
};

export const createSuperAdminOrganization = async (
  name: string,
  ownerEmail: string,
): Promise<SuperAdminOrganization> => {
  const { data, error } = await supabase.rpc('super_admin_create_organization', {
    p_name: name.trim(),
    p_owner_email: ownerEmail.trim().toLowerCase(),
  });
  if (error) throw new Error(organizationErrorMessage(error.message));
  return data as SuperAdminOrganization;
};

export const addSuperAdminOrganizationOwner = async (
  organizationId: string,
  ownerEmail: string,
): Promise<void> => {
  const { error } = await supabase.rpc('super_admin_add_organization_owner', {
    p_organization_id: organizationId,
    p_owner_email: ownerEmail.trim().toLowerCase(),
  });
  if (error) throw new Error(organizationErrorMessage(error.message));
};
