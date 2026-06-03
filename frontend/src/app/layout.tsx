import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/layout/Providers'
import { Toaster } from '@/components/ui/Toaster'

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['300', '400', '500', '600', '700'],
})

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '500', '600'],
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: {
    template: '%s · GridSlot',
    default: 'GridSlot — Dutch Grid Capacity Marketplace',
  },
  description:
    'Trade unused electricity grid capacity on the Dutch congestion marketplace. B2B — GTO compliant.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-surface-0 text-slate-100 font-body antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
