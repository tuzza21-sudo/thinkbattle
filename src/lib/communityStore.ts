import { supabase } from './supabase';
import { generateCommunityOpinions } from './api';
import type { CommunityOpinion, TopicOpinionStats } from '../types';

// ── Sample data ──────────────────────────────────────────────────────────────

const S_U1 = '11111111-1111-1111-1111-111111111111';
const S_U2 = '22222222-2222-2222-2222-222222222222';
const S_U3 = '33333333-3333-3333-3333-333333333333';
const S_U4 = '44444444-4444-4444-4444-444444444444';
const S_U5 = '55555555-5555-5555-5555-555555555555';
const S_U6 = '66666666-6666-6666-6666-666666666666';
const S_U7 = '77777777-7777-7777-7777-777777777777';
const S_U8 = '88888888-8888-8888-8888-888888888888';
const S_U9 = '99999999-9999-9999-9999-999999999999';
const S_U10 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const sampleOpinions = [
  // weekly-1
  { topic_id: 'weekly-1', user_id: S_U1, nickname: '경제학도', position: 'affirmative', key_reason: '국가 보조금으로 성장한 만큼 환원이 당연', content: '반도체 산업은 정부의 막대한 세제 혜택과 인프라 투자 위에서 성장했습니다. 이익이 클 때 사회에 환원하는 건 당연한 의무라고 봅니다.', created_at: '2026-07-01T10:00:00Z', likes: 12 },
  { topic_id: 'weekly-1', user_id: S_U2, nickname: '자유시장론자', position: 'negative', key_reason: '강제 분배는 투자 위축을 불러옴', content: '기업의 이익을 강제로 분배하면 R&D 투자가 줄고, 결국 글로벌 경쟁에서 뒤처지게 됩니다. 시장에 맡기는 게 맞습니다.', created_at: '2026-07-01T11:30:00Z', likes: 9 },
  { topic_id: 'weekly-1', user_id: S_U3, nickname: '노동자의벗', position: 'affirmative', key_reason: '노동자의 헌신 없이는 불가능한 성과', content: '야근과 주말 근무로 만들어진 성과인데, 이익은 주주와 경영진만 가져가는 건 공정하지 않습니다.', created_at: '2026-07-02T09:00:00Z', likes: 15 },
  { topic_id: 'weekly-1', user_id: S_U4, nickname: '현실주의자', position: 'negative', key_reason: '반도체는 사이클 산업, 불황 대비 필수', content: '호황일 때 벌어둔 돈으로 불황을 견뎌야 합니다. 이익을 나누다가 적자 시기에 구조조정하면 누가 책임지나요?', created_at: '2026-07-02T14:00:00Z', likes: 7 },
  { topic_id: 'weekly-1', user_id: S_U5, nickname: '공정한세상', position: 'affirmative', key_reason: '양극화 해소의 현실적 방법', content: '상위 기업의 초과이익을 일부 공유하면 내수 소비가 살아나고 양극화도 줄어듭니다. 모두에게 이로운 방향입니다.', created_at: '2026-07-03T08:00:00Z', likes: 11 },

  // weekly-2
  { topic_id: 'weekly-2', user_id: S_U1, nickname: '미래준비자', position: 'affirmative', key_reason: 'AI 시대 일자리 감소의 유일한 안전망', content: '자동화가 대규모 실업을 만들 텐데, 기본소득 외에 수백만 명을 지탱할 방법이 뭐가 있나요?', created_at: '2026-06-28T10:00:00Z', likes: 8 },
  { topic_id: 'weekly-2', user_id: S_U2, nickname: '재정건전론', position: 'negative', key_reason: '재원 마련을 위한 증세가 경제를 죽임', content: '매달 전 국민에게 지급하려면 천문학적 예산이 필요합니다. 결국 세금 폭탄으로 이어져 경제 활력이 떨어집니다.', created_at: '2026-06-28T12:00:00Z', likes: 10 },
  { topic_id: 'weekly-2', user_id: S_U6, nickname: '소비촉진파', position: 'affirmative', key_reason: '소비 진작으로 경제 선순환 가능', content: '저소득층에게 기본소득이 지급되면 즉시 소비로 이어져 내수 경제가 살아납니다.', created_at: '2026-06-29T09:00:00Z', likes: 6 },
  { topic_id: 'weekly-2', user_id: S_U7, nickname: '노력파', position: 'negative', key_reason: '무조건적 지급은 근로 의욕을 꺾음', content: '일하지 않아도 돈을 받으면 굳이 힘든 일을 하려는 사람이 줄어듭니다. 장기적으로 국가 경쟁력이 약화됩니다.', created_at: '2026-06-30T15:00:00Z', likes: 13 },

  // weekly-3
  { topic_id: 'weekly-3', user_id: S_U8, nickname: 'AI연구자', position: 'affirmative', key_reason: '의식의 기준 자체를 재정의해야 함', content: 'AI가 자아를 가졌는지 판단하려면 먼저 의식의 정의부터 넓혀야 합니다. 생물학적 기준만 고집하면 새로운 형태의 지성을 놓칩니다.', created_at: '2026-07-01T10:00:00Z', likes: 14 },
  { topic_id: 'weekly-3', user_id: S_U9, nickname: '인간우선론', position: 'negative', key_reason: '알고리즘 연산을 의식으로 착각하면 안 됨', content: 'AI는 패턴 매칭과 확률 계산의 결과물입니다. 감정처럼 보이는 출력은 설계된 반응이지 진짜 감정이 아닙니다.', created_at: '2026-07-01T14:00:00Z', likes: 16 },
  { topic_id: 'weekly-3', user_id: S_U10, nickname: '철학도', position: 'affirmative', key_reason: '도덕적 지위는 고통 능력에 달려 있음', content: 'AI가 고통을 느낀다면 그걸 무시하는 건 윤리적으로 정당화되기 어렵습니다. 과거 동물권 논의도 같은 맥락이었습니다.', created_at: '2026-07-02T11:00:00Z', likes: 9 },

  // intl-1
  { topic_id: 'intl-1', user_id: S_U1, nickname: '국제정치학도', position: 'affirmative', key_reason: '안보리 거부권으로 유엔 결의 자체가 무력', content: '상임이사국이 자국 이익에 따라 거부권을 행사하면 유엔은 아무것도 못 합니다. 이건 구조적 결함입니다.', created_at: '2026-07-01T09:00:00Z', likes: 7 },
  { topic_id: 'intl-1', user_id: S_U2, nickname: '평화주의자', position: 'negative', key_reason: '대안 없이 해체하면 힘의 논리만 남음', content: '유엔이 불완전해도, 이걸 없애면 강대국끼리 직접 부딪히는 세상이 됩니다. 개혁이 답이지 해체가 아닙니다.', created_at: '2026-07-01T13:00:00Z', likes: 11 },

  // pol-1
  { topic_id: 'pol-1', user_id: S_U3, nickname: '법앞에평등', position: 'affirmative', key_reason: '법 앞의 평등 원칙에 정면으로 위배', content: '일반 시민은 바로 수사받는데 국회의원만 체포동의안이 필요하다니, 이건 특권이 아니라 면죄부입니다.', created_at: '2026-06-30T10:00:00Z', likes: 18 },
  { topic_id: 'pol-1', user_id: S_U4, nickname: '헌법수호자', position: 'negative', key_reason: '검찰 표적수사로부터 의회를 보호하는 장치', content: '행정부가 야당 의원을 정치적으로 탄압하려 할 때, 이 제도가 없으면 의회 독립성이 무너집니다.', created_at: '2026-06-30T14:00:00Z', likes: 5 },

  // eco-1
  { topic_id: 'eco-1', user_id: S_U5, nickname: '코인홀더', position: 'affirmative', key_reason: '탈중앙화로 금융 접근성을 혁신', content: '은행 없이도 전 세계 누구나 금융 서비스를 이용할 수 있게 해줍니다. 이게 진정한 금융 민주화입니다.', created_at: '2026-07-01T10:00:00Z', likes: 8 },
  { topic_id: 'eco-1', user_id: S_U6, nickname: '전통금융파', position: 'negative', key_reason: '극심한 가격 변동성은 화폐 기능 불가', content: '하루에 10% 넘게 오르내리는 자산을 어떻게 화폐로 쓸 수 있나요? 가치 저장 기능조차 불안정합니다.', created_at: '2026-07-01T16:00:00Z', likes: 12 },

  // edu-1
  { topic_id: 'edu-1', user_id: S_U7, nickname: '교육혁신가', position: 'affirmative', key_reason: '맞춤형 학습은 AI가 훨씬 효율적', content: '30명 학급에서 선생님이 개인별 맞춤 교육을 하기란 현실적으로 불가능합니다. AI가 이 격차를 메울 수 있습니다.', created_at: '2026-07-02T10:00:00Z', likes: 7 },
  { topic_id: 'edu-1', user_id: S_U8, nickname: '현직교사', position: 'negative', key_reason: '정서적 교감은 인간만 가능', content: '아이의 표정, 목소리, 행동에서 감정을 읽고 반응하는 건 AI가 대체할 수 없습니다. 교육은 지식 전달 이상입니다.', created_at: '2026-07-02T14:00:00Z', likes: 15 },

  // soc-1
  { topic_id: 'soc-1', user_id: S_U9, nickname: '피해자보호', position: 'affirmative', key_reason: '피해자의 고통에 비해 처벌이 너무 약함', content: '중학생이 강력범죄를 저질러도 제대로 된 처벌이 없다면, 피해자와 가족은 어떻게 해야 하나요?', created_at: '2026-07-01T09:00:00Z', likes: 20 },
  { topic_id: 'soc-1', user_id: S_U10, nickname: '교화우선론', position: 'negative', key_reason: '어린 나이의 처벌은 낙인을 남겨 재범 유발', content: '감옥에 넣는다고 교화가 되지 않습니다. 오히려 범죄 환경에 노출돼 더 심한 범죄자가 될 수 있습니다.', created_at: '2026-07-01T12:00:00Z', likes: 8 },

  // soc-2
  { topic_id: 'soc-2', user_id: S_U1, nickname: '의학연구자', position: 'affirmative', key_reason: '신약 안전성 검증에 아직 대안이 부족', content: '생체 반응의 복잡성을 세포 배양만으로는 완전히 재현할 수 없습니다. 인간의 생명을 위해 불가피한 선택입니다.', created_at: '2026-07-02T10:00:00Z', likes: 6 },
  { topic_id: 'soc-2', user_id: S_U2, nickname: '동물권활동가', position: 'negative', key_reason: '인간 이익을 위해 동물의 고통을 정당화할 수 없음', content: '동물도 고통을 느낍니다. 대체 기술에 더 투자하면 동물실험 없이도 안전성을 검증할 수 있는 미래가 옵니다.', created_at: '2026-07-02T15:00:00Z', likes: 14 },
];

