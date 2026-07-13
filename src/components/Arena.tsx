import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart2, CheckCircle2, Circle, Clock, Lightbulb, MessageCircle, Pause, Play, Sparkles, Target, Users } from 'lucide-react';
import { BattleHeader } from './BattleHeader';
import { ArgumentCard } from './ArgumentCard';
import { ActionZone } from './ActionZone';
import { ResultModal } from './ResultModal';
import { EnglishRephrasePanel } from './EnglishRephrasePanel';
import {
  generateDebateJudgment,
  generateDebateResponse,
  generateFinalReport,
  generatePersonaResponse,
  generateRoundtableFinalReport,
  generateRoundtableResponse,
} from '../lib/api';
import type { AIResponse } from '../lib/api';
import {
  buildDebateIntro,
  getDebateLevelLabel,
  getDebateSteps,
  getDebateStepByTurn,
  getOppositePosition,
  getPositionLabel,
  personaDebateStep,
} from '../lib/debateEngine';
import { createReportShareLink, saveDebateRecord, saveEnglishRephraseEntry } from '../lib/history';
import { getPlayerFromStats } from '../lib/userStats';
import type { AppUser, Argument, BattleConfig, BattleState, DebateFocus, DebatePosition, DebateStep, EnglishRephraseEntry, FinalReport, Player } from '../types';

interface ArenaProps {
  user: AppUser | null;
  onLoginRequest: () => void;
}

const fallbackConfig: BattleConfig = {
  topic: '',
  timeLimit: 600,
  gameMode: 'debate',
  userPosition: 'affirmative',
  debateLevel: 'beginner',
};

const roundtablePlayerInfo: Record<'socrates' | 'kant' | 'nietzsche', Player> = {
  socrates: {
    id: 'socrates',
    name: '소크라테스',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Socrates',
    level: 99,
    rankBadge: '개념 검증',
    score: 9999,
    streak: 100,
    isAi: true,
  },
  kant: {
    id: 'kant',
    name: '칸트',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Kant',
    level: 99,
    rankBadge: '원칙 검증',
    score: 9999,
    streak: 100,
    isAi: true,
  },
  nietzsche: {
    id: 'nietzsche',
    name: '니체',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Nietzsche',
    level: 99,
    rankBadge: '가치 비판',
    score: 9999,
    streak: 100,
    isAi: true,
  },
};

const getPersonaName = (personaId?: BattleConfig['personaId']) => {
  if (personaId === 'socrates') return '소크라테스';
  if (personaId === 'jeong_yakyong') return '정약용';
  if (personaId === 'kant') return '칸트';
  if (personaId === 'nietzsche') return '니체';
  return 'AI 토론자';
};

