'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { KineticButton } from './kinetic-button';
import { ShaderBackground } from './shader-background';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = isSignup
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message ?? 'Something went wrong. Please try again.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <ShaderBackground colorA="#4F46E5" colorB="#10B981" paused={false} />
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-[400px] rounded-[20px] p-7">
          <p className="font-display text-xl font-extrabold tracking-tight">Ethermind</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Social Command Center</p>

          <h1 className="mt-7 font-display text-lg font-bold">{isSignup ? 'Create your account' : 'Sign in'}</h1>
          <p className="mt-1 text-sm text-muted">
            {isSignup
              ? 'Use the email address your Super Admin invited.'
              : 'Internal access for the Ethermind and Klozer team.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-faint">
                  Name
                </label>
                <input
                  id="name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-faint">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-faint">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={isSignup ? 10 : 1}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm"
              />
              {isSignup && <p className="mt-1.5 text-xs text-faint">At least 10 characters.</p>}
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            )}

            <KineticButton
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={pending}
              label={pending ? 'Please wait...' : isSignup ? 'Create account' : 'Sign in'}
            />
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-ink underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                Invited by your Super Admin?{' '}
                <Link href="/accept-invite" className="font-semibold text-ink underline">
                  Create your account
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </>
  );
}