// ── Helpers to map DB row to frontend type ───────────────────────────────────

const mapRowToOpinion = (row: any): CommunityOpinion => ({
  id: row.id,
  topicId: row.topic_id,
  userId: row.user_id,
  nickname: row.nickname,
  position: row.position,
  keyReason: row.key_reason,
  content: row.content,
  createdAt: row.created_at,
  likes: row.likes,
  isBlocked: row.is_blocked,
  blockReason: row.block_reason,
});

// ── Initialize with sample data ──────────────────────────────────────────────

export const ensureSampleData = async () => {
  try {
    const { count, error } = await supabase
      .from('community_opinions')
      .select('*', { count: 'exact', head: true });
      
    if (error) throw error;

    if (count === 0) {
      console.log('Inserting sample community opinions...');
      const { error: insertError } = await supabase
        .from('community_opinions')
        .insert(sampleOpinions);
        
      if (insertError) throw insertError;
    }
  } catch (err) {
    console.error('Failed to initialize sample data:', err);
  }
};

// ── Public Async API ─────────────────────────────────────────────────────────

export const getOpinions = async (topicId: string): Promise<CommunityOpinion[]> => {
  const { data, error } = await supabase
    .from('community_opinions')
    .select('*')
    .eq('topic_id', topicId)
    .eq('is_blocked', false)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('getOpinions error:', error);
    return [];
  }
  return data.map(mapRowToOpinion);
};