const createArgumentId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `arg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const getTimestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const getScaledStepDuration = (step: DebateStep | undefined, steps: DebateStep[], totalSeconds: number) => {
  if (!step) return totalSeconds;

  const baseDuration = step.recommendedDurationSeconds ?? totalSeconds;
  const baseTotal = steps.reduce((sum, item) => sum + (item.recommendedDurationSeconds ?? 0), 0);

  if (!baseTotal || !totalSeconds) return baseDuration;
  return Math.max(30, Math.round((baseDuration / baseTotal) * totalSeconds));
};

const getAiResponseRoundTitle = (step: DebateStep) => {
  if (step.title.includes('입론')) return 'AI 입론';
  if (step.title.includes('AI 교차질문 답변')) return 'AI 확인 · 교차질문';
  if (step.title.includes('교차질문')) return 'AI 답변 · 교차질문';
  if (step.title.includes('반박')) return 'AI 반론';
  if (step.title.includes('중요성') || step.title.includes('최종') || step.title.includes('결론')) return 'AI 최종 발언';
  return `AI 응답 · ${step.title}`;
};

type CoachItem = {
  label: string;
  met: boolean;
  hint: string;
};

type EvaluationItem = {
  label: string;
  description: string;
};

const openingEvaluationItems = [
  {
    label: 'Claim 명확성',
    description: '내 입장이 논제에 직접 답하고, 한 문장으로 분명하게 정리되어 있는지 평가합니다.',
  },
  {
    label: 'Reason 연결성',
    description: '제시한 이유가 주장과 논리적으로 이어지는지, 중간 설명이 빠지지 않았는지 평가합니다.',
  },
  {
    label: 'Evidence 적합성',
    description: '사례·통계·자료·현실 근거가 주장을 충분히 뒷받침하는지 평가합니다.',
  },
];

const crossQuestionEvaluationItems: EvaluationItem[] = [
  {
    label: '1. 근거를 검증하라',
    description: '상대방이 제시한 근거가 충분한지 확인합니다.',
  },
  {
    label: '2. 전제를 찾아라',
    description: '좋은 질문은 상대방이 당연하다고 생각하는 가정을 드러냅니다.',
  },
  {
    label: '3. 예외를 찾아라',
    description: '모든 주장에는 예외가 존재합니다.',
  },
  {
    label: '4. 범위를 확인하라',
    description: '상대방 주장이 어디까지 적용되는지 확인합니다.',
  },
  {
    label: '5. 결과를 검증하라',
    description: '상대방이 말하는 결과가 정말 발생하는지 확인합니다.',
  },
];

const crossQuestionAnswerEvaluationItems: EvaluationItem[] = [
  {
    label: '답변 직접성',
    description: 'AI 질문의 핵심에 빗나가지 않고 직접 답했는지 평가합니다.',
  },
  {
    label: '논리 보강성',
    description: '내 주장과 이유, 근거를 연결해 부족했던 설명을 보강했는지 평가합니다.',
  },
  {
    label: '방어 활용성',
    description: '답변이 이후 반박이나 최종 설득에서 내 입장을 방어하는 데 활용될 수 있는지 평가합니다.',
  },
];

type FocusTip = {
  value: DebateFocus;
  label: string;
  headline: string;
  questions: string[];
  beginnerFrame: string;
  intermediateFrame: string;
};

const focusTips: FocusTip[] = [
  {
    value: 'fact',
    label: '사실확인형',
    headline: '참인지, 충분히 입증되는지부터 좁혀보세요.',
    questions: [
      '핵심 사실 주장은 무엇인가?',
      '그 사실을 확인할 자료, 사례, 기준은 무엇인가?',
      '상관관계와 인과관계를 혼동하고 있지는 않은가?',
    ],
    beginnerFrame: '저는 이 논제를 ___라는 사실이 충분히 입증되는지의 문제로 보고, ___ 입장입니다.',
    intermediateFrame: '핵심 질문은 “___가 실제로 사실인가?”이고, 확인 기준은 ___입니다.',
  },
  {
    value: 'policy',
    label: '정책형',
    headline: '무엇을 해야 하는지, 실행 가능한 해법으로 끌고 가세요.',
    questions: [
      '누가 무엇을 해야 하는가?',
      '비용, 부작용, 실행 가능성은 어떤가?',
      '더 나은 대안과 비교했을 때 왜 이 선택이 나은가?',
    ],
    beginnerFrame: '저는 이 문제에서 ___를 해야 한다고 봅니다. 이유는 ___이고, 예상 효과는 ___입니다.',
    intermediateFrame: '이 논제의 핵심은 “___를 해야 하는가?”이며, 판단 기준은 효과성과 부작용입니다.',
  },
  {
    value: 'value',
    label: '가치판단형',
    headline: '무엇이 더 중요하고 정당한지 기준을 세워보세요.',
    questions: [
      '충돌하는 가치는 무엇인가?',
      '공정, 자유, 안전, 권리 중 무엇을 우선해야 하는가?',
      '그 기준을 비슷한 상황에도 일관되게 적용할 수 있는가?',
    ],
    beginnerFrame: '저는 이 논제가 ___와 ___ 중 무엇을 더 우선할지의 문제라고 보고, ___를 더 중시합니다.',
    intermediateFrame: '핵심 질문은 “___가 ___보다 우선해야 하는가?”이고, 판단 기준은 정당성과 일관성입니다.',
  },
];

const getFocusTip = (focus?: DebateFocus) =>
  focusTips.find(item => item.value === focus) ?? focusTips[0];

const shouldShowFocusTip = (step: DebateStep | undefined, level?: BattleConfig['debateLevel']) => {
  if (!step) return false;
  if (level === 'intermediate') return step.id === 'intermediate-opening-user';
  return false;
};

const hasAny = (content: string, keywords: string[]) => keywords.some(keyword => content.includes(keyword));

const getChecklistHint = (label: string): string => {
  if (label.includes('핵심 용어를 정의했는가')) return '토론에서 중요한 단어의 의미를 명확히 정하세요.';
  if (label.includes('논제의 범위를 정했는가')) return '논의할 범위와 제외할 범위를 구분하세요.';
  if (label.includes('논제의 핵심 질문은 무엇인가')) return '표면적인 문장이 아니라 토론의 본질적인 질문을 찾아보세요.';
  if (label.includes('상대와 정의가 다른 용어는 없는가')) return '같은 단어라도 서로 다른 의미로 사용하면 토론이 엇갈릴 수 있습니다.';
  if (label.includes('대안 제시력')) return '상대 해결책보다 실행 가능하고 부작용이 적은 대안을 제시해 주세요.';
  if (label.includes('비교우위 입증력')) return '상대 입장과 내 입장을 같은 기준으로 비교하고, 내 입장이 더 우월한 이유를 밝혀주세요.';
  if (label.includes('내 주장의 중요성')) return '내 주장이 왜 중요하고 우선되어야 하는지 영향의 크기, 범위, 우선순위로 설명해 주세요.';
  if (label.includes('쟁점 파악력')) return '승패를 가르는 핵심 질문이나 판단 지점을 한 문장으로 짚어보세요.';
  if (label.includes('전제 분석력')) return '상대 주장이 성립하려면 반드시 참이어야 하는 숨은 전제를 드러내세요.';
  if (label.includes('근거 검증력')) return '상대 근거의 신뢰성, 관련성, 충분성을 각각 구체적으로 검토해 주세요.';
  if (label.includes('충돌 지점 파악')) return '내 주장과 상대 주장이 실제로 부딪히는 핵심 충돌 지점을 표시해 주세요.';
  if (label.includes('상대 주장 분석')) return '앞 단계에서 확인한 핵심 쟁점, 핵심 전제, 근거 타당성을 반박의 출발점으로 삼아주세요.';
  if (label.includes('핵심 논지 이해')) return '상대방의 핵심 주장을 정확하게 짚었는지 확인해 주세요.';
  if (label.includes('논리 구조 파악')) return '상대방의 주장과 이유, 근거를 명확하게 분리해서 파악해 주세요.';
  if (label.includes('상대 주장 요약력')) return '상대의 주장을 내 말로 다시 한번 정리해 주세요.';
  if (label.includes('비약') || label.includes('모순')) return '상대 결론이 이유나 근거에서 자연스럽게 이어지지 않는 부분을 정확히 짚어주세요.';
  if (label.includes('허점')) return '상대 주장과 이유 사이에서 빠진 전제나 이어지지 않는 부분을 찾아보세요.';
  if (label.includes('충분')) return '상대 근거가 주장 전체를 뒷받침하기에 충분한지, 범위나 사례가 부족하지 않은지 점검해 주세요.';
  if (label.includes('찬성/반대') || label.includes('입장')) return '찬성 또는 반대 입장을 먼저 분명히 밝혀주세요.';
  if (label.includes('주장')) return '주장(Claim)을 한 문장으로 압축해 주세요.';
  if (label.includes('이유')) return '주장을 뒷받침하는 이유(Reason)를 “왜냐하면”으로 연결해 주세요.';
  if (label.includes('근거')) return '이유에 맞는 근거(Evidence), 예시, 사실, 자료를 붙여 주세요.';
  if (label.includes('전제')) return '이유와 주장을 이어주는 전제(warrant)가 합리적인지 보여주세요.';
  if (label.includes('예시')) return '짧은 사례나 상황을 덧붙이면 주장이 더 선명해집니다.';
  if (label.includes('질문')) return '상대 주장, 이유, 근거 중 하나를 짧고 확인 가능하게 물어보세요.';
  if (label.includes('요약') || label.includes('정리') || label.includes('구조')) return '상대가 실제로 말한 주장, 이유, 근거를 공정하게 정리해 주세요.';
  if (label.includes('왜곡') || label.includes('덧붙')) return '상대가 말하지 않은 내용을 추가하지 않았는지 확인해 주세요.';
  if (label.includes('반박') || label.includes('약점') || label.includes('부족')) return '상대 주장의 어느 부분이 왜 부족한지 지목해 주세요.';
  if (label.includes('유형')) return '전제/근거/인과/범위/대안/비교 반박 중 어떤 유형인지 표시해 주세요.';
  if (label.includes('비교') || label.includes('중요') || label.includes('기준')) return '피해 크기, 영향 범위, 현실성, 가능성, 긴급성 같은 기준으로 비교해 주세요.';
  if (label.includes('충돌') || label.includes('쟁점')) return '양측 주장이 실제로 부딪히는 승부처를 정리해 주세요.';
  if (label.includes('새로운 주장')) return '최종 단계에서는 새 주장을 추가하지 말고 나온 쟁점을 정리해 주세요.';
  return '이 체크 항목이 발언에 드러나도록 한 문장 더 보강해 주세요.';
};

const isChecklistMet = (label: string, content: string): boolean => {
  if (label.includes('핵심 용어를 정의했는가')) return hasAny(content, ['의미', '정의', '뜻', '용어', '이란', '란']);
  if (label.includes('논제의 범위를 정했는가')) return hasAny(content, ['범위', '제외', '한정', '포함', '다루']);
  if (label.includes('논제의 핵심 질문은 무엇인가')) return hasAny(content, ['질문', '본질', '핵심', '문제', '쟁점']);
  if (label.includes('상대와 정의가 다른 용어는 없는가')) return hasAny(content, ['다를', '상대', '차이', '다르게', '엇갈', '오해']);
  if (label.includes('대안 제시력')) return hasAny(content, ['대안', '현실적', '실행', '부작용', '해결책', '방안']);
  if (label.includes('비교우위 입증력')) return hasAny(content, ['비교', '우위', '우월', '상대', '더 설득', '더 타당']);
  if (label.includes('내 주장의 중요성')) return hasAny(content, ['중요', '우선', '영향', '범위', '크기', '피해']);
  if (label.includes('쟁점 파악력')) return hasAny(content, ['쟁점', '핵심', '승패', '판단', '문제']);
  if (label.includes('전제 분석력')) return hasAny(content, ['전제', '가정', '성립', '깔고', '의존']);
  if (label.includes('근거 검증력')) return hasAny(content, ['신뢰성', '관련성', '충분성', '근거', '자료', '검증']);
  if (label.includes('충돌 지점 파악')) return hasAny(content, ['충돌', '부딪', '대립', '쟁점', '차이']);
  if (label.includes('상대 주장 분석')) return hasAny(content, ['핵심 쟁점', '핵심 전제', '근거 타당', '상대 주장 분석', '점검', '전제', '근거']);
  if (label.includes('핵심 논지 이해')) return hasAny(content, ['논지', '핵심', '주장']);
  if (label.includes('논리 구조 파악')) return hasAny(content, ['이유', '근거', '구조', '분리', '전제', '주장']);
  if (label.includes('상대 주장 요약력')) return hasAny(content, ['정리', '요약', '제 생각', '이해']);
  if (label.includes('비약') || label.includes('모순')) return hasAny(content, ['비약', '모순', '이어지지', '논리', '충돌', '전제', '결론']);
  if (label.includes('허점')) return hasAny(content, ['허점', '빠진', '부족', '연결', '논리', '전제', '이어지']);
  if (label.includes('충분')) return hasAny(content, ['충분', '부족', '근거', '자료', '사례', '대표', '뒷받침']);
  if (label.includes('찬성/반대') || label.includes('입장')) return hasAny(content, ['찬성', '반대', '입장', '저는', '저희는']);
  if (label.includes('주장')) return hasAny(content, ['주장', 'claim', '생각합니다', '찬성', '반대', '해야 합니다']);
  if (label.includes('이유')) return hasAny(content, ['이유', 'reason', '왜냐', '때문', '따라서']);
  if (label.includes('근거')) return hasAny(content, ['근거', 'evidence', '사실', '자료', '통계', '사례', '예시']);
  if (label.includes('전제')) return hasAny(content, ['전제', 'warrant', '원칙', '이어', '연결']);
  if (label.includes('예시')) return hasAny(content, ['예시', '예를 들어', '사례', '상황']);
  if (label.includes('감정')) return !hasAny(content, ['그냥', '느낌', '싫어', '좋아', '짜증']) && hasAny(content, ['이유', '근거', '때문']);
  if (label.includes('질문')) return content.includes('?') || hasAny(content, ['무엇', '왜', '어떻게', '묻', '질문']);
  if (label.includes('직접 관련') || label.includes('핵심')) return hasAny(content, ['주장', '근거', '이유', '전제', '핵심', '쟁점']);
  if (label.includes('구체')) return hasAny(content, ['구체', '근거', '예시', '사례', '자료', '어떤']);
  if (label.includes('공격') || label.includes('감정적')) return !hasAny(content, ['말도 안', '무조건 틀', '바보', '감정']);
  if (label.includes('요약') || label.includes('정리') || label.includes('구조')) return hasAny(content, ['상대', 'ai', '주장', '이유', '근거', '핵심']);
  if (label.includes('왜곡') || label.includes('말하지 않은')) return !hasAny(content, ['아마', '속셈', '분명히 원한다']);
  if (label.includes('반박') || label.includes('약점') || label.includes('부족')) return hasAny(content, ['하지만', '그러나', '반박', '약점', '부족', '한계', '문제']);
  if (label.includes('유형')) return hasAny(content, ['전제', '근거', '인과', '범위', '대안', '비교']);
  if (label.includes('교차질문')) return hasAny(content, ['질문', '답변', '확인', '교차']);
  if (label.includes('비교') || label.includes('중요') || label.includes('기준')) return hasAny(content, ['더 중요', '비교', '기준', '영향', '범위', '현실성', '가능성', '긴급성', '우위']);
  if (label.includes('충돌') || label.includes('쟁점')) return hasAny(content, ['충돌', '쟁점', '승부처', '핵심']);
  if (label.includes('새로운 주장')) return !hasAny(content, ['새롭게', '또 다른', '추가로']);
  if (label.includes('최종')) return hasAny(content, ['최종', '결론', '따라서', '찬성', '반대']);
  return false;
};

const buildCoachChecklist = (step: DebateStep | undefined, latestUserArgument?: Argument): CoachItem[] => {
  if (!step) return [];

  const content = latestUserArgument?.content.replace(/\s+/g, ' ').toLowerCase() ?? '';
  const title = step.title;

  if (!latestUserArgument) {
    if (step.checklist?.length) {
      return step.checklist.map(label => ({
        label,
        met: false,
        hint: getChecklistHint(label),
      }));
    }

    return [
      { label: '국면 이해', met: false, hint: `${title} 단계의 요구사항을 먼저 확인하세요.` },
      { label: '구조화', met: false, hint: '발언을 항목별로 나누면 AI 피드백이 더 정확해집니다.' },
    ];
  }

  if (step.checklist?.length) {
    return step.checklist.map(label => ({
      label,
      met: isChecklistMet(label, content),
      hint: getChecklistHint(label),
    }));
  }

  const roundId = step.roundId;

  if (step.id.includes('definition') || step.id.includes('framing')) {
    return [
      { label: '핵심 용어 정의', met: hasAny(content, ['정의', '의미', '용어']), hint: '논제의 핵심 단어를 어떻게 쓸지 밝혀주세요.' },
      { label: '판단 기준', met: hasAny(content, ['기준', '판단', '우선', '승패']), hint: '무엇을 기준으로 이기는 토론인지 제시하세요.' },
      { label: '토론 범위', met: hasAny(content, ['범위', '한정', '전제', '상황']), hint: '논의할 범위와 제외할 범위를 정하면 쟁점이 선명해집니다.' },
    ];
  }

  if (roundId === 'opening') {
    return [
      { label: '주장 제시', met: hasAny(content, ['주장', '입장', '찬성', '반대']), hint: '내 입장을 한 문장으로 먼저 고정하세요.' },
      { label: '근거 제시', met: hasAny(content, ['근거', '사례', '통계', '자료', '예시']), hint: '주장을 받치는 사실, 사례, 자료가 필요합니다.' },
      { label: '이유 연결', met: hasAny(content, ['이유', '왜냐', '때문', '따라서']), hint: '근거가 왜 주장으로 이어지는지 연결해 주세요.' },
    ];
  }

  if (roundId === 'rebuttal') {
    return [
      { label: '상대 주장 요약', met: hasAny(content, ['요약', '상대', 'ai', '주장은', '근거는']), hint: '반박 전에 상대 주장을 짧게 정리하세요.' },
      { label: '취약점 지적', met: hasAny(content, ['전제', '허점', '약점', '문제', '한계']), hint: '상대 논리의 약한 고리를 정확히 찍어주세요.' },
      { label: '내 반박 근거', met: hasAny(content, ['반박', '근거', '이유', '사례']), hint: '왜 그 지적이 타당한지 내 근거를 붙이세요.' },
    ];
  }

  if (roundId === 'cross-question') {
    return [
      { label: '질문 답변', met: hasAny(content, ['답', '답변', '대답']), hint: '상대 질문에 먼저 직접 답하세요.' },
      { label: '검증 질문', met: content.includes('?') || hasAny(content, ['질문', '묻고', '검증']), hint: '상대 기준이나 근거를 흔드는 질문을 던지세요.' },
      { label: '질문의 의도', met: hasAny(content, ['중요', '이유', '왜냐', '확인']), hint: '그 질문이 왜 쟁점에 중요한지 설명하세요.' },
    ];
  }

  if (roundId === 'counter-rebuttal') {
    if (step.id === 'support-user') {
      return [
        { label: '보완할 약점', met: hasAny(content, ['약점', '보완', '한계', '부족']), hint: '내 주장에 남은 약점이나 빈틈을 먼저 짚어주세요.' },
        { label: '추가 근거', met: hasAny(content, ['근거', '사례', '예시', '자료', '추가']), hint: '보강할 새 근거, 사례, 설명을 붙이세요.' },
        { label: '설득력 설명', met: hasAny(content, ['설득', '이유', '왜냐', '때문', '더']), hint: '그 보강이 왜 내 주장을 더 강하게 만드는지 설명하세요.' },
      ];
    }

    return [
      { label: '상대 반박 수용/정리', met: hasAny(content, ['상대', 'ai', '반박', '요약']), hint: '상대 반박을 먼저 정확히 받아주세요.' },
      { label: '내 답변', met: hasAny(content, ['답변', '반박', '그러나', '하지만']), hint: '상대 반박에 대한 내 응답을 분명히 하세요.' },
      { label: '보강 근거', met: hasAny(content, ['보강', '추가', '근거', '사례']), hint: '내 주장이 더 버티도록 근거를 보강하세요.' },
      { label: '비교 우위', met: hasAny(content, ['더', '우위', '중요', '우선', '비교']), hint: '양쪽 중 내 주장이 왜 더 중요한지 비교하세요.' },
    ];
  }

  if (roundId === 'closing') {
    return [
      { label: '최종 입장', met: hasAny(content, ['최종', '결론', '입장', '주장']), hint: '마지막 입장을 짧고 단단하게 정리하세요.' },
      { label: '가장 강한 근거', met: hasAny(content, ['가장', '핵심', '근거', '이유']), hint: '새 쟁점 대신 제일 강한 근거를 다시 세우세요.' },
      { label: '상대보다 나은 이유', met: hasAny(content, ['상대', '보다', '우위', '더 중요', '우선']), hint: '왜 내 쪽이 상대보다 설득력 있는지 비교하세요.' },
    ];
  }

  return [
    { label: '수정 주장', met: hasAny(content, ['수정', '주장', '입장']), hint: '피드백을 반영한 새 주장을 제시하세요.' },
    { label: '수정 근거', met: hasAny(content, ['근거', '사례', '이유']), hint: '근거와 이유도 함께 고쳐야 합니다.' },
    { label: '반영한 피드백', met: hasAny(content, ['반영', '피드백', '보완']), hint: '무엇을 고쳤는지 명시하면 학습 효과가 커집니다.' },
  ];
};

const createInitialBattleState = (config: BattleConfig, user: AppUser | null): BattleState => {
  const userPosition = config.userPosition ?? 'affirmative';
  const aiPosition = getOppositePosition(userPosition);
  const debateLevel = config.debateLevel ?? 'beginner';
  const debateFocus = config.debateFocus;
  const debateSteps = getDebateSteps(debateLevel);
  const isDebateMode = config.gameMode === 'debate';
  const isRoundtableMode = config.gameMode === 'roundtable';

  let playerA: Player = {
    id: 'p1',
    name: isDebateMode ? `나 · ${getPositionLabel(userPosition)}` : '나',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    level: 1,
    rankBadge: '브론즈',
    score: 0,
    streak: 0,
    isAi: false,
    league: '초급'
  };

  if (user) {
    playerA.name = isDebateMode ? `${user.nickname} · ${getPositionLabel(userPosition)}` : user.nickname;
  }

  return {
    id: 'battle-local',
    topic: config.topic,
    matchType:
      config.gameMode === 'debate'
        ? `정식 토론 · ${getDebateLevelLabel(debateLevel)} · ${getPositionLabel(userPosition)}`
        : config.gameMode === 'persona'
          ? '개별 페르소나 토론'
          : config.gameMode === 'roundtable'
            ? '철학자 라운드테이블'
            : '1:1 토론',
    gameMode: config.gameMode,
    personaId: config.personaId,
    userPosition: isDebateMode ? userPosition : undefined,
    aiPosition: isDebateMode ? aiPosition : undefined,
    debateLevel: isDebateMode ? debateLevel : undefined,
    debateFocus: isDebateMode ? debateFocus : undefined,
    timeLimit: config.timeLimit,
    timeRemaining: config.timeLimit,
    playerA,
    playerB: {
      id: 'p2',
      name: isDebateMode
        ? `AI 토론자 · ${getPositionLabel(aiPosition)}`
        : isRoundtableMode
          ? '소크라테스 · 칸트 · 니체'
          : getPersonaName(config.personaId),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${isRoundtableMode ? 'Roundtable' : 'Socrates'}`,
      level: 99,
      rankBadge: isDebateMode ? getDebateLevelLabel(debateLevel) : isRoundtableMode ? '라운드테이블' : '철학자',
      score: 9999,
      streak: 100,
      isAi: config.gameMode !== 'pvp',
    },
    arguments: isDebateMode
      ? [
          {
            id: 'debate-intro',
            playerId: 'p2',
            isAi: true,
            content: buildDebateIntro(config.topic, userPosition, debateLevel),
            timestamp: '시작',
            roundId: 'opening',
            roundTitle: '시작 질문',
            nextTask: debateSteps[0].instruction,
          },
        ]
      : [],
    isFinished: false,
  };
};

