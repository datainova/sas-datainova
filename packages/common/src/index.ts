export type Cadence =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL'
  | 'BIENNIAL';

export type IndicatorDirection = 'INCREASE' | 'DECREASE' | 'MAINTAIN';

export const cadenceDurations: Record<Cadence, { months: number }> = {
  DAILY: { months: 0 },
  WEEKLY: { months: 0 },
  MONTHLY: { months: 1 },
  QUARTERLY: { months: 3 },
  SEMIANNUAL: { months: 6 },
  ANNUAL: { months: 12 },
  BIENNIAL: { months: 24 }
};

export const indicatorStatus = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  OFF_TRACK: 'OFF_TRACK'
} as const;

export type IndicatorStatus = (typeof indicatorStatus)[keyof typeof indicatorStatus];

export const unixEpochMs = () => Date.now();
