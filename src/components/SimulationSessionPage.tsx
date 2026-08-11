import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Award, CheckCircle2, ChevronRight, Clock3, Headphones, LoaderCircle, Mic2, Play, RotateCcw, ShieldAlert, Sparkles, Square, Target, Volume2, VolumeX, XCircle } from 'lucide-react';
import { ActionZone } from './ActionZone';
import { getSimulationMission, getSimulationPersona, simulationCategories } from '../data/simulations';
import { generateSimulationReport, generateSimulationResponse } from '../lib/api';
import { speakWithBrowserFallback, streamPersonaSpeech } from '../lib/personaSpeech';
import type { AppUser, DebateStep, SimulationReport, SimulationTurn } from '../types';

interface SimulationSessionPageProps {
  user: AppUser;
}

const createTurnId = () => globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const practiceStep: DebateStep = {
  id: 'simulation-response',
  roundId: 'cross-question',
  title: '실전 대응',
  actor: 'user',
  purpose: '상대의 압박 의도를 파악하고 목표·근거·대안을 분명하게 전달합니다.',
  instruction: '상대의 마지막 발언에 직접 대응하세요. 필요한 경우 질문으로 숨은 요구를 확인하세요.',
  checklist: ['상대의 핵심 요구에 직접 답했는가?', '내 기준이나 근거를 밝혔는가?', '실행 가능한 다음 행동을 제시했는가?'],
  inputPlaceholder: '실제로 말하듯 답변하세요. 마이크로 말하거나 텍스트로 입력할 수 있습니다.',
};

