import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message?: string
}

interface ToastStore {
  toasts: Toast[]
  add: (t: Omit<Toast, 'id'>) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (t) => {
    const id = Math.random().toString(36).slice(2)
    set(s => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })), 4000)
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}))