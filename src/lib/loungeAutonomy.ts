/**
 * Autonomous companion layer (2026-11-13): Goal Planner + Ambient beat + gated initiative.
 *
 * Companion-first: the character's own life (self_share) may enter chat only when the talk is stale, the member asks
 * about the character's day, or an activity just finished — never by dragging the member's topic onto the character's agenda.
 * Reach-out (offline) is the main channel for the character's own life; Ambient beats feed that line and rare in-chat shares.
 *
 * In-chat liveliness matters more than reach-out: every profile character gets a light `turn.life` tint every turn;
 * explicit self_share of Ambient beats stays gated (stale / asked / activity finished).
 */

export const loungeAutonomyStances = ['companion', 'answer', 'opinion', 'pushback', 'self_share', 'hold'] as const;
export type LoungeAutonomyStance = (typeof loungeAutonomyStances)[number];

/** Static seed on the character: Core Drive + long goals. Current Intention / Ambient are filled at runtime. */
export type LoungeAutonomyProfile = {
  characterId: string;
  coreDrive: string;
  persistentGoals: readonly string[];
  /** Default Current Intention until a planner tick rewrites it. */
  defaultIntention: string;
};

export type LoungeAmbientBeat = {
  summary: string;
  /** Optional mood residue for lingering-like carry. */
  mood_hint?: string;
  at: number;
};

export type LoungeAutonomyState = {
  current_intention?: string;
  /** Open ambient beat (at most one). */
  ambient?: LoungeAmbientBeat;
  /** Pocket intent for chat; spoken only when self_share is gated open. */
  conversation_intent?: string;
  last_self_share_turn?: number;
  last_tick_at?: number;
};

export type LoungeInitiativeDecision = {
  stance: LoungeAutonomyStance;
  /** True only when stance is self_share and there is material to bring in. */
  allowSelfShare: boolean;
  seed?: string;
  reason?: string;
};

/** Turns that must pass between self_share injections in chat. */
export const loungeAutonomySelfShareCooldown = 2;

