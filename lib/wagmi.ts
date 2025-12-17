import { createConfig, http } from 'wagmi'
import { abstract, abstractTestnet } from 'viem/chains'

// Active chain - controlled by environment variable
// Set NEXT_PUBLIC_NETWORK=mainnet to use mainnet
const isMainnet = process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
export const activeChain = isMainnet ? abstract : abstractTestnet

export const config = createConfig({
  chains: [abstractTestnet, abstract],
  transports: {
    [abstractTestnet.id]: http(),
    [abstract.id]: http(),
  },
  ssr: true,
})

// Re-export for convenience
export { abstract as abstractMainnet, abstractTestnet }
