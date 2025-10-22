import type { IndicatorDirection, IndicatorStatusCalc } from '@prisma/client';

type StatusResult = IndicatorStatusCalc;

export const calculateIndicatorStatus = ({
  direction,
  value,
  targetValue,
  tolerance = 0
}: {
  direction: IndicatorDirection;
  value: number;
  targetValue?: number | null;
  tolerance?: number | null;
}): StatusResult => {
  if (targetValue === undefined || targetValue === null) {
    return 'ON';
  }

  const tol = Math.max(0, tolerance ?? 0);

  if (direction === 'INCREASE') {
    if (value >= targetValue) return 'ON';
    if (value >= targetValue * (1 - tol)) return 'RISK';
    return 'OFF';
  }

  if (direction === 'DECREASE') {
    if (value <= targetValue) return 'ON';
    if (value <= targetValue * (1 + tol)) return 'RISK';
    return 'OFF';
  }

  const delta = Math.abs(value - targetValue);
  if (delta <= tol) return 'ON';
  return 'OFF';
};