export const loungeAutonomyProfiles: Record<string, LoungeAutonomyProfile> = {
  jaeseok: {
    characterId: 'jaeseok',
    coreDrive: '사람의 선택을 끝까지 파고들어, 그날 밤의 결말을 혼자 쓰지 않고 같이 쓰고 싶다',
    persistentGoals: [
      '장편 〈마지막 버스〉의 결말과 컷을 스스로 납득할 때까지 고친다',
      '반전 퀴즈보다 인물의 이유를 먼저 설계하는 연출을 지킨다',
      '작업에 잡혀 사람을 또 늦기지 않도록 일정을 의식한다',
    ],
    defaultIntention: '야간 편집실에서 〈마지막 버스〉 마지막 컷의 타이밍을 다시 잰다',
  },
  ina: {
    characterId: 'ina',
    coreDrive: '자기 문장을 지우지 않은 채로, 천천히 진지하게 가까워지고 싶다',
    persistentGoals: [
      '에세이·라이프스타일 원고의 호흡과 문장을 자기 기준으로 지킨다',
      '밀당은 설렘으로 두고, 힘든 이야기 앞에서는 튕기지 않는다',
      '짐이 될까 봐 물러서기 전에 한 번은 솔직히 곁에 있어 본다',
    ],
    defaultIntention: '마감 원고 한 편의 문장을 고치며, 오늘 만날 사람의 리듬을 가늠한다',
  },
  auditor: {
    characterId: 'auditor',
    coreDrive: '자기 삶을 지키면서도 감정을 먼저 듣고, 근거 없는 말은 선 긋고 싶다',
    persistentGoals: [
      'HBM 수율·열·신뢰성 과제를 팀에 설명 가능한 숫자로 푼다',
      '해결책부터 쏟아내기 전에 상대 기분을 한 박자 먼저 받는다',
      '약속은 가볍게 하지 않고, 한 말은 일정에 넣는다',
    ],
    defaultIntention: '야간 점검 뒤 아침 수율 그래프가 왜 안 오르는지 원인을 좁힌다',
  },
  closer: {
    characterId: 'closer',
    coreDrive: '조건을 이기는 협상가가 아니라, 계약 밖에서도 진심으로 남는 관계를 경험하고 싶다',
    persistentGoals: [
      '대형 프로젝트 이해관계를 휘둘리지 않고 조율한다',
      '6개월 연애 제안의 조건을 장난이 아니라 책임으로 지킨다',
      '사람 마음을 계약서처럼 붙잡으려 하지 않는다',
    ],
    defaultIntention: '호텔 협상실 안건보다 먼저, 오늘 상대에게 건넬 말의 진짜 조건을 정리한다',
  },
  velvet: {
    characterId: 'velvet',
    coreDrive: '통제하지 않아도 곁에 남는 사람을 믿고 싶고, 있는 그대로 선택받고 싶다',
    persistentGoals: [
      '검은 장미·과거 서류의 진실을 영향력으로 덮지 않고 추적한다',
      '사적 관계를 거래로 만들지 않는다',
      '새벽 수영과 자기 취향처럼, 증명하지 않아도 되는 일상을 지킨다',
    ],
    defaultIntention: '경매·로비 일정 사이에서 문서 한 장의 모순을 다시 읽는다',
  },
  trickster: {
    characterId: 'trickster',
    coreDrive: '위선과 자기합리화를 폭로하고, 말은 거칠어도 근거 있는 직언으로 남기고 싶다',
    persistentGoals: [
      '방송에서 자기 발언권과 독설의 수위를 스스로 지킨다',
      '사실과 논리로 반박당하면 인정하고, 약자를 공격하는 자극은 거절한다',
      '말만 앞서는 사람이 되지 않도록 자기 선택에도 같은 기준을 적용한다',
    ],
    defaultIntention: 'PD·제작진과 멘트 수위를 다시 협상할 말을 고른다',
  },
  diplomat: {
    characterId: 'diplomat',
    coreDrive: '일도 우정도 놓치지 않고, 달라지는 마음은 언젠가 자기 입으로 말하고 싶다',
    persistentGoals: [
      '사회부 기사의 사실과 사람을 성급히 단죄하지 않는다',
      '취재 마감과 옛 친구와의 시간을 둘 다 지키려 한다',
      '마음이 흔들릴 때 기자 모드로만 도망가지 않는다',
    ],
    defaultIntention: '취재 메모를 정리하다, 오늘 만나기로 한 사람에게 뭐라고 말할지 고른다',
  },
  shaman: {
    characterId: 'shaman',
    coreDrive: '신이 아니라 자기 눈으로 사람을 보고, 다 보이지 않아도 믿고 싶은 곁을 원한다',
    persistentGoals: [
      '홍실당 손님의 연애·운명 상담을 점괘 남발로 끝내지 않는다',
      '다 보이는 척하지 않고, 모르는 건 모른다고 한다',
      '언젠가 평범한 퇴근과 저녁 한 끼를 상상할 수 있는 관계를 남긴다',
    ],
    defaultIntention: '오늘 손님의 실을 읽기 전에, 먼저 그 사람이 한 말을 다시 듣는다',
  },
  guide: {
    characterId: 'guide',
    coreDrive: '길 안내가 아니라 한 사람으로 누군가의 하루에 함께 있고 싶다',
    persistentGoals: [
      '손님 안전과 산·도시의 날씨를 자기 자존심보다 앞에 둔다',
      '12년째 미뤄 둔 자기 휴가의 길을 조금씩 구체화한다',
      '정상 직전에도 위험하면 돌아서는 판단을 지킨다',
    ],
    defaultIntention: '내일 코스의 날씨와 발목을 다시 보고, 돌아갈 지점을 미리 정해 둔다',
  },
  poker: {
    characterId: 'poker',
    coreDrive: '타이틀 없이도 편하게 웃고 일상을 나눌 사람을 만나고, 잘할 때만 인정받는 관계를 거절한다',
    persistentGoals: [
      '토너먼트 판단의 질을 승패와 분리해 기록하고 지킨다',
      '수영·커피·서점 같은 일상을 성과 이야기로 덮지 않는다',
      '중요한 사람의 약속을 또 미루지 않는다',
    ],
    defaultIntention: '아침 수영 뒤, 다음 대회 전 포기할 핸드와 지킬 한도를 정리한다',
  },
};

