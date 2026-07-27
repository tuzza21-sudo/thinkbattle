import { supabase } from './supabase';
import type { AdminDashboard, OrganizationStudentRecord, OrganizationSummary, OrganizationTopic, OrganizationUser } from '../types';

export const getMyOrganizations = async (): Promise<OrganizationSummary[]> => {
  // The developer account gets a private test organization on first B2B visit.
  // The database function independently checks the authenticated email.
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email?.toLowerCase() === 'piorne@naver.com') {
    const { error: accessError } = await supabase.rpc('ensure_developer_b2b_access');
    if (accessError) console.error('Failed to ensure B2B administrator access:', accessError);
  }
  const { data, error } = await supabase.rpc('get_my_organizations');
  if (error || !Array.isArray(data)) {
    if (error) console.error('Failed to load administrator organizations:', error);
    return [];
  }
  return data as OrganizationSummary[];
};

export const createOrganizationGroup = async (organizationId: string, name: string) => {
  const { error } = await supabase.rpc('create_organization_group', {
    p_organization_id: organizationId,
    p_name: name.trim(),
  });
  if (error) throw error;
};

export const addOrganizationStudent = async (organizationId: string, email: string, groupIds: string[]) => {
  const { error } = await supabase.rpc('add_organization_student', {
    p_organization_id: organizationId,
    p_email: email.trim().toLowerCase(),
    p_group_ids: groupIds,
  });
  if (error) throw error;
};

export const removeOrganizationStudent = async (organizationId: string, userId: string) => {
  const { error } = await supabase.rpc('remove_organization_student', {
    p_organization_id: organizationId,
    p_user_id: userId,
  });
  if (error) throw error;
};

export const getOrganizationUserDirectory = async (organizationId: string): Promise<OrganizationUser[]> => {
  const { data, error } = await supabase.rpc('get_organization_user_directory', { p_organization_id: organizationId });
  if (error || !Array.isArray(data)) {
    if (error) console.error('Failed to load organization user directory:', error);
    return [];
  }
  return data as OrganizationUser[];
};

export const getOrganizationTopics = async (organizationId: string): Promise<OrganizationTopic[]> => {
  const { data, error } = await supabase.rpc('get_organization_topics', { p_organization_id: organizationId });
  if (error || !Array.isArray(data)) return [];
  return data as OrganizationTopic[];
};

export const getMyOrganizationTopics = async (): Promise<OrganizationTopic[]> => {
  const { data, error } = await supabase.rpc('get_my_organization_topics');
  if (error || !Array.isArray(data)) return [];
  return data as OrganizationTopic[];
};

export const createOrganizationTopic = async (organizationId: string, title: string, description: string) => {
  const { error } = await supabase.rpc('create_organization_topic', { p_organization_id: organizationId, p_title: title.trim(), p_description: description.trim() });
  if (error) throw error;
};

export const deleteOrganizationTopic = async (organizationId: string, topicId: string) => {
  const { error } = await supabase.rpc('delete_organization_topic', { p_organization_id: organizationId, p_topic_id: topicId });
  if (error) throw error;
};

export const getOrganizationStudentRecords = async (organizationId: string, userId: string): Promise<OrganizationStudentRecord[]> => {
  const { data, error } = await supabase.rpc('get_organization_student_records', { p_organization_id: organizationId, p_user_id: userId });
  if (error || !Array.isArray(data)) {
    if (error) console.error('Failed to load student records:', error);
    return [];
  }
  return data as OrganizationStudentRecord[];
};

export const getAdminDashboard = async (organizationId: string): Promise<AdminDashboard | null> => {
  const { data, error } = await supabase.rpc('get_b2b_dashboard', { p_organization_id: organizationId });
  if (error || !data) {
    if (error) console.error('Failed to load B2B dashboard:', error);
    return null;
  }
  return data as AdminDashboard;
};
