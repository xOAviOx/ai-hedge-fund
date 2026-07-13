import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'PortAI — Stratton Fund',
  description:
    'AI-native paper hedge fund. Agents research, debate, risk-manage, and paper-trade a real portfolio on a schedule — every decision auditable.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased selection:bg-accent/30 selection:text-white">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
