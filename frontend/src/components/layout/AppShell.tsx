'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '@/stores/auth'
import { auth as authApi } from '@/lib/api'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setAuth, clearAuth, setLoading, token } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!token) {
      setLoading(false)
      router.replace('/login')
      return
    }

    // Validate token on mount
    authApi
      .me()
      .then((company) => {
        setAuth(company, token)
      })
      .catch(() => {
        clearAuth()
        router.replace('/login')
      })
  }, [])

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-grid-500 flex items-center justify-center animate-pulse">
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">Loading GridSlot…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-grid-pattern">
        {children}
      </main>
    </div>
  )
}