const createTimeUpReport = (): FinalReport => ({
  overallFeedback: '제한 시간이 종료되었습니다. 이번 토론은 최종 평가까지 진행되지 않아 시간 종료로 기록됩니다.',
  categories: [
    { name: '완주', score: 0, maxScore: 100, feedback: '최종 발언까지 완료하지 못했습니다.' },
    { name: '구조', score: 0, maxScore: 100, feedback: '다음에는 핵심 주장과 반론을 더 빠르게 정리해보세요.' },
  ],
  totalScore: 0,
  xpEarned: 0,
});

const createRoundtableArguments = (aiRes: AIResponse, roundTitle: string): Argument[] => {
  const timestamp = getTimestamp();

  if (aiRes.turns?.length) {
    return aiRes.turns.map((turn, index) => ({
      id: createArgumentId(),
      playerId: turn.speaker,
      isAi: true,
      content: turn.target ? `[대상: ${turn.target}]\n${turn.content}` : turn.content,
      aiQuestion: index === aiRes.turns!.length - 1 ? aiRes.question : undefined,
      aiLesson: index === aiRes.turns!.length - 1 ? aiRes.lesson : undefined,
      nextTask: index === aiRes.turns!.length - 1 ? aiRes.question : undefined,
      timestamp,
      roundTitle,
    }));
  }

  return [
    {
      id: createArgumentId(),
      playerId: 'socrates',
      isAi: true,
      content: aiRes.argument,
      aiQuestion: aiRes.question,
      aiLesson: aiRes.lesson,
      nextTask: aiRes.question,
      timestamp,
      roundTitle,
    },
  ];
};

