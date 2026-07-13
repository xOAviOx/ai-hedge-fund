'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.push('/');
  }, [user, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Registration successful — check your email to confirm.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Authentication failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
    }
  };

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="panel p-8">
          <div className="mb-7 flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <ShieldCheck size={24} />
            </span>
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              {isSignUp ? 'Create an account' : 'Welcome to PortAI'}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {isSignUp ? 'Set up access to the Stratton Fund' : 'Sign in to access the fund console'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-3">
            <div>
              <label className="label mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-line bg-panel2 py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="label mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-line bg-panel2 py-2.5 pl-9 pr-10 text-sm text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Spinner /> : isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </form>

          <div className="mt-3 text-center">
            <button
              onClick={() => setIsSignUp((v) => !v)}
              className="text-xs text-accent/80 transition-colors hover:text-accent"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="label">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full rounded-md border border-line bg-panel2 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            Continue with Google
          </button>

          {message && (
            <div
              className={`mt-5 flex items-start gap-2 rounded-md border p-3 text-xs ${
                message.type === 'success'
                  ? 'border-up/25 bg-up/10 text-up'
                  : 'border-down/25 bg-down/10 text-down'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-2xs uppercase tracking-wider text-muted">
          Auth is optional — the fund runs single-user by default
        </p>
      </div>
    </main>
  );
}
