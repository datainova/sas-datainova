import type { Cadence, IndicatorDirection } from '@datainova/common';

export type SegmentValue = {
  id: string;
  value: string;
  code: string;
};

export type SegmentAxis = {
  id: string;
  label: string;
  code: string;
  values: SegmentValue[];
};

export type ObjectiveStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type Objective = {
  id: string;
  orgId: string;
  teamId?: string | null;
  title: string;
  description: string;
  cadence: Cadence;
  startDate: string;
  endDate: string;
  status: ObjectiveStatus;
  segments: SegmentAxis[];
};

export type IndicatorType = 'KR' | 'KPI';

export type IndicatorDefinition = {
  id: string;
  orgId: string;
  objectiveId?: string | null;
  type: IndicatorType;
  title: string;
  description: string;
  cadence: Cadence;
  startDate: string;
  endDate: string;
  unitCode: string;
  unitCustom?: string | null;
  direction: IndicatorDirection;
  status: string;
  segments: SegmentAxis[];
};

export type IndicatorValueStatus = 'ON' | 'RISK' | 'OFF';

export type IndicatorValue = {
  id: string;
  period: string;
  segmentKey: string | null;
  value: number;
  status: IndicatorValueStatus;
  version: number;
  collectedAt: string;
};

export type KeyResult = IndicatorDefinition & { type: 'KR' };

export type Kpi = IndicatorDefinition & { type: 'KPI' };
