import { QueryClient } from '@tanstack/react-query';

/**
 * Single client for the app. Reads are cheap and personal, so stale data is
 * refetched on focus; mutations invalidate explicitly (brief 7.4).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
