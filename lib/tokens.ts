/**
 * Token Configuration
 *
 * Centralized configuration for tokens used in the application.
 * Eliminates duplication of USDC address, decimals, and ERC20 ABI.
 */

import { parseUnits, formatUnits } from 'viem'

// =============================================================================
// USDC Configuration
// =============================================================================

export const USDC = {
  address: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  decimals: 6,
  symbol: 'USDC',
} as const

// =============================================================================
// ERC20 ABI (minimal for approve, allowance, balanceOf)
// =============================================================================

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// =============================================================================
// USDC Formatting Utilities
// =============================================================================

/**
 * Format a USDC bigint amount to a human-readable string
 */
export function formatUSDC(value: bigint): string {
  return formatUnits(value, USDC.decimals)
}

/**
 * Parse a human-readable USDC string to bigint
 */
export function parseUSDC(value: string): bigint {
  return parseUnits(value, USDC.decimals)
}

/**
 * Format USDC with currency symbol
 */
export function formatUSDCurrency(value: bigint): string {
  const num = parseFloat(formatUSDC(value))
  return `$${num.toFixed(2)}`
}