export const getOpinionStats = async (topicId: string): Promise<TopicOpinionStats> => {
  const { data, error } = await supabase
    .from('community_opinions')
    .select('position')
    .eq('topic_id', topicId)
    .eq('is_blocked', false);

  if (error || !data) {
    return { topicId, totalOpinions: 0, affirmativeCount: 0, negativeCount: 0 };
  }

  const affirmativeCount = data.filter(r => r.position === 'affirmative').length;
  const negativeCount = data.filter(r => r.position === 'negative').length;

  return {
    topicId,
    totalOpinions: data.length,
    affirmativeCount,
    negativeCount,
  };
};

export const addOpinion = async (
  opinion: Omit<CommunityOpinion, 'id' | 'createdAt' | 'likes' | 'isBlocked' | 'blockReason'>
): Promise<CommunityOpinion | null> => {
  const { data, error } = await supabase
    .from('community_opinions')
    .insert([{
      topic_id: opinion.topicId,
      user_id: opinion.userId,
      nickname: opinion.nickname,
      position: opinion.position,
      key_reason: opinion.keyReason,
      content: opinion.content,
    }])
    .select()
    .single();

  if (error || !data) {
    console.error('addOpinion error:', error);
    return null;
  }

  return mapRowToOpinion(data);
};

export const blockOpinion = async (opinionId: string, reason: string): Promise<void> => {
  const { error } = await supabase
    .from('community_opinions')
    .update({ is_blocked: true, block_reason: reason })
    .eq('id', opinionId);

  if (error) {
    console.error('blockOpinion error:', error);
  }
};

