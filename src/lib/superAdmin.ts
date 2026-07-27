import { supabase } from './supabase';
import type { SuperAdminDashboard } from '../types';

export const SUPER_ADMIN_EMAIL = 'piorne@naver.com';

export const getSuperAdminDashboard = async (): Promise<SuperAdminDashboard | null> => {
  const { data, error } = await supabase.rpc('get_super_admin_dashboard');
  if (error || !data) {
    if (error) console.error('Failed to load super admin dashboard:', error);
    return null;
  }
  return data as SuperAdminDashboard;
};
