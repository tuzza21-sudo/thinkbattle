import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Clock, MessageCircle, Sparkles, Users } from 'lucide-react';
import { BattleHeader } from './BattleHeader';
import { ArgumentCard } from './ArgumentCard';
import { ActionZone } from './ActionZone';
import { ResultModal } from './ResultModal';
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
  getDebateFocusLabel,
  getDebateLevelLabel,
  getDebateSteps,
  getDebateStepByTurn,
  getOppositePosition,
  getPositionLabel,
  personaDebateStep,
} from '../lib/debateEngine';
import { saveDebateRecord } from '../lib/history';
import type { AppUser, Argument, BattleConfig, BattleState, DebatePosition, DebateStep, FinalReport, Player } from '../types';

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
  debateFocus: 'fact',
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

type CoachItem = {
  label: string;
  met: boolean;
  hint: string;
};

const hasAny = (content: string, keywords: string[]) => keywords.some(keyword => content.includes(keyword));

const buildCoachChecklist = (step: DebateStep | undefined, latestUserArgument?: Argument): CoachItem[] => {
  if (!step) return [];

  const content = latestUserArgument?.content.replace(/\s+/g, ' ').toLowerCase() ?? '';
  const roundId = step.roundId;
  const title = step.title;

  if (!latestUserArgument) {
    return [
      { label: '국면 이해', met: false, hint: `${title} 단계의 요구사항을 먼저 확인하세요.` },
      { label: '구조화', met: false, hint: '발언을 항목별로 나누면 AI 피드백이 더 정확해집니다.' },
    ];
  }

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

const createInitialBattleState = (config: BattleConfig): BattleState => {
  const userPosition = config.userPosition ?? 'affirmative';
  const aiPosition = getOppositePosition(userPosition);
  const debateLevel = config.debateLevel ?? 'beginner';
  const debateFocus = config.debateFocus ?? 'fact';
  const debateSteps = getDebateSteps(debateLevel);
  const isDebateMode = config.gameMode === 'debate';
  const isRoundtableMode = config.gameMode === 'roundtable';

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
    playerA: {
      id: 'p1',
      name: isDebateMode ? `나 · ${getPositionLabel(userPosition)}` : '나',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
      level: 12,
      rankBadge: '실버 III',
      score: 1250,
      streak: 3,
      isAi: false,
    },
    playerB: {
      id: 'p2',
      name: isDebateMode
        ? `AI 토론자 · ${getPositionLabel(aiPosition)}`
        : isRoundtableMode
          ? '소크라테스 · 칸트 · 니체'
          : getPersonaName(config.personaId),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${isRoundtableMode ? 'Roundtable' : 'Socrates'}`,
      level: 99,
      rankBadge: isDebateMode ? `${getDebateLevelLabel(debateLevel)} · ${getDebateFocusLabel(debateFocus)}` : isRoundtableMode ? '라운드테이블' : '철학자',
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
            content: buildDebateIntro(config.topic, userPosition, debateLevel, debateFocus),
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

  const [battleState, setBattleState] = useState<BattleState>(() => createInitialBattleState(effectiveConfig));
  const [showResultModal, setShowResultModal] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);
  const [stepTimer, setStepTimer] = useState({ stepId: 'free-discussion', elapsedSeconds: 0 });
  const [isPersonaPlayerTurn, setIsPersonaPlayerTurn] = useState(true);

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
    ? !isAiThinking
    : isPersonaPlayerTurn && !isAiThinking;
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
    if (battleState.isFinished) return;

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
  }, [battleState.gameMode, battleState.isFinished, currentActionStep, currentActionStepId, isPlayerTurn]);

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

  const persistDebateRecord = useCallback((report: FinalReport, finalState: BattleState) => {
    if (!user || savedRecordIdRef.current) return;

    const completedAt = new Date().toISOString();
    const recordId = `record_${finalState.id}_${Date.now()}`;
    savedRecordIdRef.current = recordId;

    saveDebateRecord({
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
    });
  }, [user]);

  useEffect(() => {
    if (!battleState.isFinished || battleState.timeRemaining > 0 || showResultModal) return;

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
  }, [battleState, persistDebateRecord, showResultModal]);

  if (!config) {
    return null;
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
    setBattleState(prev => ({
      ...prev,
      arguments: newArgs,
    }));

    if (battleState.isFinished) return;

    setIsAiThinking(true);

    const aiRes = await generateDebateResponse(
      battleState.topic,
      newArgs,
      userPosition,
      activeStep.roundId,
      battleState.timeLimit,
      sessionRemainingSeconds,
      battleState.debateLevel,
      battleState.debateFocus,
    );

    const nextStep = getDebateStepByTurn(
      battleState.timeLimit,
      sessionRemainingSeconds,
      newArgs.filter(argument => !argument.isAi).length,
      battleState.debateLevel,
    );
    const aiArg: Argument = {
      id: createArgumentId(),
      playerId: battleState.playerB.id,
      isAi: true,
      content: aiRes.argument,
      aiQuestion: aiRes.question,
      nextTask: aiRes.nextTask,
      timestamp: getTimestamp(),
      roundId: activeStep.roundId,
      roundTitle: nextStep.title,
    };

    setBattleState(prev => ({ ...prev, arguments: [...prev.arguments, aiArg] }));
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
  const coachChecklist = buildCoachChecklist(latestUserStep, latestUserArgument);
  const checklistScore = coachChecklist.length
    ? Math.round((coachChecklist.filter(item => item.met).length / coachChecklist.length) * 100)
    : 0;
  const activeStepIndex = activeDebateStep
    ? debateStepList.findIndex(step => step.id === activeDebateStep.id)
    : -1;

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

        <div className={`compact-timer ${currentOvertimeSeconds > 0 ? 'overtime' : currentRemainingSeconds <= 30 ? 'urgent' : ''}`}>
          <Clock size={16} />
          <strong>{currentOvertimeSeconds > 0 ? `+${formatDuration(currentOvertimeSeconds)}` : formatDuration(currentRemainingSeconds)}</strong>
          <span>
            {battleState.isFinished
              ? '종료'
              : isAiThinking
                ? 'AI 응답 중'
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
                onSubmit={handleActionSubmit}
              />
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
            <p>{currentActionStep?.instruction ?? '상대 발언을 읽고 답변, 질문, 보강 중 필요한 행동을 선택하세요.'}</p>
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

          <div className="coach-section">
            <div className="coach-title">
              <Sparkles size={18} />
              <div>
                <span>발언 피드백</span>
                <strong>{latestUserArgument ? `${checklistScore}% 반영` : '대기 중'}</strong>
              </div>
            </div>
            <div className="checklist">
              {coachChecklist.map(item => (
                <div key={item.label} className={`check-item ${item.met ? 'met' : ''}`}>
                  {item.met ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.met ? '반영됨' : item.hint}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {showResultModal && (
        <ResultModal
          report={finalReport}
          playerA={battleState.playerA}
          playerB={battleState.playerB}
          onClose={() => navigate('/')}
        />
      )}
    </div>
  );
};
