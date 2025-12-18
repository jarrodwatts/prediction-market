/**
 * Hook to fetch user profiles from ABS Portal API
 */

import { useQuery, useQueries } from "@tanstack/react-query";

export interface AbsProfile {
  address: string;
  name: string | null;
  description: string | null;
  profilePictureUrl: string | null;
  tier: string | null;
}

const ABS_PORTAL_API = "https://api.portal.abs.xyz/api/v1";

/**
 * Fetch a single profile from ABS Portal
 */
async function fetchAbsProfile(address: string): Promise<AbsProfile | null> {
  try {
    const response = await fetch(`${ABS_PORTAL_API}/user/profile/${address}/`);
    if (!response.ok) {
      // 404 means no profile exists - that's okay
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }
    return await response.json();
  } catch {
    // Silently fail - profile is optional
    return null;
  }
}

/**
 * Hook to fetch a single user's ABS Portal profile
 */
export function useAbsProfile(address: string | undefined) {
  return useQuery({
    queryKey: ["abs-profile", address?.toLowerCase()],
    queryFn: () => fetchAbsProfile(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: false, // Don't retry on failure
  });
}

/**
 * Hook to fetch multiple user profiles in parallel
 * Returns a map of address -> profile
 */
export function useAbsProfiles(addresses: string[]) {
  // Dedupe and normalize addresses
  const uniqueAddresses = [...new Set(addresses.map((a) => a.toLowerCase()))];

  const queries = useQueries({
    queries: uniqueAddresses.map((address) => ({
      queryKey: ["abs-profile", address],
      queryFn: () => fetchAbsProfile(address),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
    })),
  });

  // Build a map of address -> profile
  const profileMap = new Map<string, AbsProfile | null>();
  uniqueAddresses.forEach((address, i) => {
    profileMap.set(address, queries[i].data ?? null);
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);

  return {
    profiles: profileMap,
    isLoading,
    isFetching,
  };
}
