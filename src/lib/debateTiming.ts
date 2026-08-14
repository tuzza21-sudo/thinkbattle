export type DebatePhaseTiming = { label: string; seconds: number };

export const DEBATE_TIME_OPTIONS = [600, 900, 1200] as const;

export const normalizeDebateTimeLimit = (seconds: number) => {
  if (!Number.isFinite(seconds)) return DEBATE_TIME_OPTIONS[0];
  return DEBATE_TIME_OPTIONS.reduce((closest, option) => (
    Math.abs(option - seconds) < Math.abs(closest - seconds) ? option : closest
  ));
};

const phaseWeights = [
  { label: '입론', weight: 0.22 },
  { label: '질의·응답', weight: 0.26 },
  { label: '반론', weight: 0.30 },
  { label: '최종 변론', weight: 0.22 },
];

export const getDebatePhaseTimings = (totalSeconds: number): DebatePhaseTiming[] => {
  let allocated = 0;
  return phaseWeights.map((phase, index) => {
    const seconds = index === phaseWeights.length - 1
      ? totalSeconds - allocated
      : Math.round(totalSeconds * phase.weight / 10) * 10;
    allocated += seconds;
    return { label: phase.label, seconds };
  });
};

export const formatDebateMinutes = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}분 ${remainder}초` : `${minutes}분`;
};
