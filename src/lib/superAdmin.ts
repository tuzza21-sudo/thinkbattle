import { supabase } from './supabase';
import type { SuperAdminDashboard, SuperAdminOrganization } from '../types';

export const SUPER_ADMIN_EMAIL = 'piorne@naver.com';

export const getSuperAdminDashboard = async (): Promise<SuperAdminDashboard | null> => {
  const { data, error } = await supabase.rpc('get_super_admin_dashboard');
  if (error || !data) {
    if (error) console.error('Failed to load super admin dashboard:', error);
    return null;
  }
  return data as SuperAdminDashboard;
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
