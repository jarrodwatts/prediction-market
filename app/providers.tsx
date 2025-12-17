'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'
import { AbstractWalletProvider } from '@abstract-foundation/agw-react'
import { SessionProvider } from 'next-auth/react'
import { abstractTestnet } from '@/lib/wagmi'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 seconds
        staleTime: 5_000,
        // Keep unused data in cache for 10 minutes
        gcTime: 10 * 60 * 1_000,
        // Retry failed requests twice
        retry: 2,
        // Refetch when window regains focus
        refetchOnWindowFocus: true,
      },
    },
  })
}

// Singleton for browser, fresh instance for SSR
let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient()
  }
  // Browser: use singleton pattern
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient())

  return (
    <SessionProvider>
      <AbstractWalletProvider chain={abstractTestnet}>
        <QueryClientProvider client={queryClient}>
          {children}
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </QueryClientProvider>
      </AbstractWalletProvider>
    </SessionProvider>
  )
}