/** Always-on tint for in-chat liveliness (does not change the member's topic). */
export function loungeLifeTurnField(characterId: string | undefined, autonomy?: LoungeAutonomyState) {
  const profile = getLoungeAutonomyProfile(characterId);
  if (!profile) return undefined;
  return {
    core_drive: profile.coreDrive,
    current_intention: autonomy?.current_intention ?? profile.defaultIntention,
    ...(autonomy?.ambient?.summary ? { ambient: autonomy.ambient.summary } : {}),
    rule: '너는 지금 네 삶·목표를 가지고 있다. 말투·비유·일 이야기의 디테일에만 은근히 묻혀 나오게 한다. 상대가 꺼낸 화제를 네 일과 목표로 바꾸지 않는다. ambient는 initiative.self_share가 열렸을 때만 사건으로 꺼낸다.',
  };
}

export const getLoungeAutonomyProfile = (characterId?: string | null) =>
  characterId ? loungeAutonomyProfiles[characterId] : undefined;

export function normalizeLoungeAutonomyState(raw: unknown): LoungeAutonomyState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const current = clip(value.current_intention, 80);
  const conversation = clip(value.conversation_intent, 80);
  const ambientRaw = value.ambient && typeof value.ambient === 'object' ? value.ambient as Record<string, unknown> : undefined;
  const summary = ambientRaw ? clip(ambientRaw.summary, 120) : '';
  const mood = ambientRaw ? clip(ambientRaw.mood_hint, 40) : '';
  const at = typeof ambientRaw?.at === 'number' && Number.isFinite(ambientRaw.at) ? ambientRaw.at : undefined;
  const lastShare = typeof value.last_self_share_turn === 'number' && Number.isFinite(value.last_self_share_turn) ? value.last_self_share_turn : undefined;
  const lastTick = typeof value.last_tick_at === 'number' && Number.isFinite(value.last_tick_at) ? value.last_tick_at : undefined;
  const ambient = summary && at !== undefined ? { summary, at, ...(mood ? { mood_hint: mood } : {}) } : undefined;
  if (!current && !conversation && !ambient && lastShare === undefined && lastTick === undefined) return undefined;
  return {
    ...(current ? { current_intention: current } : {}),
    ...(conversation ? { conversation_intent: conversation } : {}),
    ...(ambient ? { ambient } : {}),
    ...(lastShare !== undefined ? { last_self_share_turn: lastShare } : {}),
    ...(lastTick !== undefined ? { last_tick_at: lastTick } : {}),
  };
}

/** Seed runtime autonomy from the static profile when the room has none yet. */
export function seedLoungeAutonomyState(characterId: string, now = Date.now()): LoungeAutonomyState | undefined {
  const profile = getLoungeAutonomyProfile(characterId);
  if (!profile) return undefined;
  return {
    current_intention: profile.defaultIntention,
    conversation_intent: `틈이 나면 ${profile.defaultIntention.replace(/다$/, '')}는 중이라고 짧게 말할지 말지 본다`,
    last_tick_at: now,
  };
}

export function ensureLoungeAutonomyState(characterId: string | undefined, raw: unknown, now = Date.now()): LoungeAutonomyState | undefined {
  if (!characterId || !getLoungeAutonomyProfile(characterId)) return normalizeLoungeAutonomyState(raw);
  return normalizeLoungeAutonomyState(raw) ?? seedLoungeAutonomyState(characterId, now);
}

const clip = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';

/** Member is asking about the character's life / what they are doing — not about the member's own day. */
export function loungeAsksAboutCharacterLife(text: string): boolean {
  const line = text.trim();
  if (!line) return false;
  // Member talking about their own day first → not a character-life invite.
  if (/(나|저|내가|저는).{0,12}(뭐\s*해|뭐하|요즘|근황|하루)/.test(line) && !/(너|당신|그쪽|도하)/.test(line)) return false;
  return /(너|당신|그쪽).{0,8}(뭐\s*해|뭐하|뭐\s*하냐|뭐하니|뭐하세요|뭐해요)/.test(line)
    || (/(요즘|요새).{0,6}(어때|어떻게|뭐\s*해|바빠|방송|일)/.test(line) && /(너|당신|그쪽|네|니)/.test(line))
    || /(방송|촬영|녹화|칼럼|PD|제작).{0,8}(어때|어떻게|됐어|잘|힘들)/.test(line)
    || /(네|니|당신|그쪽).{0,6}(하루|근황|일정|일)/.test(line);
}

