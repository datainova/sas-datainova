import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cadence, IndicatorDirection } from '@datainova/common';
import { httpClient } from '../../../core/api/http-client';
import type { KeyResult } from '../../../core/types/strategic';
import {
  mapIndicatorDefinition,
  type IndicatorDefinitionResponse
} from '../../../core/api/mappers/indicator';

export const kresultKeys = {
  all: ['kresults'] as const,
  byObjective: (objectiveId: string) => [...kresultKeys.all, 'objective', objectiveId] as const,
  detail: (id: string) => [...kresultKeys.all, id] as const
};

const mapKeyResult = (indicator: IndicatorDefinitionResponse): KeyResult =>
  mapIndicatorDefinition(indicator) as KeyResult;

export const useKeyResultsByObjectiveQuery = (objectiveId: string) =>
  useQuery({
    queryKey: kresultKeys.byObjective(objectiveId),
    queryFn: async () => {
      const { data } = await httpClient.get<{ items: IndicatorDefinitionResponse[] }>(
        `/objectives/${objectiveId}/indicators`,
        {
          params: { type: 'KR' }
        }
      );
      return data.items.map(mapKeyResult);
    },
    enabled: Boolean(objectiveId)
  });

export const useKeyResultDetailQuery = (kresultId: string) =>
  useQuery({
    queryKey: kresultKeys.detail(kresultId),
    queryFn: async () => {
      const { data } = await httpClient.get<IndicatorDefinitionResponse>(`/indicators/${kresultId}`);
      return data.type === 'KR' ? mapKeyResult(data) : null;
    },
    enabled: Boolean(kresultId)
  });

export type CreateKeyResultInput = {
  objectiveId: string;
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

export const useCreateKeyResultMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateKeyResultInput) => {
      const { data } = await httpClient.post<{ id: string }>('/kresults', {
        ...payload,
        type: 'KR'
      });
      return { id: data.id, objectiveId: payload.objectiveId };
    },
    onSuccess: (result) => {
      if (result.objectiveId) {
        void queryClient.invalidateQueries({ queryKey: kresultKeys.byObjective(result.objectiveId) });
      }
      void queryClient.invalidateQueries({ queryKey: kresultKeys.all });
    }
  });
};
