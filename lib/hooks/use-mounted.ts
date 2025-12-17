'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true once the component has mounted on the client.
 * Use this to delay rendering of client-only content.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}

