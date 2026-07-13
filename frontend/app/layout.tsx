import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title: 'PortAI — Stratton Fund',
  description: 'AI-native paper hedge fund. Agents research, debate, risk-manage, and paper-trade a real portfolio on a schedule — every decision auditable.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-white/20 selection:text-white bg-black text-white">
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