export const SimulationSessionPage = ({ user }: SimulationSessionPageProps) => {
  const navigate = useNavigate();
  const { missionId = '' } = useParams();
  const mission = getSimulationMission(missionId);
  const persona = mission ? getSimulationPersona(mission.personaId) : undefined;
  const [turns, setTurns] = useState<SimulationTurn[]>(() => mission ? [{
    id: createTurnId(), speaker: 'ai', content: mission.openingLine, timestamp: timestamp(), pressureLevel: mission.difficulty + 1,
  }] : []);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isReportGenerating, setIsReportGenerating] = useState(false);
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechControllerRef = useRef<AbortController | null>(null);
  const audioUrlsRef = useRef<Record<string, string>>({});
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasStarted || report || isReportGenerating) return;
    const interval = window.setInterval(() => setElapsedSeconds(value => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [hasStarted, isReportGenerating, report]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns, isAiThinking]);

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  useEffect(() => () => {
    speechControllerRef.current?.abort();
    audioRef.current?.pause();
    Object.values(audioUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    window.speechSynthesis?.cancel();
  }, []);

  const userTurnCount = useMemo(() => turns.filter(turn => turn.speaker === 'user').length, [turns]);

  if (!mission || !persona) {
    return (
      <div className="simulation-session missing">
        <XCircle size={42} />
        <h1>미션을 찾을 수 없습니다.</h1>
        <button className="btn btn-primary" onClick={() => navigate('/simulation')}>미션 목록으로</button>
      </div>
    );
  }

  const playAiTurn = async (turn: SimulationTurn) => {
    if (turn.speaker !== 'ai' || audioLoadingId) return;
    speechControllerRef.current?.abort();
    speechControllerRef.current = null;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    const existingUrl = audioUrls[turn.id];
    if (existingUrl) {
      audioRef.current = new Audio(existingUrl);
      await audioRef.current.play().catch(() => undefined);
      return;
    }

    const controller = new AbortController();
    speechControllerRef.current = controller;
    setAudioLoadingId(turn.id);
    try {
      const blob = await streamPersonaSpeech(turn.content, persona.voiceName, persona.voiceStyle, {
        signal: controller.signal,
        onPlaybackStart: () => setAudioLoadingId(current => current === turn.id ? null : current),
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      setAudioUrls(current => ({ ...current, [turn.id]: url }));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn('Persona TTS fallback:', error);
      speakWithBrowserFallback(turn.content, persona.id === 'difficult_customer' ? 1.08 : 0.96);
    } finally {
      if (speechControllerRef.current === controller) speechControllerRef.current = null;
      setAudioLoadingId(current => current === turn.id ? null : current);
    }
  };

  const finishSimulation = async (finalTurns: SimulationTurn[] = turns) => {
    if (isReportGenerating || finalTurns.filter(turn => turn.speaker === 'user').length === 0) return;
    setIsReportGenerating(true);
    setSessionError(null);
    try {
      setReport(await generateSimulationReport(mission, persona, finalTurns));
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : '평가를 생성하지 못했습니다.');
    } finally {
      setIsReportGenerating(false);
    }
  };

  const beginSimulation = () => {
    setHasStarted(true);
    setElapsedSeconds(0);
    if (voiceEnabled && turns[0]) {
      window.setTimeout(() => void playAiTurn(turns[0]), 180);
    }
  };

  const handleSubmit = async (content: string) => {
    if (isAiThinking || report) return;
    const userTurn: SimulationTurn = { id: createTurnId(), speaker: 'user', content: content.trim(), timestamp: timestamp() };
    const historyWithUser = [...turns, userTurn];
    setTurns(historyWithUser);
    setIsAiThinking(true);
    setSessionError(null);
    try {
      const response = await generateSimulationResponse(mission, persona, historyWithUser);
      const aiTurn: SimulationTurn = {
        id: createTurnId(), speaker: 'ai', content: response.reply, timestamp: timestamp(),
        pressureLevel: response.pressureLevel, tactic: response.tactic,
      };
      const finalTurns = [...historyWithUser, aiTurn];
      setTurns(finalTurns);
      if (voiceEnabled) void playAiTurn(aiTurn);
      if (response.shouldEnd || historyWithUser.filter(turn => turn.speaker === 'user').length >= 6) {
        await finishSimulation(finalTurns);
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : '상대의 응답을 생성하지 못했습니다.');
    } finally {
      setIsAiThinking(false);
    }
  };

  const restart = () => {
    speechControllerRef.current?.abort();
    speechControllerRef.current = null;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setTurns([{ id: createTurnId(), speaker: 'ai', content: mission.openingLine, timestamp: timestamp(), pressureLevel: mission.difficulty + 1 }]);
    setReport(null);
    setHasStarted(false);
    setElapsedSeconds(0);
    setSessionError(null);
  };

  if (!hasStarted) {
    const category = simulationCategories.find(item => item.id === mission.categoryId);
    return (
      <div className="simulation-session ready-view">
        <header className="simulation-session-header">
          <button type="button" onClick={() => navigate('/simulation')}><ArrowLeft size={18} /> 미션 목록</button>
          <span>상황극 브리핑</span><span>{user.nickname}님</span>
        </header>
        <main className="simulation-ready-stage">
          <section className="simulation-ready-brief">
            <div className="simulation-ready-kicker"><span>MISSION {String(mission.difficulty).padStart(2, '0')}</span><i />{category?.title}</div>
            <h1>{mission.title}</h1>
            <p>{mission.summary}</p>
            <div className="simulation-ready-scene">
              <div className="simulation-scene-label"><Sparkles size={16} /> 오늘의 상황</div>
              <p>{mission.situation}</p>
            </div>
            <div className="simulation-ready-roles">
              <div><small>YOUR ROLE</small><strong>{mission.userRole}</strong></div>
              <ChevronRight size={20} />
              <div><small>YOUR GOAL</small><strong>{mission.objective}</strong></div>
            </div>
            <div className="simulation-ready-checks">
              <strong><Target size={17} /> 이번 훈련의 성공 기준</strong>
              <div>{mission.successCriteria.map((item, index) => <span key={item}><b>0{index + 1}</b>{item}</span>)}</div>
            </div>
          </section>

          <aside className={`simulation-ready-persona persona-${persona.id}`}>
            <div className="simulation-ready-live"><i /> YOUR COUNTERPART</div>
            <div className="simulation-ready-avatar"><span>{persona.name.slice(0, 1)}</span><i /><i /></div>
            <small>AI PERSONA</small>
            <h2>{persona.name}</h2>
            <p>{persona.role}</p>
            <div className="simulation-persona-traits">
              {persona.behaviorRules.slice(0, 3).map(rule => <span key={rule}>{rule.replace(/한다\.$/, '')}</span>)}
            </div>
            <blockquote><span>첫 질문</span>“{mission.openingLine}”</blockquote>
            <div className="simulation-ready-audio">
              <button type="button" onClick={() => setVoiceEnabled(value => !value)}>
                {voiceEnabled ? <Headphones size={18} /> : <VolumeX size={18} />}
                AI 음성 {voiceEnabled ? '사용' : '사용 안 함'}
              </button>
              <span><Mic2 size={16} /> 마이크·텍스트 응답</span>
            </div>
          </aside>

          <div className="simulation-ready-action">
            <div><ShieldAlert size={18} /><span>언제든 중단할 수 있으며, 인격 공격 없이 실전 압박만 제공합니다.</span></div>
            <button type="button" onClick={beginSimulation}><Play size={19} fill="currentColor" /> 훈련 시작하기 <ChevronRight size={19} /></button>
          </div>
        </main>
      </div>
    );
  }

  if (report) {
    const outcomeLabel = report.outcome === 'achieved' ? '목표 달성' : report.outcome === 'partial' ? '부분 달성' : '재도전 필요';
    return (
      <div className="simulation-session report-view">
        <header className="simulation-session-header">
          <button type="button" onClick={() => navigate('/simulation')}><ArrowLeft size={18} /> 미션 목록</button>
          <span>훈련 결과</span><span>{user.nickname}님</span>
        </header>
        <main className="simulation-report">
          <section className="simulation-report-hero">
            <div className="simulation-score-ring"><strong>{report.overallScore}</strong><span>/ 100</span></div>
            <div><span className={`simulation-outcome ${report.outcome}`}>{outcomeLabel}</span><h1>{mission.title}</h1><p>{report.summary}</p></div>
          </section>
          <section className="simulation-report-grid">
            {report.metrics.map(metric => (
              <article key={metric.name}><div><strong>{metric.name}</strong><b>{metric.score}</b></div><div className="simulation-metric-bar"><i style={{ width: `${metric.score}%` }} /></div><p>{metric.feedback}</p></article>
            ))}
          </section>
          <div className="simulation-report-columns">
            <section><h2><CheckCircle2 size={20} /> 잘한 대응</h2>{report.strengths.length ? <ul>{report.strengths.map(item => <li key={item}>{item}</li>)}</ul> : <p>명확하게 관찰된 강점이 충분하지 않았습니다.</p>}</section>
            <section><h2><Target size={20} /> 다음 개선</h2><ul>{report.improvements.map(item => <li key={item}>{item}</li>)}</ul></section>
          </div>
          <section className="simulation-tactics"><h2><ShieldAlert size={20} /> 상대가 사용한 압박 전술</h2>{report.detectedTactics.length ? <div>{report.detectedTactics.map(item => <span key={item}>{item}</span>)}</div> : <p>기록에서 뚜렷한 압박 전술을 분류하지 못했습니다.</p>}</section>
          <section className="simulation-retry-mission"><Award size={25} /><div><strong>다시 도전할 한 가지</strong><p>{report.retryMission}</p></div></section>
          <div className="simulation-report-actions"><button className="btn btn-secondary" onClick={() => navigate('/simulation')}>다른 미션 선택</button><button className="btn btn-primary" onClick={restart}><RotateCcw size={17} /> 같은 미션 다시 도전</button></div>
        </main>
      </div>
    );
  }

  return (
    <div className="simulation-session">
      <header className="simulation-session-header">
        <button type="button" onClick={() => navigate('/simulation')}><ArrowLeft size={18} /> 나가기</button>
        <span>{mission.title}</span>
        <div><Clock3 size={16} /> {formatElapsed(elapsedSeconds)}</div>
      </header>
      <main className="simulation-session-layout">
        <aside className="simulation-briefing-panel">
          <div className="simulation-live-badge"><i /> LIVE ROLE-PLAY</div>
          <h1>{mission.title}</h1>
          <p>{mission.situation}</p>
          <dl><div><dt>나의 역할</dt><dd>{mission.userRole}</dd></div><div><dt>달성 목표</dt><dd>{mission.objective}</dd></div><div><dt>상대</dt><dd>{persona.name}</dd></div></dl>
          <section><strong>성공 기준</strong><ul>{mission.successCriteria.map(item => <li key={item}>{item}</li>)}</ul></section>
          <div className="simulation-progress"><div><span>대화 진행</span><b>{Math.min(userTurnCount, 6)} / 6</b></div><div><i style={{ width: `${Math.min(100, userTurnCount / 6 * 100)}%` }} /></div></div>
          <button type="button" className="simulation-voice-toggle" onClick={() => { setVoiceEnabled(value => !value); speechControllerRef.current?.abort(); speechControllerRef.current = null; audioRef.current?.pause(); window.speechSynthesis?.cancel(); }}>
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />} AI 음성 자동재생 {voiceEnabled ? '켜짐' : '꺼짐'}
          </button>
          {userTurnCount >= 2 && <button type="button" className="simulation-finish-button" disabled={isAiThinking || isReportGenerating} onClick={() => void finishSimulation()}><Square size={15} /> 현재 대화로 평가받기</button>}
        </aside>

        <section className="simulation-conversation-panel">
          <div className="simulation-persona-head">
            <div className={`simulation-persona-avatar persona-${persona.id}`}><span>{persona.name.slice(0, 1)}</span><i /></div>
            <div><small>상대 페르소나</small><strong>{persona.name}</strong><span>{persona.role}</span></div>
            <div className="simulation-live-wave" aria-hidden="true">{[9, 17, 12, 22, 15].map((height, index) => <i key={index} style={{ height }} />)}</div>
            <span>난이도 {mission.difficulty}/3</span>
          </div>
          <div className="simulation-dialogue">
            {turns.map(turn => (
              <article key={turn.id} className={`simulation-turn ${turn.speaker}`}>
                <div className="simulation-turn-meta"><strong>{turn.speaker === 'ai' ? persona.name : user.nickname}</strong><span>{turn.timestamp}</span></div>
                <p>{turn.content}</p>
                {turn.speaker === 'ai' && (
                  <div className="simulation-turn-tools">
                    {turn.pressureLevel && <span>압박도 {'●'.repeat(Math.min(5, turn.pressureLevel))}{'○'.repeat(Math.max(0, 5 - turn.pressureLevel))}</span>}
                    <button type="button" onClick={() => void playAiTurn(turn)} disabled={audioLoadingId === turn.id}>
                      {audioLoadingId === turn.id ? <LoaderCircle className="spin" size={15} /> : <Volume2 size={15} />} 목소리 듣기
                    </button>
                  </div>
                )}
              </article>
            ))}
            {isAiThinking && <div className="simulation-thinking"><LoaderCircle className="spin" size={18} /> {persona.name}이 대응을 준비하고 있습니다...</div>}
            {isReportGenerating && <div className="simulation-thinking"><Sparkles className="spin" size={18} /> 대화 기록을 분석하고 있습니다...</div>}
            {sessionError && <div className="simulation-session-error">{sessionError}</div>}
            <div ref={conversationEndRef} />
          </div>
          <div className="simulation-action-zone">
            <ActionZone
              currentRound={practiceStep}
              roundProgress={{ current: Math.min(userTurnCount + 1, 6), total: 6 }}
              isPlayerTurn={!isReportGenerating}
              isAiThinking={isAiThinking || isReportGenerating}
              topic={`${mission.title}: ${mission.situation}`}
              onSubmit={content => void handleSubmit(content)}
              language="ko"
            />
          </div>
        </section>
      </main>
    </div>
  );
};
