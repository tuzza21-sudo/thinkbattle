import type { PersonalSimulationSource, SimulationMission, StoredSimulationMission, TrainingProfile, TrainingProfileType } from '../types';
import { supabase } from './supabase';

type ProfileRow = {
  user_id: string;
  profile_data: Partial<Omit<TrainingProfile, 'userId' | 'sourceText' | 'updatedAt'>> | null;
  source_text: string | null;
  updated_at: string;
};

type MissionRow = {
  id: string;
  user_id: string;
  source: PersonalSimulationSource;
  mission_data: SimulationMission;
  created_at: string;
};

export const emptyTrainingProfile = (userId: string): TrainingProfile => ({
  userId,
  profileType: 'job_seeker',
  targetRole: '',
  targetIndustry: '',
  major: '',
  education: '',
  careerSummary: '',
  experiences: '',
  activities: '',
  strengths: '',
  improvementAreas: '',
  sourceText: '',
});

const isProfileType = (value: unknown): value is TrainingProfileType =>
  value === 'student' || value === 'job_seeker' || value === 'professional' || value === 'sales';

export const getTrainingProfile = async (userId: string): Promise<TrainingProfile | null> => {
  const { data, error } = await supabase
    .from('training_profiles')
    .select('user_id, profile_data, source_text, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`훈련 프로필을 불러오지 못했습니다: ${error.message}`);
  if (!data) return null;

  const row = data as ProfileRow;
  const fallback = emptyTrainingProfile(userId);
  const profileData = row.profile_data ?? {};
  return {
    ...fallback,
    ...profileData,
    profileType: isProfileType(profileData.profileType) ? profileData.profileType : fallback.profileType,
    userId: row.user_id,
    sourceText: row.source_text ?? '',
    updatedAt: row.updated_at,
  };
};

export const saveTrainingProfile = async (profile: TrainingProfile): Promise<TrainingProfile> => {
  const updatedAt = new Date().toISOString();
  const { userId, sourceText, updatedAt: _previousUpdatedAt, ...profileData } = profile;
  void _previousUpdatedAt;

  const { error } = await supabase
    .from('training_profiles')
    .upsert({
      user_id: userId,
      profile_data: profileData,
      source_text: sourceText,
      consent_at: updatedAt,
      updated_at: updatedAt,
    }, { onConflict: 'user_id' });

  if (error) throw new Error(`훈련 프로필을 저장하지 못했습니다: ${error.message}`);
  return { ...profile, updatedAt };
};

export const createPersonalSimulationMission = async (
  userId: string,
  source: PersonalSimulationSource,
  mission: SimulationMission,
): Promise<string> => {
  const { data, error } = await supabase
    .from('custom_simulation_missions')
    .insert({ user_id: userId, source, mission_data: mission })
    .select('id')
    .single();

  if (error || !data) throw new Error(`맞춤 시나리오를 저장하지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`);
  return data.id as string;
};

export const getPersonalSimulationMission = async (
  userId: string,
  missionId: string,
): Promise<StoredSimulationMission | null> => {
  const { data, error } = await supabase
    .from('custom_simulation_missions')
    .select('id, user_id, source, mission_data, created_at')
    .eq('id', missionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`맞춤 시나리오를 불러오지 못했습니다: ${error.message}`);
  if (!data) return null;

  const row = data as MissionRow;
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    mission: { ...row.mission_data, id: row.id },
    createdAt: row.created_at,
  };
};
