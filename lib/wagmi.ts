import { createConfig, http, fallback, webSocket } from 'wagmi'
import { abstract, abstractTestnet } from 'viem/chains'

// Active chain - controlled by environment variable
// Set NEXT_PUBLIC_NETWORK=mainnet to use mainnet
const isMainnet = process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
export const activeChain = isMainnet ? abstract : abstractTestnet

// WebSocket URLs for real-time subscriptions
const WS_URLS = {
  testnet: 'wss://api.testnet.abs.xyz/ws',
  mainnet: 'wss://api.mainnet.abs.xyz/ws',
}

// Create transports with WebSocket for subscriptions, HTTP fallback for requests
// WebSocket enables: instant event notifications, no polling needed
// Fallback ensures reliability if WebSocket disconnects
const testnetTransport = fallback([
  webSocket(WS_URLS.testnet),
  http(),
])

const mainnetTransport = fallback([
  webSocket(WS_URLS.mainnet),
  http(),
])

export const config = createConfig({
  chains: [abstractTestnet, abstract],
  transports: {
    [abstractTestnet.id]: testnetTransport,
    [abstract.id]: mainnetTransport,
  },
  ssr: true,
})

// Re-export for convenience
export { abstract as abstractMainnet, abstractTestnet }
