import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BattleHeader } from './BattleHeader';
import { PlayerCard } from './PlayerCard';
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
  debateSteps,
  getDebateStepByTurn,
  getOppositePosition,
  getPositionLabel,
} from '../lib/debateEngine';
import { saveDebateRecord } from '../lib/history';
import type { AppUser, Argument, BattleConfig, BattleState, DebatePosition, DebateStep, FinalReport, Player } from '../types';

interface ArenaProps {
  user: AppUser | null;
  onLoginRequest: () => void;
}

const fallbackConfig: BattleConfig = {
  topic: '',
  timeLimit: 300,
  gameMode: 'debate',
  userPosition: 'affirmative',
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

const createInitialBattleState = (config: BattleConfig): BattleState => {
  const userPosition = config.userPosition ?? 'affirmative';
  const aiPosition = getOppositePosition(userPosition);
  const isDebateMode = config.gameMode === 'debate';
  const isRoundtableMode = config.gameMode === 'roundtable';

  return {
    id: 'battle-local',
    topic: config.topic,
    matchType:
      config.gameMode === 'debate'
        ? `정식 토론 · ${getPositionLabel(userPosition)}`
        : config.gameMode === 'persona'
          ? '개별 페르소나 토론'
          : config.gameMode === 'roundtable'
            ? '철학자 라운드테이블'
            : '1:1 토론',
    gameMode: config.gameMode,
    personaId: config.personaId,
    userPosition: isDebateMode ? userPosition : undefined,
    aiPosition: isDebateMode ? aiPosition : undefined,
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
      rankBadge: isDebateMode ? '심화 토론' : isRoundtableMode ? '라운드테이블' : '철학자',
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
            content: buildDebateIntro(config.topic, userPosition),
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
      )
    : undefined;
  const isPlayerTurn = battleState.gameMode === 'debate'
    ? !isAiThinking
    : isPersonaPlayerTurn && !isAiThinking;

  useEffect(() => {
    if (!config) {
      navigate('/', { replace: true });
    }
  }, [config, navigate]);

  useEffect(() => {
    if (battleState.isFinished) return;

    const interval = setInterval(() => {
      setBattleState(prev => {
        if (prev.timeRemaining <= 1) {
          return { ...prev, timeRemaining: 0, isFinished: true };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [battleState.isFinished]);

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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const submitDebateAction = async (content: string, activeStep: DebateStep) => {
    const userPosition: DebatePosition = battleState.userPosition ?? 'affirmative';
    const newArg: Argument = {
      id: createArgumentId(),
      playerId: battleState.playerA.id,
      isAi: false,
      content,
      timestamp: getTimestamp(),
      roundId: activeStep.roundId,
      roundTitle: activeStep.title,
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
      battleState.timeRemaining,
    );

    const nextStep = getDebateStepByTurn(
      battleState.timeLimit,
      battleState.timeRemaining,
      newArgs.filter(argument => !argument.isAi).length,
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

  return (
    <div className="app-container">
      <BattleHeader battleState={battleState} />

      {battleState.gameMode === 'roundtable' ? (
        <section className="roundtable-timer-row">
          <div className={`timer-container roundtable-timer ${battleState.timeRemaining <= 10 && !battleState.isFinished ? 'urgent' : ''}`}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: battleState.timeRemaining <= 10 ? 'var(--accent-coral)' : 'var(--accent-amber)', fontFamily: 'var(--font-game)', lineHeight: 1 }}>
              {formatTime(battleState.timeRemaining)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: 800, marginTop: '4px' }}>
              {battleState.isFinished ? '종료' : isAiThinking ? '발언 중' : '회의 중'}
            </div>
          </div>
        </section>
      ) : (
        <section className="flex justify-between items-center vs-section" style={{ position: 'sticky', top: 0, background: 'var(--bg-primary)', paddingBottom: '1.5rem', paddingTop: '1rem' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
            <PlayerCard player={battleState.playerA} />
          </div>

          <div className={`timer-container ${battleState.timeRemaining <= 10 && !battleState.isFinished ? 'urgent' : ''}`}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: battleState.timeRemaining <= 10 ? 'var(--accent-coral)' : 'var(--accent-amber)', fontFamily: 'var(--font-game)', lineHeight: 1, textShadow: '0 0 10px rgba(255,184,0,0.5)' }}>
              {formatTime(battleState.timeRemaining)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: 800, marginTop: '4px', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '12px' }}>
              {battleState.isFinished ? '종료' : activeDebateStep ? activeDebateStep.title : '토론 진행 중'}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <PlayerCard player={battleState.playerB} isOpponent />
          </div>
        </section>
      )}

      {battleState.gameMode === 'roundtable' ? (
        <main className="roundtable-layout">
          {roundtablePlayers.map(player => (
            <section key={player.id} className={`roundtable-seat ${player.id === 'p1' ? 'user-seat' : ''}`}>
              <div className="roundtable-participant">
                <img src={player.avatar} alt={player.name} />
                <div>
                  <h3>{player.name}</h3>
                  <span>{player.rankBadge}</span>
                </div>
                {player.isAi && <strong>AI</strong>}
              </div>
              <div className="roundtable-transcript">
                {battleState.arguments.filter(arg => arg.playerId === player.id).map(arg => (
                  <ArgumentCard key={arg.id} argument={arg} player={player} />
                ))}
              </div>
            </section>
          ))}
          <div ref={scrollAnchorRef} className="scroll-anchor" />
        </main>
      ) : (
        <main className="arena-layout">
          <div className="player-side">
            {battleState.arguments.filter(a => !a.isAi).map(arg => (
              <ArgumentCard key={arg.id} argument={arg} player={battleState.playerA} />
            ))}
          </div>

          <div className="player-side">
            {battleState.arguments.filter(a => a.isAi).map(arg => (
              <ArgumentCard key={arg.id} argument={arg} player={battleState.playerB} />
            ))}
          </div>
          <div ref={scrollAnchorRef} className="scroll-anchor" />
        </main>
      )}

      {!battleState.isFinished && (
        <ActionZone
          currentRound={activeDebateStep}
          isPlayerTurn={isPlayerTurn}
          isAiThinking={isAiThinking}
          onSubmit={handleActionSubmit}
        />
      )}

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
