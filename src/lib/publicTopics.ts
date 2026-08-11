import { categorizedTopics, weeklyIssues } from '../data/topics';
import { englishTopics } from '../data/englishTopics';
import type { AppLanguage, PublicDebateTopic } from '../types';
import type { GeneratedOrganizationTopic } from './api';
import { supabase } from './supabase';

const builtInTopics: PublicDebateTopic[] = [
  ...weeklyIssues,
  ...categorizedTopics.flatMap(category => category.topics),
].map(item => ({
  id: `builtin:${item.id}`,
  title: item.topic,
  description: item.briefing.context,
  briefing: item.briefing,
  config: {
    timeLimit: item.config.timeLimit,
    debateLevel: item.config.debateLevel,
    debateFocus: item.config.debateFocus,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  language: 'ko',
}));

const mapPublicTopic = (row: Record<string, unknown>): PublicDebateTopic => ({
  id: String(row.id),
  title: String(row.title || ''),
  description: String(row.description || ''),
  briefing: row.briefing as PublicDebateTopic['briefing'],
  config: (row.config || {}) as PublicDebateTopic['config'],
  createdBy: row.created_by ? String(row.created_by) : undefined,
  createdAt: String(row.created_at || new Date().toISOString()),
  language: row.language === 'en' ? 'en' : 'ko',
});

export const getPublicDebateTopics = async (language: AppLanguage = 'ko'): Promise<PublicDebateTopic[]> => {
  const { data, error } = await supabase
    .from('public_debate_topics')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    // The built-in library remains available while the migration is being deployed.
    console.warn('Failed to load public debate topics:', error.message);
    return language === 'en' ? englishTopics : builtInTopics;
  }

  const savedTopics = (data ?? [])
    .map(row => mapPublicTopic(row as Record<string, unknown>))
    // Filtering after the request keeps the public library compatible with the
    // pre-language schema. Rows from that schema are Korean by definition.
    .filter(topic => topic.language === language && topic.title && topic.briefing?.context);
  return [...savedTopics, ...(language === 'en' ? englishTopics : builtInTopics)];
};

export const savePublicDebateTopic = async (
  generated: GeneratedOrganizationTopic,
  language: AppLanguage = 'ko',
): Promise<PublicDebateTopic | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('공개 주제를 만들려면 로그인이 필요합니다.');

  const { data, error } = await supabase.rpc('submit_public_debate_topic', {
    topic_title: generated.title,
    topic_description: generated.description,
    topic_briefing: generated.briefing,
    topic_config: generated.config,
    topic_language: language,
  });

  if (error) {
    // Starting the debate is more important than saving the private review candidate.
    console.warn('Failed to save public debate topic:', error.message);
    return null;
  }
  return mapPublicTopic(data as Record<string, unknown>);
};