export const Arena: React.FC<ArenaProps> = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const savedRecordIdRef = useRef<string | null>(null);
  const roundtableOpeningStartedRef = useRef(false);
  const config = location.state as BattleConfig | null;
  const effectiveConfig = config ?? fallbackConfig;

  const [battleState, setBattleState] = useState<BattleState>(() => createInitialBattleState(effectiveConfig, user));
  const [showResultModal, setShowResultModal] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);
  const [stepTimer, setStepTimer] = useState({ stepId: 'free-discussion', elapsedSeconds: 0 });
  const [isPersonaPlayerTurn, setIsPersonaPlayerTurn] = useState(true);
  const [isEnglishReplayMode, setIsEnglishReplayMode] = useState(false);
  const [englishRephrases, setEnglishRephrases] = useState<EnglishRephraseEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isReportGenerating, setIsReportGenerating] = useState(false);

  useEffect(() => {
    if (user) {
      getPlayerFromStats(user.id, user.nickname).then(player => {
        setBattleState(prev => {
          const newPlayer = { ...player };
          if (prev.gameMode === 'debate') {
            newPlayer.name = `${user.nickname} · ${getPositionLabel(prev.userPosition)}`;
          } else {
            newPlayer.name = user.nickname;
          }
          return { ...prev, playerA: newPlayer };
        });
      });
    }
  }, [user]);

  const roundtablePlayers = useMemo<Player[]>(
    () => [battleState.playerA, roundtablePlayerInfo.socrates, roundtablePlayerInfo.kant, roundtablePlayerInfo.nietzsche],
    [battleState.playerA],
  );

  const activeDebateStep = battleState.gameMode === 'debate'
    ? getDebateStepByTurn(
        battleState.timeLimit,
        battleState.timeRemaining,
        battleState.arguments.filter(argument => !argument.isAi).length,
        battleState.debateLevel,
      )
    : undefined;
  const debateStepList = battleState.gameMode === 'debate' ? getDebateSteps(battleState.debateLevel) : [];
  const debateUserTurnCount = battleState.arguments.filter(argument => !argument.isAi).length;
  const debateRoundProgress = activeDebateStep
    ? {
        current: Math.min(debateUserTurnCount + 1, debateStepList.length),
        total: debateStepList.length,
      }
    : undefined;
  const currentActionStep = battleState.gameMode === 'persona' ? personaDebateStep : activeDebateStep;
  const isPlayerTurn = battleState.gameMode === 'debate'
    ? !isAiThinking && !isPaused
    : isPersonaPlayerTurn && !isAiThinking && !isPaused;
  const currentActionStepId = currentActionStep?.id ?? 'free-discussion';
  const stepElapsedSeconds = stepTimer.stepId === currentActionStepId ? stepTimer.elapsedSeconds : 0;
  const currentRecommendedSeconds = getScaledStepDuration(currentActionStep, debateStepList, battleState.timeLimit);
  const currentRemainingSeconds = Math.max(0, currentRecommendedSeconds - stepElapsedSeconds);
  const currentOvertimeSeconds = Math.max(0, stepElapsedSeconds - currentRecommendedSeconds);
  const sessionRemainingSeconds = Math.max(0, battleState.timeLimit - sessionElapsedSeconds);

  useEffect(() => {
    if (!config) {
      navigate('/', { replace: true });
    }
  }, [config, navigate]);

  useEffect(() => {
    if (battleState.isFinished || isPaused) return;

    const interval = setInterval(() => {
      if (battleState.gameMode === 'debate') {
        setSessionElapsedSeconds(prev => prev + 1);
        setStepTimer(prev => {
          const elapsedSeconds = prev.stepId === currentActionStepId ? prev.elapsedSeconds : 0;
          return {
            stepId: currentActionStepId,
            elapsedSeconds: isPlayerTurn && currentActionStep ? elapsedSeconds + 1 : elapsedSeconds,
          };
        });
        return;
      }

      setBattleState(prev => {
        if (prev.timeRemaining <= 1) {
          return { ...prev, timeRemaining: 0, isFinished: true };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [battleState.gameMode, battleState.isFinished, currentActionStep, currentActionStepId, isPaused, isPlayerTurn]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [battleState.arguments.length, isAiThinking]);

  useEffect(() => {
    if (
      battleState.gameMode !== 'roundtable' ||
      battleState.isFinished ||
      battleState.arguments.length > 0 ||
      roundtableOpeningStartedRef.current
    ) {
      return;
    }

    roundtableOpeningStartedRef.current = true;
    setIsAiThinking(true);
    setIsPersonaPlayerTurn(false);

    const openRoundtable = async () => {
      const aiRes = await generateRoundtableResponse(
        battleState.topic,
        [],
        battleState.timeLimit,
        battleState.timeRemaining,
      );

      setBattleState(prev => ({
        ...prev,
        arguments: createRoundtableArguments(aiRes, '독립 발언'),
      }));
      setIsAiThinking(false);
      setIsPersonaPlayerTurn(true);
    };

    void openRoundtable();
  }, [battleState.arguments.length, battleState.gameMode, battleState.isFinished, battleState.timeLimit, battleState.timeRemaining, battleState.topic]);

  const persistDebateRecord = useCallback(async (report: FinalReport, finalState: BattleState) => {
    if (!user || savedRecordIdRef.current) return;

    const completedAt = new Date().toISOString();
    // `debate_records.id` is a UUID in Supabase.  The previous `record_...`
    // value is rejected by Postgres before the record (and its XP) can be
    // stored, so use a database-compatible identifier on both localhost and
    // the deployed site.
    const recordId = crypto.randomUUID();
    savedRecordIdRef.current = recordId;

    try {
      await saveDebateRecord({
        id: recordId,
        userId: user.id,
        topic: finalState.topic,
        matchType: finalState.matchType,
        gameMode: finalState.gameMode,
        userPosition: finalState.userPosition,
        aiPosition: finalState.aiPosition,
        debateLevel: finalState.debateLevel,
        debateFocus: finalState.debateFocus,
        durationSeconds: finalState.timeLimit - finalState.timeRemaining,
        completedAt,
        arguments: finalState.arguments,
        report,
        englishRephrases,
      });
    } catch (e) {
      console.error(e);
      savedRecordIdRef.current = null;
    }
  }, [englishRephrases, user]);

  const handleSaveEnglishRephrase = useCallback((entry: EnglishRephraseEntry) => {
    setEnglishRephrases(prev => [
      entry,
      ...prev.filter(item => item.argumentId !== entry.argumentId),
    ]);

    if (!user || !savedRecordIdRef.current) return;
    saveEnglishRephraseEntry(user.id, savedRecordIdRef.current, entry);
  }, [user]);

  const handleShareReport = useCallback(async () => {
    if (!user || !savedRecordIdRef.current) {
      throw new Error('토론 기록 저장이 완료된 뒤 공유할 수 있습니다.');
    }

    return createReportShareLink(user.id, savedRecordIdRef.current);
  }, [user]);

  useEffect(() => {
    if (!battleState.isFinished || battleState.timeRemaining > 0 || showResultModal || finalReport || isEnglishReplayMode) return;

    const finishByTime = async () => {
      if (battleState.gameMode === 'persona' && battleState.personaId) {
        setIsAiThinking(true);
        const report = await generateFinalReport(battleState.topic, battleState.arguments, battleState.personaId);
        persistDebateRecord(report, battleState);
        setFinalReport(report);
        setIsAiThinking(false);
      } else if (battleState.gameMode === 'roundtable') {
        setIsAiThinking(true);
        const report = await generateRoundtableFinalReport(battleState.topic, battleState.arguments);
        persistDebateRecord(report, battleState);
        setFinalReport(report);
        setIsAiThinking(false);
      } else if (battleState.gameMode === 'debate') {
        setIsAiThinking(true);
        const report = await generateDebateJudgment(
          battleState.topic,
          battleState.arguments,
          battleState.userPosition ?? 'affirmative',
          battleState.debateLevel,
        );
        persistDebateRecord(report, battleState);
        setFinalReport(report);
        setIsAiThinking(false);
      } else {
        const report = createTimeUpReport();
        persistDebateRecord(report, battleState);
        setFinalReport(report);
      }
      setShowResultModal(true);
    };

    void finishByTime();
  }, [battleState, finalReport, isEnglishReplayMode, persistDebateRecord, showResultModal]);

  if (!config) {
    return null;
  }

  if (isEnglishReplayMode) {
    return (
      <div className="app-container page-scroll">
        <EnglishRephrasePanel
          topic={battleState.topic}
          arguments={battleState.arguments}
          initialRephrases={englishRephrases}
          onSaveRephrase={handleSaveEnglishRephrase}
          onBackToReport={() => setShowResultModal(true)}
          onExit={() => navigate('/')}
        />
        {showResultModal && (
          <ResultModal
            report={finalReport}
            topic={battleState.topic}
            playerA={battleState.playerA}
            playerB={battleState.playerB}
            debateArguments={battleState.arguments}
            onClose={() => navigate('/')}
            onStartEnglishReplay={() => setShowResultModal(false)}
            onShareReport={handleShareReport}
          />
        )}
      </div>
    );
  }

  const submitDebateAction = async (content: string, activeStep: DebateStep) => {
    const userPosition: DebatePosition = battleState.userPosition ?? 'affirmative';
    const elapsedSeconds = stepElapsedSeconds;
    const recommendedDurationSeconds = getScaledStepDuration(activeStep, debateStepList, battleState.timeLimit);
    const newArg: Argument = {
      id: createArgumentId(),
      playerId: battleState.playerA.id,
      isAi: false,
      content,
      timestamp: getTimestamp(),
      roundId: activeStep.roundId,
      roundTitle: activeStep.title,
      recommendedDurationSeconds,
      elapsedSeconds,
      overtimeSeconds: Math.max(0, elapsedSeconds - recommendedDurationSeconds),
    };

    const newArgs = [...battleState.arguments, newArg];
    const completedStructuredDebate = newArgs.filter(argument => !argument.isAi).length >= debateStepList.length;

    if (completedStructuredDebate) {
      setBattleState(prev => ({
        ...prev,
        arguments: newArgs,
      }));
      setIsAiThinking(true);

      try {
        const aiRes = await generateDebateResponse(
          battleState.topic,
          newArgs,
          userPosition,
          activeStep.roundId,
          battleState.timeLimit,
          sessionRemainingSeconds,
          battleState.debateLevel,
          battleState.debateFocus,
          activeStep.id,
        );
        const aiArg: Argument = {
          id: createArgumentId(),
          playerId: battleState.playerB.id,
          isAi: true,
          content: aiRes.argument,
          aiQuestion: undefined,
          nextTask: '최종 평가를 확인하세요.',
          turnXp: aiRes.turnXp,
          turnFeedback: aiRes.turnFeedback,
          turnFeedbackDetail: aiRes.turnFeedbackDetail,
          timestamp: getTimestamp(),
          roundId: activeStep.roundId,
          roundTitle: 'AI 최종 발언',
        };
        const finalArgs = [...newArgs, aiArg];
        const finalState: BattleState = {
          ...battleState,
          arguments: finalArgs,
          isFinished: true,
          timeRemaining: sessionRemainingSeconds,
        };

        setBattleState(finalState);
        setIsAiThinking(false);
        setIsReportGenerating(true);

        const report = await generateDebateJudgment(
          finalState.topic,
          finalState.arguments,
          finalState.userPosition ?? 'affirmative',
          finalState.debateLevel,
        );
        persistDebateRecord(report, finalState);
        setFinalReport(report);
        setIsReportGenerating(false);
      } catch (error) {
        console.error('Debate completion error:', error);
        // API 에러 발생 시에도 토론을 마무리하고 기록 저장
        const fallbackState: BattleState = {
          ...battleState,
          arguments: newArgs,
          isFinished: true,
          timeRemaining: sessionRemainingSeconds,
        };
        setBattleState(fallbackState);
        setIsAiThinking(false);
        setIsReportGenerating(true);

        const fallbackReport: FinalReport = {
          overallFeedback: 'AI 평가 서버에 일시적 문제가 발생하여 자동 채점이 불가합니다. 토론 내용은 기록에 저장됩니다.',
          categories: [],
          totalScore: 0,
          xpEarned: 50, // 기본 참여 XP는 보장
        };
        persistDebateRecord(fallbackReport, fallbackState);
        setFinalReport(fallbackReport);
        setIsReportGenerating(false);
      }
      return;
    }

    setBattleState(prev => ({
      ...prev,
      arguments: newArgs,
    }));

    if (battleState.isFinished || isPaused) return;

    setIsAiThinking(true);

    try {
      const aiRes = await generateDebateResponse(
        battleState.topic,
        newArgs,
        userPosition,
        activeStep.roundId,
        battleState.timeLimit,
        sessionRemainingSeconds,
        battleState.debateLevel,
        battleState.debateFocus,
        activeStep.id,
      );

      const nextStep = debateStepList[newArgs.filter(argument => !argument.isAi).length];
      const isNextStepAnsweringAi = nextStep?.id.includes('cross-question-answer');

      const aiArg: Argument = {
        id: createArgumentId(),
        playerId: battleState.playerB.id,
        isAi: true,
        content: aiRes.argument,
        aiQuestion: isNextStepAnsweringAi ? aiRes.question : undefined,
        nextTask: nextStep ? nextStep.instruction : '최종 평가를 확인하세요.',
        turnXp: aiRes.turnXp,
        turnFeedback: aiRes.turnFeedback,
        turnFeedbackDetail: aiRes.turnFeedbackDetail,
        timestamp: getTimestamp(),
        roundId: activeStep.roundId,
        roundTitle: getAiResponseRoundTitle(activeStep),
      };

      setBattleState(prev => ({ ...prev, arguments: [...prev.arguments, aiArg] }));
    } catch (error) {
      console.error('Debate turn AI error:', error);
      // AI 응답 실패 시 에러 메시지를 AI 발언으로 삽입하여 토론 계속 진행 가능하게
      const errorArg: Argument = {
        id: createArgumentId(),
        playerId: battleState.playerB.id,
        isAi: true,
        content: 'AI 응답을 생성하지 못했습니다. 다음 단계로 진행해 주세요.',
        nextTask: '이전 발언을 보강하여 다시 작성하거나, 다음 단계로 진행하세요.',
        timestamp: getTimestamp(),
        roundId: activeStep.roundId,
        roundTitle: getAiResponseRoundTitle(activeStep),
      };
      setBattleState(prev => ({ ...prev, arguments: [...prev.arguments, errorArg] }));
    }
    setIsAiThinking(false);
  };

  const submitDialogueAction = async (content: string) => {
    const newArg: Argument = {
      id: createArgumentId(),
      playerId: battleState.playerA.id,
      isAi: false,
      content,
      timestamp: getTimestamp(),
    };

    const newArgs = [...battleState.arguments, newArg];
    setBattleState(prev => ({ ...prev, arguments: newArgs }));
    setIsPersonaPlayerTurn(false);

    if (battleState.isFinished) return;

    if (battleState.gameMode === 'persona' && battleState.personaId) {
      setIsAiThinking(true);

      const aiRes = await generatePersonaResponse(
        battleState.topic,
        newArgs,
        battleState.personaId,
        battleState.timeLimit,
        battleState.timeRemaining,
      );

      const aiArg: Argument = {
        id: createArgumentId(),
        playerId: battleState.playerB.id,
        isAi: true,
        content: aiRes.argument,
        aiQuestion: aiRes.question,
        aiLesson: aiRes.lesson,
        timestamp: getTimestamp(),
      };

      setBattleState(prev => ({ ...prev, arguments: [...prev.arguments, aiArg] }));
      setIsAiThinking(false);
      setIsPersonaPlayerTurn(true);
      return;
    }

    if (battleState.gameMode === 'roundtable') {
      setIsAiThinking(true);

      const aiRes = await generateRoundtableResponse(
        battleState.topic,
        newArgs,
        battleState.timeLimit,
        battleState.timeRemaining,
      );

      setBattleState(prev => ({
        ...prev,
        arguments: [...prev.arguments, ...createRoundtableArguments(aiRes, '상호 반박')],
      }));
      setIsAiThinking(false);
      setIsPersonaPlayerTurn(true);
    }
  };

  const handleActionSubmit = async (content: string) => {
    if (battleState.gameMode === 'debate' && activeDebateStep?.actor === 'user') {
      await submitDebateAction(content, activeDebateStep);
      return;
    }

    await submitDialogueAction(content);
  };

  const participants = battleState.gameMode === 'roundtable'
    ? roundtablePlayers
    : [battleState.playerA, battleState.playerB];
  const getPlayerForArgument = (argument: Argument) =>
    participants.find(player => player.id === argument.playerId) ??
    (argument.isAi ? battleState.playerB : battleState.playerA);
  const latestUserArgument = [...battleState.arguments].reverse().find(argument => !argument.isAi);
  const latestUserStep = latestUserArgument
    ? debateStepList.find(step => step.title === latestUserArgument.roundTitle) ??
      debateStepList.find(step => step.roundId === latestUserArgument.roundId) ??
      currentActionStep
    : currentActionStep;
  const checklistStep = battleState.gameMode === 'debate' ? currentActionStep : latestUserStep;
  const checklistArgument = battleState.gameMode === 'debate'
    ? latestUserStep?.id === currentActionStep?.id
      ? latestUserArgument
      : undefined
    : latestUserArgument;
  const coachChecklist = buildCoachChecklist(checklistStep, checklistArgument);
  const checklistScore = coachChecklist.length
    ? Math.round((coachChecklist.filter(item => item.met).length / coachChecklist.length) * 100)
    : 0;
  const currentStageEvaluation = battleState.gameMode !== 'debate'
    ? null
    : currentActionStep?.title.includes('입론')
      ? {
          title: `${currentActionStep.title} 기준`,
          items: openingEvaluationItems,
        }
      : currentActionStep?.title.includes('AI 교차질문 답변')
        ? {
            title: `${currentActionStep.title} 기준`,
            items: crossQuestionAnswerEvaluationItems,
          }
        : currentActionStep?.title.includes('교차질문')
          ? {
              title: `${currentActionStep.title} 기준`,
              items: crossQuestionEvaluationItems,
            }
          : null;
  const checklistTitle = battleState.gameMode === 'debate'
    ? `${checklistStep?.title ?? '현재 단계'} 체크`
    : checklistArgument
      ? `${checklistScore}% 반영`
      : '대기 중';
  const activeStepIndex = activeDebateStep
    ? debateStepList.findIndex(step => step.id === activeDebateStep.id)
    : -1;
  const selectedFocus = battleState.debateFocus ?? 'fact';
  const activeFocusTip = getFocusTip(selectedFocus);
  const showFocusTip = battleState.gameMode === 'debate' && shouldShowFocusTip(currentActionStep, battleState.debateLevel);
  const showBeginnerOpeningGuide = battleState.gameMode === 'debate' && (battleState.debateLevel === 'beginner' || !battleState.debateLevel) && currentActionStep?.id === 'beginner-opening-user';
  const focusFrame = battleState.debateLevel === 'intermediate'
    ? activeFocusTip.intermediateFrame
    : activeFocusTip.beginnerFrame;
  const hasFinalAiStatement = battleState.arguments.some(argument =>
    argument.isAi && argument.roundTitle === 'AI 최종 발언',
  );
  const showResultAnalysisButton =
    battleState.gameMode === 'debate' &&
    battleState.isFinished &&
    hasFinalAiStatement &&
    !showResultModal;
  const handleDebateFocusChange = (debateFocus: DebateFocus) => {
    setBattleState(prev => ({ ...prev, debateFocus }));
  };

  return (
    <div className="app-container">
      <BattleHeader battleState={battleState} />
      <section className="session-strip">
        <div className="participant-strip">
          {participants.map(player => (
            <div key={player.id} className={`compact-player ${player.isAi ? 'ai' : 'user'}`}>
              <img src={player.avatar} alt={player.name} />
              <div>
                <strong>{player.name}</strong>
                <span>{player.rankBadge}</span>
              </div>
              {player.isAi && <em>AI</em>}
            </div>
          ))}
        </div>

        <div className="session-controls" aria-label="토론 진행 제어">
          <button
            type="button"
            className="btn btn-secondary session-control-button"
            onClick={() => setIsPaused(true)}
            disabled={battleState.isFinished || isPaused}
            title="잠시 멈춤"
          >
            <Pause size={16} /> 잠시 멈춤
          </button>
          <button
            type="button"
            className="btn btn-secondary session-control-button"
            onClick={() => setIsPaused(false)}
            disabled={battleState.isFinished || !isPaused}
            title="진행"
          >
            <Play size={16} /> 진행
          </button>
        </div>

        <div className={`compact-timer ${currentOvertimeSeconds > 0 ? 'overtime' : currentRemainingSeconds <= 30 ? 'urgent' : ''}`}>
          <Clock size={16} />
          <strong>{currentOvertimeSeconds > 0 ? `+${formatDuration(currentOvertimeSeconds)}` : formatDuration(currentRemainingSeconds)}</strong>
          <span>
            {battleState.isFinished
              ? '종료'
              : isAiThinking
                ? 'AI 응답 중'
                : isPaused
                  ? '일시정지'
                : currentOvertimeSeconds > 0
                  ? `${currentActionStep?.title ?? '현재 단계'} 권장 시간 초과`
                  : `${currentActionStep?.title ?? '현재 단계'} 권장 시간`}
          </span>
        </div>
      </section>

      <main className="debate-workspace">
        <section className="chat-panel" aria-label="토론 대화">
          <div className="conversation-list">
            {battleState.arguments.map(argument => (
              <ArgumentCard key={argument.id} argument={argument} player={getPlayerForArgument(argument)} />
            ))}

            {isAiThinking && (
              <div className="thinking-row">
                <Sparkles size={16} />
                <span>AI가 방금 발언을 읽고 다음 응답을 구성하고 있습니다.</span>
              </div>
            )}

            {!battleState.isFinished && (
              <ActionZone
                currentRound={currentActionStep}
                roundProgress={battleState.gameMode === 'debate' ? debateRoundProgress : undefined}
                timing={battleState.gameMode === 'debate' && currentActionStep ? {
                  recommendedSeconds: currentRecommendedSeconds,
                  elapsedSeconds: stepElapsedSeconds,
                  remainingSeconds: currentRemainingSeconds,
                  overtimeSeconds: currentOvertimeSeconds,
                } : undefined}
                isPlayerTurn={isPlayerTurn}
                isAiThinking={isAiThinking}
                isPaused={isPaused}
                onSubmit={handleActionSubmit}
              />
            )}

            {showResultAnalysisButton && (
              <div className="result-analysis-entry">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowResultModal(true)}
                  disabled={!finalReport || isReportGenerating}
                >
                  <BarChart2 size={18} />
                  {finalReport ? '결과 분석 보기' : '결과 분석 준비 중'}
                </button>
                <span>
                  {finalReport
                    ? '상대방의 최종 답변을 확인한 뒤 결과를 열어보세요.'
                    : '최종 답변을 바탕으로 평가서를 준비하고 있습니다.'}
                </span>
              </div>
            )}
            <div ref={scrollAnchorRef} className="scroll-anchor" />
          </div>
        </section>

        <aside className="coach-panel" aria-label="AI 피드백">
          <div className="coach-section">
            <div className="coach-title">
              <MessageCircle size={18} />
              <div>
                <span>현재 국면</span>
                <strong>{currentActionStep?.title ?? '자유 토론'}</strong>
              </div>
            </div>
            {currentActionStep?.purpose && <p style={{ whiteSpace: 'pre-wrap' }}>{currentActionStep.purpose}</p>}
            {battleState.gameMode === 'debate' && currentActionStep && (
              <div className="time-summary">
                <div>
                  <span>권장</span>
                  <strong>{formatDuration(currentRecommendedSeconds)}</strong>
                </div>
                <div>
                  <span>사용</span>
                  <strong>{formatDuration(stepElapsedSeconds)}</strong>
                </div>
                <div className={currentOvertimeSeconds > 0 ? 'overtime' : currentRemainingSeconds <= 30 ? 'warning' : ''}>
                  <span>{currentOvertimeSeconds > 0 ? '초과' : '남음'}</span>
                  <strong>{currentOvertimeSeconds > 0 ? `+${formatDuration(currentOvertimeSeconds)}` : formatDuration(currentRemainingSeconds)}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="coach-section">
            <div className="coach-title">
              <Sparkles size={18} />
              <div>
                {!(checklistStep?.title === '반박' && !currentStageEvaluation) && (
                  <span>{currentStageEvaluation ? '평가 항목' : (checklistStep?.title === '상대 주장 분석' ? '상대 주장에 대한 논제파악력' : '체크 항목')}</span>
                )}
                <strong>{currentStageEvaluation ? currentStageEvaluation.title : (checklistStep?.title === '반박' ? '반박력 체크' : checklistTitle)}</strong>
              </div>
            </div>
            <div className="checklist">
              {currentStageEvaluation
                ? currentStageEvaluation.items.map(item => (
                    <div key={item.label} className="check-item">
                      <Circle size={17} />
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </div>
                    </div>
                  ))
                : coachChecklist.map(item => (
                    <div key={item.label} className={`check-item ${item.met ? 'met' : ''}`}>
                      {item.met ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                      <div>
                        <strong>{item.label}</strong>
                        {!(checklistStep?.title === '반박' && !item.met) && <span>{item.met ? '반영됨' : item.hint}</span>}
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {showFocusTip && (
            <div className="coach-section focus-tip-section">
              <div className="coach-title">
                <Lightbulb size={18} />
                <div>
                  <span>생각할 거리</span>
                  <strong>논제 초점 선택</strong>
                </div>
              </div>
              <div className="focus-choice-list" role="group" aria-label="논제 초점 선택">
                {focusTips.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={selectedFocus === option.value ? 'active' : ''}
                    onClick={() => handleDebateFocusChange(option.value)}
                  >
                    <Target size={15} />
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="focus-tip-card">
                <strong>{activeFocusTip.headline}</strong>
                <ul>
                  {activeFocusTip.questions.map(question => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
                <div className="focus-frame">
                  <span>{battleState.debateLevel === 'intermediate' ? '용어정리 프레임' : '입론 프레임'}</span>
                  <p>{focusFrame}</p>
                </div>
              </div>
            </div>
          )}

          {showBeginnerOpeningGuide && (
            <div className="coach-section focus-tip-section">
              <div className="coach-title">
                <Lightbulb size={18} />
                <div>
                  <span>생각할 거리</span>
                  <strong>주장 · 이유 · 근거</strong>
                </div>
              </div>
              <div className="focus-tip-card" style={{ marginTop: '0.5rem' }}>
                <strong>논리의 3요소를 갖춰보세요.</strong>
                <ul style={{ marginTop: '0.5rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>
                    <strong>주장 (Claim):</strong> 발언자가 말하고자 하는 논제에 대한 의견 또는 해법<br/>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>"그래서 결론이 뭔데?" (나의 핵심 입장)</span>
                  </li>
                  <li>
                    <strong>이유 (Reason):</strong> 주장을 뒷받침하는 진술<br/>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>"왜 그렇게 생각하는데?" (나의 뇌에서 나온 논리)</span>
                  </li>
                  <li>
                    <strong>근거 (Evidence):</strong> 외부에서 얻을 수 있는 자료나 사실<br/>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>"진짜라는 증거 있어?" (세상에 존재하는 객관적 팩트)</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {battleState.gameMode === 'debate' && (
            <div className="coach-section">
              <div className="coach-title">
                <Users size={18} />
                <div>
                  <span>턴 흐름</span>
                  <strong>{debateRoundProgress?.current ?? 1}/{debateRoundProgress?.total ?? debateStepList.length}</strong>
                </div>
              </div>
              <div className="phase-list">
                {debateStepList.map((step, index) => {
                  const isActive = step.id === activeDebateStep?.id;
                  const isDone = activeStepIndex >= 0 && index < activeStepIndex;
                  return (
                    <div key={step.id} className={`phase-item ${isActive ? 'active' : ''}`}>
                      {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      <span>{step.title}</span>
                      <small>{formatDuration(getScaledStepDuration(step, debateStepList, battleState.timeLimit))}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </aside>
      </main>

      {showResultModal && (
        <ResultModal
          report={finalReport}
          topic={battleState.topic}
          playerA={battleState.playerA}
          playerB={battleState.playerB}
          debateArguments={battleState.arguments}
          onClose={() => navigate('/')}
          onStartEnglishReplay={() => {
            setShowResultModal(false);
            setIsEnglishReplayMode(true);
          }}
          onShareReport={handleShareReport}
        />
      )}
    </div>
  );
};
