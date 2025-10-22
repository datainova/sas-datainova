import { QueryClient } from '@tanstack/react-query';

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true
      },
      mutations: {
        retry: 0
      }
    }
  });

export type AppQueryClient = ReturnType<typeof createQueryClient>;
