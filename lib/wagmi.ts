import { createConfig, http } from 'wagmi'
import { type Chain } from 'viem'

export const abstractTestnet = {
  id: 11124,
  name: 'Abstract Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.testnet.abs.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Abscan', url: 'https://sepolia.abscan.org' },
  },
  testnet: true,
} as const satisfies Chain

export const config = createConfig({
  chains: [abstractTestnet],
  transports: {
    [abstractTestnet.id]: http(),
  },
  ssr: true,
})
