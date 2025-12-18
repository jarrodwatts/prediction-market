/**
 * Block explorer URL utilities for Abstract chain
 */

import { abstract, abstractTestnet } from "viem/chains";

const EXPLORER_URLS: Record<number, string> = {
  [abstract.id]: "https://abscan.org",
  [abstractTestnet.id]: "https://sepolia.abscan.org",
};

/**
 * Get the transaction URL for a given chain
 */
export function getExplorerTxUrl(
  txHash: string,
  chainId: number = abstractTestnet.id
): string {
  const baseUrl = EXPLORER_URLS[chainId] ?? EXPLORER_URLS[abstractTestnet.id];
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the address URL for a given chain
 */
export function getExplorerAddressUrl(
  address: string,
  chainId: number = abstractTestnet.id
): string {
  const baseUrl = EXPLORER_URLS[chainId] ?? EXPLORER_URLS[abstractTestnet.id];
  return `${baseUrl}/address/${address}`;
}
