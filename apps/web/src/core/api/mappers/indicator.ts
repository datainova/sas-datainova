import type { Cadence, IndicatorDirection } from '@datainova/common';
import type { IndicatorDefinition } from '../../types/strategic';
import { mapSegment, type SegmentResponse } from './segment';

export type IndicatorDefinitionResponse = {
  id: string;
  orgId: string;
  objectiveId: string | null;
  type: 'KR' | 'KPI';
  title: string;
  description: string;
  cadence: Cadence;
  startDate: string;
  endDate: string;
  unitCode: string;
  unitCustom?: string | null;
  direction: IndicatorDirection;
  status: string;
  segments: SegmentResponse[];
};

export const mapIndicatorDefinition = (indicator: IndicatorDefinitionResponse): IndicatorDefinition => ({
  id: indicator.id,
  orgId: indicator.orgId,
  objectiveId: indicator.objectiveId ?? undefined,
  type: indicator.type,
  title: indicator.title,
  description: indicator.description,
  cadence: indicator.cadence,
  startDate: indicator.startDate,
  endDate: indicator.endDate,
  unitCode: indicator.unitCode,
  unitCustom: indicator.unitCustom ?? undefined,
  direction: indicator.direction,
  status: indicator.status,
  segments: indicator.segments.map(mapSegment)
});
