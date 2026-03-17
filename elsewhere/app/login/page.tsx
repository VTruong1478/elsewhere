'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const IS_DEV = process.env.NODE_ENV === 'development';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(IS_DEV ? 'test@example.com' : '');
  const [password, setPassword] = useState(IS_DEV ? 'testpass123' : '');
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!IS_DEV) {
      setError('Email and password login is only available in development.');
      return;
    }

    setIsLoadingEmail(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsLoadingEmail(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push('/feed');
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsLoadingGoogle(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    setIsLoadingGoogle(false);
    if (signInError) {
      setError(signInError.message);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-16 font-dm-sans">
      <div className="w-full max-w-sm rounded-radius-md border border-surface-alt bg-surface px-24 py-32">
        <header className="mb-24 text-center">
          <h1 className="mb-4 text-heading-l text-text">elsewhere</h1>
          <p className="text-body-m text-text-secondary">
            Find your spot to work.
          </p>
        </header>

        <section className="mb-16">
          <p className="mb-8 text-ui-label-m text-text-secondary">
            Sign in to save your spots
          </p>
          <form onSubmit={handleEmailSignIn} className="space-y-12">
            <div className="space-y-4">
              <label className="text-ui-label-s text-text-secondary" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[44px] w-full rounded-radius-sm border border-surface-alt bg-surface px-12 text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-4">
              <label
                className="text-ui-label-s text-text-secondary"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-[44px] w-full rounded-radius-sm border border-surface-alt bg-surface px-12 text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingEmail}
              className="mt-4 flex h-44 w-full items-center justify-center rounded-radius-md bg-primary text-ui-button text-text-inverse focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoadingEmail ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </section>

        <div className="my-16 flex items-center gap-8 text-text-tertiary">
          <div className="h-px flex-1 bg-surface-alt" />
          <span className="text-ui-label-s">or</span>
          <div className="h-px flex-1 bg-surface-alt" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoadingGoogle}
          className="mb-16 flex h-44 w-full items-center justify-center gap-8 rounded-radius-md border border-surface-alt bg-surface text-ui-button text-text focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50"
        >
          <span className="rounded-full bg-surface-alt px-8 py-4 text-body-s text-text">
            G
          </span>
          <span>Continue with Google</span>
        </button>

        {error && (
          <p className="mb-16 text-body-s text-status-low">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => router.push('/feed')}
          className="mx-auto block text-body-s text-text-secondary underline-offset-2 hover:underline"
        >
          Browse without an account
        </button>
      </div>
    </div>
  );
}

