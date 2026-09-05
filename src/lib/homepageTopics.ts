import { supabase } from './supabase';
import type {
  FeaturedBattle,
  HomepageDebateTopic,
  HomepageTopicKind,
  TopicBriefing,
  WeeklyIssue,
} from '../types';

export type HomepageTopicInput = Omit<HomepageDebateTopic, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type HomepageTopicCollection = {
  topics: HomepageDebateTopic[];
  managedKinds: HomepageTopicKind[];
};

const emptyBriefing = (description: string): TopicBriefing => ({
  context: description,
  recentCases: [],
  newsLinks: [],
  affirmative: { title: '찬성 측 핵심', points: [] },
  negative: { title: '반대 측 핵심', points: [] },
  prepQuestions: [],
  keywords: [],
});

const stringList = (value: unknown) => Array.isArray(value)
  ? value.map(item => String(item).trim()).filter(Boolean)
  : [];

const mapHomepageTopic = (row: Record<string, unknown>): HomepageDebateTopic => {
  const description = String(row.description || '');
  const fallback = emptyBriefing(description);
  const rawBriefing = row.briefing && typeof row.briefing === 'object'
    ? row.briefing as Partial<TopicBriefing>
    : fallback;
  const affirmative = rawBriefing.affirmative && typeof rawBriefing.affirmative === 'object'
    ? rawBriefing.affirmative
    : fallback.affirmative;
  const negative = rawBriefing.negative && typeof rawBriefing.negative === 'object'
    ? rawBriefing.negative
    : fallback.negative;
  const briefing: TopicBriefing = {
    context: String(rawBriefing.context || description),
    recentCases: stringList(rawBriefing.recentCases),
    newsLinks: Array.isArray(rawBriefing.newsLinks)
      ? rawBriefing.newsLinks.filter(link => link && typeof link.label === 'string' && typeof link.url === 'string')
      : [],
    affirmative: { title: String(affirmative.title || '찬성 측 핵심'), points: stringList(affirmative.points) },
    negative: { title: String(negative.title || '반대 측 핵심'), points: stringList(negative.points) },
    prepQuestions: stringList(rawBriefing.prepQuestions),
    keywords: stringList(rawBriefing.keywords),
  };

  return {
    id: String(row.id),
    topicKind: row.topic_kind === 'latest_issue' ? 'latest_issue' : 'detail',
    sector: String(row.sector || '기타'),
    title: String(row.title || ''),
    description,
    briefing,
    timeLimit: Number(row.time_limit || 600),
    accent: row.accent === 'amber' || row.accent === 'pink' ? row.accent : 'cyan',
    issueLabel: String(row.issue_label || ''),
    sortOrder: Number(row.sort_order || 0),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
};

export const getHomepageDebateTopics = async (includeInactive = false): Promise<HomepageTopicCollection | null> => {
  const rpc = includeInactive ? 'get_super_admin_homepage_topics' : 'get_homepage_debate_topics';
  const { data, error } = await supabase.rpc(rpc);
  if (error) {
    console.warn('Failed to load homepage debate topics:', error.message);
    return null;
  }
  if (includeInactive) {
    const rows = (data ?? []) as Record<string, unknown>[];
    const topics = rows.map(mapHomepageTopic);
    return { topics, managedKinds: [...new Set(topics.map(topic => topic.topicKind))] };
  }
  const result = (data ?? {}) as { topics?: Record<string, unknown>[]; managedKinds?: HomepageTopicKind[] };
  return {
    topics: (result.topics ?? []).map(mapHomepageTopic),
    managedKinds: (result.managedKinds ?? []).filter(kind => kind === 'latest_issue' || kind === 'detail'),
  };
};

export const saveHomepageDebateTopic = async (topic: HomepageTopicInput): Promise<HomepageDebateTopic> => {
  const { data, error } = await supabase.rpc('upsert_homepage_debate_topic', {
    p_topic_kind: topic.topicKind,
    p_sector: topic.sector.trim(),
    p_title: topic.title.trim(),
    p_description: topic.description.trim(),
    p_briefing: topic.briefing,
    p_time_limit: topic.timeLimit,
    p_accent: topic.accent,
    p_issue_label: topic.issueLabel.trim(),
    p_sort_order: topic.sortOrder,
    p_is_active: topic.isActive,
    p_topic_id: topic.id || null,
  });
  if (error) throw new Error(error.message.includes('not authorized') ? '슈퍼 관리자 권한이 필요합니다.' : '주제를 저장하지 못했습니다.');
  return mapHomepageTopic(data as Record<string, unknown>);
};

export const deleteHomepageDebateTopic = async (topicId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_homepage_debate_topic', { p_topic_id: topicId });
  if (error) throw new Error(error.message.includes('not authorized') ? '슈퍼 관리자 권한이 필요합니다.' : '주제를 삭제하지 못했습니다.');
};

const toBattle = (topic: HomepageDebateTopic): FeaturedBattle => ({
  id: `homepage:${topic.id}`,
  category: topic.sector,
  topic: topic.title,
  mode: topic.topicKind === 'latest_issue' ? '최신 핵심 이슈' : '정식 토론',
  players: 1,
  time: Math.max(1, Math.round(topic.timeLimit / 60)),
  accent: topic.accent,
  config: {
    topic: topic.title,
    topicDescription: topic.description,
    topicBriefing: topic.briefing,
    timeLimit: topic.timeLimit,
    gameMode: 'debate',
    userPosition: 'affirmative',
  },
  briefing: topic.briefing,
});

export const buildHomepageTopicLibrary = (topics: HomepageDebateTopic[]) => {
  const activeTopics = topics.filter(topic => topic.isActive);
  const latestIssues: WeeklyIssue[] = activeTopics
    .filter(topic => topic.topicKind === 'latest_issue')
    .map((topic, index) => ({
      ...toBattle(topic),
      issueDate: topic.issueLabel || 'Spot Issue',
      issueNumber: Math.max(1, topic.sortOrder || activeTopics.length - index),
    }));

  const sectorMap = new Map<string, FeaturedBattle[]>();
  activeTopics.filter(topic => topic.topicKind === 'detail').forEach(topic => {
    const sector = topic.sector || '기타';
    sectorMap.set(sector, [...(sectorMap.get(sector) ?? []), toBattle(topic)]);
  });

  return {
    latestIssues,
    categorizedTopics: [...sectorMap.entries()].map(([category, sectorTopics]) => ({
      category,
      description: `${category} 분야 토론 주제`,
      topics: sectorTopics,
    })),
  };
};

export const createEmptyHomepageTopic = (topicKind: HomepageTopicKind = 'detail'): HomepageTopicInput => ({
  topicKind,
  sector: topicKind === 'latest_issue' ? '핵심 이슈' : '사회',
  title: '',
  description: '',
  briefing: emptyBriefing(''),
  timeLimit: 600,
  accent: 'cyan',
  issueLabel: topicKind === 'latest_issue' ? 'Spot Issue' : '',
  sortOrder: 0,
  isActive: true,
});
