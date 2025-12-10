'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AbstractWalletProvider } from '@abstract-foundation/agw-react'
import { abstractTestnet } from '@/lib/wagmi'
import Script from 'next/script'
import '../globals.css'

/**
 * Extension Layout
 * 
 * Minimal layout for Twitch extension pages (overlay, config).
 * - No header/footer/aurora background
 * - Includes Twitch Extension Helper script
 * - Dark theme by default
 * - Transparent background for overlay mode
 */
export default function ExtensionLayout({
  children,
}: {
  children: ReactNode
}) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang="en" className="dark">
      <head>
        {/* Twitch Extension Helper - Required for all Twitch extensions */}
        <Script 
          src="https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-transparent text-foreground font-sans antialiased">
        <AbstractWalletProvider chain={abstractTestnet}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </AbstractWalletProvider>
      </body>
    </html>
  )
}