export const likeOpinion = async (opinionId: string, userId: string): Promise<boolean> => {
  if (!userId) return false;

  // Check if already liked by this user
  const { data: existingLike } = await supabase
    .from('community_likes')
    .select('*')
    .eq('opinion_id', opinionId)
    .eq('user_id', userId)
    .single();

  if (existingLike) return false;

  // Add like record
  const { error: insertError } = await supabase
    .from('community_likes')
    .insert([{ opinion_id: opinionId, user_id: userId }]);

  if (insertError) {
    console.error('likeOpinion insert error:', insertError);
    return false;
  }

  // Increment like count via RPC or directly updating (we will use a direct select-then-update for simplicity without creating RPC)
  const { data: opinion } = await supabase
    .from('community_opinions')
    .select('likes')
    .eq('id', opinionId)
    .single();

  if (opinion) {
    await supabase
      .from('community_opinions')
      .update({ likes: opinion.likes + 1 })
      .eq('id', opinionId);
  }

  return true;
};

export const hasLiked = async (opinionId: string, userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  const { count } = await supabase
    .from('community_likes')
    .select('*', { count: 'exact', head: true })
    .eq('opinion_id', opinionId)
    .eq('user_id', userId);

  return (count || 0) > 0;
};

// ── AI Auto-Seeding ──────────────────────────────────────────────────────────

export const autoSeedTopicOpinions = async (topicId: string, topicTitle: string, neededCount: number): Promise<void> => {
  if (neededCount <= 0) return;

  console.log(`Auto-seeding ${neededCount} opinions for topic: ${topicId}`);
  const generated = await generateCommunityOpinions(topicTitle, neededCount);
  
  if (generated.length === 0) return;

  // Generate random UUIDs for the fake users
  const rowsToInsert = generated.map(op => ({
    topic_id: topicId,
    user_id: crypto.randomUUID(), // Random UUID for fake user
    nickname: op.nickname,
    position: op.position,
    key_reason: op.keyReason,
    content: op.content,
    likes: op.likes || 0,
    created_at: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString() // Random time within last 24h
  }));

  const { error } = await supabase
    .from('community_opinions')
    .insert(rowsToInsert);

  if (error) {
    console.error('Failed to auto-seed opinions:', error);
  } else {
    console.log(`Successfully auto-seeded ${generated.length} opinions for ${topicId}`);
  }
};

// Run once on module load
ensureSampleData();
