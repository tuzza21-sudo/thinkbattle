export type DebatePhaseTiming = { label: string; seconds: number };

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
