'use client';

import { QueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ResumePendingGatedActions } from '@/components/auth/ResumePendingGatedActions';

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return (
    <TanStackQueryClientProvider client={queryClient}>
      <ResumePendingGatedActions />
      {children}
    </TanStackQueryClientProvider>
  );
}
