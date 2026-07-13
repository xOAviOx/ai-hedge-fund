'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, LogOut, User } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

const NAV_LINKS = [
  { label: 'Intelligence', href: '/intelligence' },
  { label: 'Charts', href: '/technical-charts' },
  { label: 'Hedge Fund', href: '/hedge-fund' },
  { label: 'Paper Trading', href: '/paper-trading' },
  { label: 'Backtesting', href: '/backtesting' },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center py-4 px-4">
      <div
        className={`transition-all duration-300 ease-out flex items-center justify-between px-6 w-full max-w-7xl rounded-2xl border border-white/10 ${
          scrolled ? 'h-14 bg-black/70 backdrop-blur-xl' : 'h-16 bg-white/[0.02]'
        }`}
      >
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex text-black bg-white w-9 h-9 rounded-xl items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <span className="text-lg font-bold tracking-tight tabular-nums">PortAI</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[13px] font-medium text-white/50 hover:text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 text-[11px] font-bold text-white/40 hover:text-red-400 transition-colors uppercase tracking-wider"
              >
                <LogOut size={14} /> Sign Out
              </button>
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-blue-400 overflow-hidden">
                {user.user_metadata?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={18} />
                )}
              </div>
            </div>
          ) : (
            <Link
              href="/auth"
              className="px-5 py-2 rounded-xl bg-white text-black text-[13px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
