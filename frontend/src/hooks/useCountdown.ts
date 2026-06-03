'use client'

import { useState, useEffect } from 'react'
import { formatCountdown } from '@/lib/utils'

export function useCountdown(targetIso: string | null) {
  const [display, setDisplay] = useState<string>('--:--')
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!targetIso) return

    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now()
      if (diff <= 0) {
        setDisplay('00:00')
        setExpired(true)
        return
      }
      setDisplay(formatCountdown(targetIso))
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return { display, expired }
}
