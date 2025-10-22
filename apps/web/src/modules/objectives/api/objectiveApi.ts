import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../../core/api/http-client';
import type { Cadence } from '@datainova/common';
import type { Objective, ObjectiveStatus } from '../../../core/types/strategic';
import { mapSegment, type SegmentResponse } from '../../../core/api/mappers/segment';

export const objectiveKeys = {
  all: ['objectives'] as const,
  detail: (id: string) => [...objectiveKeys.all, id] as const
};

type ObjectiveResponse = {
  id: string;
  orgId: string;
  title: string;
  description: string;
  cadence: Cadence;
  startDate: string;
  endDate: string;
  status: ObjectiveStatus;
  teamId: string | null;
  segments: SegmentResponse[];
};

const mapObjective = (objective: ObjectiveResponse): Objective => ({
  id: objective.id,
  orgId: objective.orgId,
  title: objective.title,
  description: objective.description,
  cadence: objective.cadence,
  startDate: objective.startDate,
  endDate: objective.endDate,
  status: objective.status,
  segments: objective.segments.map(mapSegment),
  teamId: objective.teamId
});

export const useObjectivesQuery = () =>
  useQuery({
    queryKey: objectiveKeys.all,
    queryFn: async () => {
      const { data } = await httpClient.get<{ items: ObjectiveResponse[] }>('/objectives');
      return data.items.map(mapObjective);
    }
  });

export const useObjectiveDetailQuery = (objectiveId: string) =>
  useQuery({
    queryKey: objectiveKeys.detail(objectiveId),
    queryFn: async () => {
      const { data } = await httpClient.get<ObjectiveResponse>(`/objectives/${objectiveId}`);
      return mapObjective(data);
    },
    enabled: Boolean(objectiveId)
  });

export type CreateObjectiveInput = {
  title: string;
  description: string;
  cadence: Cadence;
  startDate: string;
  endDate: string;
  segments?: Array<{
    label: string;
    code: string;
    values: Array<{ value: string; code: string }>;
  }>;
};

export const useCreateObjectiveMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateObjectiveInput) => {
      const { data } = await httpClient.post<{ id: string }>('/objectives', payload);
      return data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.all });
    }
  });
};

type UpdateObjectiveInput = {
  id: string;
  data: Partial<CreateObjectiveInput> & { status?: ObjectiveStatus };
};

export const useUpdateObjectiveMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: UpdateObjectiveInput) => {
      const { data: updated } = await httpClient.patch<ObjectiveResponse>(`/objectives/${id}`, data);
      return mapObjective(updated);
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.all });
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.detail(variables.id) });
    }
  });
};
