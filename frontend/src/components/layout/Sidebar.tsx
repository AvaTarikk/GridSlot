'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { cn, formatDeliveryScore, deliveryScoreColor } from '@/lib/utils'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
        <path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm8-3a3 3 0 100 6 3 3 0 000-6z" />
      </svg>
    ),
  },
  {
    href: '/marketplace',
    label: 'Marketplace',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM12 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0112 5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/map',
    label: 'Congestion Map',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
        <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/forecast',
    label: 'Market Forecast',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
        <path fillRule="evenodd" d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/portfolio',
    label: 'Portfolio',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
        <path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.572.729 6.016 6.016 0 002.856 0A.75.75 0 0012 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.553 7.553 0 01-2.274 0z" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { company, clearAuth } = useAuthStore()

  function handleSignOut() {
    clearAuth()
    router.replace('/login')
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-surface-1">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-grid-500 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
            </svg>
          </div>
          <div>
            <span className="font-display font-semibold text-sm text-white tracking-tight">GridSlot</span>
            <p className="text-[10px] text-slate-500 -mt-0.5">Capacity Marketplace</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                active
                  ? 'bg-grid-500/15 text-grid-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-3',
              )}
            >
              <span className={active ? 'text-grid-400' : 'text-slate-500'}>{item.icon}</span>
              {item.label}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-grid-400" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Company info + logout */}
      {company && (
        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-surface-4 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
              {company.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{company.name}</p>
              <p className="text-[11px] text-slate-500 capitalize">{company.role.toLowerCase()}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-slate-500">Delivery score</span>
            <span className={cn('text-[11px] font-medium tabular', deliveryScoreColor(company.delivery_score))}>
              {formatDeliveryScore(company.delivery_score)}
            </span>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full text-left text-xs text-slate-500 hover:text-slate-300 transition-colors py-1 flex items-center gap-2"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h5.5A2.75 2.75 0 0113 4.75v.841a.75.75 0 01-1.5 0V4.75c0-.69-.56-1.25-1.25-1.25h-5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h5.5c.69 0 1.25-.56 1.25-1.25v-.841a.75.75 0 011.5 0v.841A2.75 2.75 0 0110.25 14h-5.5A2.75 2.75 0 012 11.25v-6.5zM8.5 5.5a.75.75 0 01.75.75v1.5h2.5a.75.75 0 010 1.5h-2.5v1.5a.75.75 0 01-1.5 0v-1.5H5.25a.75.75 0 010-1.5H7.75v-1.5A.75.75 0 018.5 5.5z" clipRule="evenodd" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}
