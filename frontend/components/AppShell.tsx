'use client';

import { usePathname } from 'next/navigation';

import Sidebar from '@/components/Sidebar';

// Routes that render full-bleed without the app chrome (auth / oauth callbacks).
const BARE_ROUTES = ['/auth', '/callback'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const bare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  if (bare) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="grid-bg flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
