'use client';

import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  async function handleSignIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-dm-sans">
      <div className="w-full max-w-sm rounded-radius-sm border border-surface-alt bg-surface p-8">
        <h1 className="font-lora text-heading-l text-text mb-6 text-center">
          Elsewhere
        </h1>
        <p className="text-body-m text-text-secondary mb-8 text-center">
          Sign in to discover third spaces in Atlanta.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          className="flex h-12 w-full items-center justify-center rounded-radius-sm bg-primary font-ui-button text-text-inverse focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
