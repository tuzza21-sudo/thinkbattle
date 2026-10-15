import { supabase } from './supabase';
import type { LoungeAdminActivity, LoungeAdminConversation, LoungeAdminUser, SuperAdminDashboard, SuperAdminOrganization } from '../types';

export const SUPER_ADMIN_EMAIL = 'piorne@naver.com';

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

const organizationErrorMessage =(message: string) => {
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