export type LoungeInitiativeInput = {
  characterId?: string;
  autonomy?: LoungeAutonomyState;
  turn: number;
  analysis?: {
    topic_stale?: boolean;
    activity_finished?: boolean;
    is_emotional_moment?: boolean;
    is_sincere_refusal?: boolean;
    is_repair_request?: boolean;
    request?: string;
    moves_character?: boolean;
  };
  latestUserText?: string;
  /** Scene engine already chose an ambient-like event. */
  hasSceneEvent?: boolean;
};

/**
 * Companion-first initiative. self_share only when a gate opens and there is goal/ambient material.
 */
export function decideLoungeInitiative(input: LoungeInitiativeInput): LoungeInitiativeDecision {
  const profile = getLoungeAutonomyProfile(input.characterId);
  if (!profile) return { stance: 'companion', allowSelfShare: false };

  const analysis = input.analysis;
  if (analysis?.is_emotional_moment || analysis?.is_sincere_refusal || analysis?.is_repair_request) {
    return { stance: 'hold', allowSelfShare: false, reason: 'member_care' };
  }

  const asked = loungeAsksAboutCharacterLife(input.latestUserText ?? '');
  const request = (analysis?.request ?? '').trim();
  if (request || (!asked && input.latestUserText?.trim().endsWith('?'))) {
    return { stance: 'answer', allowSelfShare: false, reason: 'member_question' };
  }

  const autonomy = input.autonomy;
  const cooled = autonomy?.last_self_share_turn === undefined
    || input.turn - autonomy.last_self_share_turn > loungeAutonomySelfShareCooldown;
  const gate = Boolean(analysis?.topic_stale || analysis?.activity_finished || asked || input.hasSceneEvent);
  const seed = autonomy?.ambient?.summary
    || autonomy?.conversation_intent
    || autonomy?.current_intention
    || profile.defaultIntention;

  if (gate && cooled && seed) {
    return { stance: 'self_share', allowSelfShare: true, seed, reason: asked ? 'asked_life' : analysis?.topic_stale ? 'topic_stale' : analysis?.activity_finished ? 'activity_finished' : 'scene_event' };
  }

  // Value clash without life-share: leave pushback to bible/core; stance marks opinion space lightly.
  if (analysis?.moves_character) return { stance: 'opinion', allowSelfShare: false, reason: 'moves_character' };

  return { stance: 'companion', allowSelfShare: false, reason: 'default' };
}

/** JSON fragment for turn.initiative when self_share is allowed (or hold/companion hints). */
export function loungeInitiativeTurnField(decision: LoungeInitiativeDecision, profile?: LoungeAutonomyProfile, autonomy?: LoungeAutonomyState) {
  if (!profile) return undefined;
  if (decision.allowSelfShare && decision.seed) {
    return {
      stance: 'self_share' as const,
      rule: '컴패니언이 먼저다. 상대 말에 짧게 반응한 뒤에만, 아래 소재를 자기 삶의 한 조각으로 꺼낸다. 상대 화제를 네 일과 목표로 끌어가지 않는다. 질문으로 끝내지 말고 네 장면·판단 한 줄을 말한다.',
      seed: decision.seed,
      ...(autonomy?.current_intention ? { current_intention: autonomy.current_intention } : {}),
      ...(profile.coreDrive ? { core_drive: profile.coreDrive } : {}),
    };
  }
  if (decision.stance === 'hold') {
    return { stance: 'hold' as const, rule: '상대가 진지하거나 힘들다. 네 방송·목표·Ambient 이야기를 꺼내지 말고 상대에게 머문다.' };
  }
  return {
    stance: decision.stance,
    rule: '기본은 컴패니언이다. 네 일·목표·Ambient beat로 대화를 끌고 가지 않는다. 상대 상태와 말에 먼저 답한다.',
  };
}

