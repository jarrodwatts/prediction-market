import { getDefaultConfig } from '@rainbow-me/rainbowkit'
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

export const config = getDefaultConfig({
  appName: 'Prediction Market',
  projectId: '3fcc6bba6f1d54709f13afbf12dc1885', // Using a public demo ID or placeholder. 
  chains: [abstractTestnet],
  ssr: true,
})
