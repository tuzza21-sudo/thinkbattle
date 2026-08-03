import { getDebateSteps } from './debateEngine';
import type { DebateLevel, DebatePosition, DebateRoundId, DebateStep } from '../types';

export type LiveDebatePhase = {
  id: string;
  label: string;
  position: DebatePosition;
  targetPosition?: DebatePosition;
  roundId: DebateRoundId;
  seconds: number;
  purpose?: string;
  instruction: string;
  tasks: string[];
  checklist: string[];
  sentenceFrames: string[];
  inputPlaceholder: string;
};

type PhaseTemplate = {
  id: string;
  position: DebatePosition;
  targetPosition?: DebatePosition;
  stepId: string;
  title: string;
};

const positionLabel = (position: DebatePosition) => position === 'affirmative' ? '찬성' : '반대';
const humanize = (value = '') => value
  .replaceAll('AI가', '상대측이')
  .replaceAll('AI는', '상대측은')
  .replaceAll('AI의', '상대측의')
  .replaceAll('AI를', '상대측을')
  .replaceAll('AI에게', '상대측에게')
  .replaceAll('AI', '상대측');
const humanizeList = (values?: string[]) => (values ?? []).map(humanize);

const getTemplates = (level: DebateLevel): PhaseTemplate[] => {
  const prefix = level === 'intermediate' ? 'intermediate' : 'beginner';
  const shared: PhaseTemplate[] = [
    { id: 'affirmative-opening', position: 'affirmative', stepId: `${prefix}-opening-user`, title: '입론' },
    { id: 'negative-opening', position: 'negative', stepId: `${prefix}-opening-user`, title: '입론' },
    { id: 'affirmative-question', position: 'affirmative', targetPosition: 'negative', stepId: `${prefix}-cross-question-user`, title: '교차질문' },
    { id: 'negative-answer', position: 'negative', targetPosition: 'affirmative', stepId: `${prefix}-cross-question-answer-user`, title: '교차질문 답변' },
    { id: 'negative-question', position: 'negative', targetPosition: 'affirmative', stepId: `${prefix}-cross-question-user`, title: '교차질문' },
    { id: 'affirmative-answer', position: 'affirmative', targetPosition: 'negative', stepId: `${prefix}-cross-question-answer-user`, title: '교차질문 답변' },
  ];

  if (level === 'intermediate') {
    shared.push(
      { id: 'affirmative-analysis', position: 'affirmative', stepId: 'intermediate-opponent-summary-user', title: '상대 주장 분석' },
      { id: 'negative-analysis', position: 'negative', stepId: 'intermediate-opponent-summary-user', title: '상대 주장 분석' },
    );
  }

  shared.push(
    { id: 'affirmative-rebuttal', position: 'affirmative', stepId: `${prefix}-rebuttal-user`, title: '반박' },
    { id: 'negative-rebuttal', position: 'negative', stepId: `${prefix}-rebuttal-user`, title: '반박' },
  );

  if (level === 'intermediate') {
    shared.push(
      { id: 'affirmative-weighing', position: 'affirmative', stepId: 'intermediate-clash-weighing-user', title: '충돌 지점·중요성 비교' },
      { id: 'negative-weighing', position: 'negative', stepId: 'intermediate-clash-weighing-user', title: '충돌 지점·중요성 비교' },
    );
  }

  shared.push(
    {
      id: 'affirmative-closing',
      position: 'affirmative',
      stepId: level === 'intermediate' ? 'intermediate-closing-user' : 'beginner-weighing-user',
      title: '최종발언',
    },
    {
      id: 'negative-closing',
      position: 'negative',
      stepId: level === 'intermediate' ? 'intermediate-closing-user' : 'beginner-weighing-user',
      title: '최종발언',
    },
  );
  return shared;
};

const allocateDurations = (steps: DebateStep[], totalSeconds: number) => {
  const weights = steps.map(step => Math.max(30, step.recommendedDurationSeconds ?? 60));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return Math.max(0, totalSeconds - allocated);
    const seconds = Math.max(20, Math.round((totalSeconds * weight / totalWeight) / 5) * 5);
    allocated += seconds;
    return seconds;
  });
};

export const getLiveDebateCourse = (
  totalSeconds: number,
  level: DebateLevel = 'beginner',
): LiveDebatePhase[] => {
  const normalizedLevel: DebateLevel = level === 'intermediate' ? 'intermediate' : 'beginner';
  const steps = getDebateSteps(normalizedLevel);
  const templates = getTemplates(normalizedLevel);
  const matchedSteps = templates.map(template => (
    steps.find(step => step.id === template.stepId) ?? steps[0]
  ));
  const durations = allocateDurations(matchedSteps, totalSeconds);

  return templates.map((template, index) => {
    const step = matchedSteps[index];
    return {
      id: template.id,
      label: `${positionLabel(template.position)} ${template.title}`,
      position: template.position,
      targetPosition: template.targetPosition,
      roundId: step.roundId,
      seconds: durations[index],
      purpose: humanize(step.purpose),
      instruction: humanize(step.instruction),
      tasks: humanizeList(step.tasks),
      checklist: humanizeList(step.checklist),
      sentenceFrames: humanizeList(step.sentenceFrames),
      inputPlaceholder: humanize(step.inputPlaceholder || `${template.title} 내용을 입력하세요.`),
    };
  });
};
