import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cadence, IndicatorDirection } from '@datainova/common';
import { httpClient } from '../../../core/api/http-client';
import type { Kpi } from '../../../core/types/strategic';
import {
  mapIndicatorDefinition,
  type IndicatorDefinitionResponse
} from '../../../core/api/mappers/indicator';

export const kpiKeys = {
  all: ['kpis'] as const
};

export const useKpisQuery = () =>
  useQuery({
    queryKey: kpiKeys.all,
    queryFn: async () => {
      const { data } = await httpClient.get<{ items: IndicatorDefinitionResponse[] }>('/indicators', {
        params: { type: 'KPI' }
      });
      return data.items.map((indicator) => mapIndicatorDefinition(indicator) as Kpi);
    }
  });

export type CreateKpiInput = {
  title: string;
  description: string;
  cadence: Cadence;
  startDate: string;
  endDate: string;
  unitCode: string;
  unitCustom?: string;
  direction: IndicatorDirection;
  segments?: Array<{
    label: string;
    code: string;
    values: Array<{ value: string; code: string }>;
  }>;
};

export const useCreateKpiMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateKpiInput) => {
      await httpClient.post('/kpis', {
        ...payload,
        type: 'KPI'
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kpiKeys.all });
    }
  });
};
