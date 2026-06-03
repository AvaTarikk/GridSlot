'use client'

import { useWebSocket } from '@/hooks/useWebSocket'

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialise WebSocket connection if authenticated
  useWebSocket()
  return <>{children}</>
}
