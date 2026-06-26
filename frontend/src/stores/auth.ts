import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Company } from '@/types'
import { setToken, clearToken } from '@/lib/api'

interface AuthState {
  company: Company | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  setAuth: (company: Company, token: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  updateCompany: (company: Partial<Company>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      company: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (company, token) => {
        setToken(token)
        set({ company, token, isAuthenticated: true, isLoading: false })
      },

      clearAuth: () => {
        clearToken()
        set({ company: null, token: null, isAuthenticated: false, isLoading: false })
      },

      setLoading: (loading) => set({ isLoading: loading }),

      updateCompany: (updates) => {
        const { company } = get()
        if (company) set({ company: { ...company, ...updates } })
      },
    }),
    {
      name: 'gs_auth',
      partialize: (state) => ({ company: state.company, token: state.token }),
      onRehydrateStorage: () => (state) => {
        // Called once rehydration from localStorage is complete.
        // At this point state.company and state.token are populated (or null),
        // so we can safely set isLoading to false.
        if (state) {
          state.isLoading = false
          if (state.token) setToken(state.token)
        }
      },
    },
  ),
)