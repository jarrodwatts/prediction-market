'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AbstractWalletProvider } from '@abstract-foundation/agw-react'
import { SessionProvider } from 'next-auth/react'
import { abstractTestnet } from '@/lib/wagmi'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <SessionProvider>
      <AbstractWalletProvider chain={abstractTestnet}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </AbstractWalletProvider>
    </SessionProvider>
  )
}