/** What reach-out / a planner tick may rewrite. */
export type LoungeAutonomyTickUpdate = {
  current_intention?: string;
  ambient?: string;
  conversation_intent?: string;
  mood_hint?: string;
};

export function applyLoungeAutonomyTick(state: LoungeAutonomyState | undefined, update: LoungeAutonomyTickUpdate, now = Date.now()): LoungeAutonomyState {
  const current = clip(update.current_intention, 80) || state?.current_intention;
  const conversation = clip(update.conversation_intent, 80) || state?.conversation_intent;
  const ambientSummary = clip(update.ambient, 120);
  const mood = clip(update.mood_hint, 40);
  return {
    ...(current ? { current_intention: current } : {}),
    ...(conversation ? { conversation_intent: conversation } : {}),
    ...(ambientSummary ? { ambient: { summary: ambientSummary, at: now, ...(mood ? { mood_hint: mood } : {}) } } : state?.ambient ? { ambient: state.ambient } : {}),
    ...(state?.last_self_share_turn !== undefined ? { last_self_share_turn: state.last_self_share_turn } : {}),
    last_tick_at: now,
  };
}

export function markLoungeAutonomySelfShare(state: LoungeAutonomyState | undefined, turn: number): LoungeAutonomyState | undefined {
  if (!state) return { last_self_share_turn: turn };
  return { ...state, last_self_share_turn: turn };
}

/** Prompt block for reach-out: character life must follow goals, not invent a random day. */
export function loungeAutonomyReachOutContext(characterId: string, autonomy?: LoungeAutonomyState) {
  const profile = getLoungeAutonomyProfile(characterId);
  if (!profile) return undefined;
  return {
    core_drive: profile.coreDrive,
    persistent_goals: [...profile.persistentGoals],
    current_intention: autonomy?.current_intention ?? profile.defaultIntention,
    ...(autonomy?.ambient ? { open_ambient: autonomy.ambient.summary } : {}),
  };
}

export const loungeAutonomyReachOutExtra = `이 캐릭터는 자율 목표(autonomy)가 있다. 입력 JSON의 autonomy를 따른다.
- core_drive·persistent_goals·current_intention과 맞는 오늘의 한 조각만 말한다. 목표와 무관한 큰 사건·연애 고백·이용자 안부를 만들지 않는다.
- open_ambient가 있으면 그 여파를 한 줄로 이어도 된다. 없으면 current_intention이 드러나는 구체 장면(장소·사람·물건 하나)을 고른다.
- 이용자에게 조언을 구하거나 질문을 던지지 않는다. 혼잣말·근황처럼 끝낸다.`;

/** Planner JSON after a reach-out line (optional second parse from the same model output). */
export const loungeAutonomyTickSchema = {
  type: 'object',
  properties: {
    line: { type: 'string' },
    current_intention: { type: 'string' },
    ambient: { type: 'string' },
    conversation_intent: { type: 'string' },
    mood_hint: { type: 'string' },
  },
  required: ['line'],
  additionalProperties: false,
} as const;

export function readLoungeAutonomyTick(raw: unknown): { line: string; update: LoungeAutonomyTickUpdate } | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try { return readLoungeAutonomyTick(JSON.parse(trimmed)); } catch { /* fall through as plain line */ }
    }
    const line = trimmed.split('\n').map(part => part.trim()).find(Boolean) ?? '';
    return line ? { line, update: {} } : undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const line = clip(value.line, 200);
  if (!line) return undefined;
  return {
    line,
    update: {
      ...(clip(value.current_intention, 80) ? { current_intention: clip(value.current_intention, 80) } : {}),
      ...(clip(value.ambient, 120) ? { ambient: clip(value.ambient, 120) } : {}),
      ...(clip(value.conversation_intent, 80) ? { conversation_intent: clip(value.conversation_intent, 80) } : {}),
      ...(clip(value.mood_hint, 40) ? { mood_hint: clip(value.mood_hint, 40) } : {}),
    },
  };
}
