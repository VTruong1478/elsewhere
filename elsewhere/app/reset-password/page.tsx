"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { safeInternalPath } from "@/lib/safeNextPath";

function AuthIllustration() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden lg:right-1/2"
      aria-hidden
    >
      <div className="absolute -left-24 top-0 h-[120px] w-[176px] bg-surface-alt/80 lg:left-8 lg:top-8 lg:h-[176px] lg:w-[208px]" />
      <div className="absolute -right-32 top-72 h-[88px] w-[168px] bg-surface-alt/80 lg:right-auto lg:left-[560px] lg:top-[120px] lg:h-[208px] lg:w-[208px]" />
      <div className="absolute right-24 top-[220px] h-[56px] w-[112px] bg-surface-alt/70 lg:right-auto lg:left-10 lg:bottom-10 lg:top-auto lg:h-[96px] lg:w-[144px]" />
      <div className="absolute left-20 top-[140px] h-[44px] w-[84px] bg-surface-alt/75 lg:left-[240px] lg:top-[40px] lg:h-[64px] lg:w-[120px]" />
      <div className="absolute right-6 top-[360px] h-[72px] w-[132px] bg-surface-alt/70 lg:right-auto lg:left-[300px] lg:top-[280px] lg:h-[88px] lg:w-[164px]" />
      <div className="hidden lg:block absolute left-6 bottom-14 h-[36px] w-[68px] bg-surface-alt/80 lg:left-[420px] lg:top-[430px] lg:bottom-auto lg:h-[52px] lg:w-[104px]" />
      <div className="absolute left-36 top-[256px] h-44 w-44 rounded-full bg-surface/70 lg:left-[160px] lg:top-[176px] lg:h-36 lg:w-36" />
      <div className="absolute right-8 top-[152px] h-20 w-20 rounded-full bg-surface/70 lg:left-[384px] lg:top-[312px] lg:h-40 lg:w-40" />
      <div className="hidden lg:block absolute left-8 top-[420px] h-28 w-28 rounded-full bg-surface/70 lg:left-28 lg:top-[460px] lg:h-32 lg:w-32" />
      <div className="absolute left-[220px] top-[72px] h-24 w-24 rounded-full bg-surface/70 lg:left-[520px] lg:top-[84px] lg:h-28 lg:w-28" />
      <div className="absolute left-10 bottom-6 h-14 w-14 rounded-full bg-surface/70 lg:left-[300px] lg:bottom-12 lg:h-24 lg:w-24" />
      <div className="hidden lg:block absolute left-[210px] bottom-24 h-[44px] w-[92px] bg-surface-alt/75 lg:left-[430px] lg:bottom-[190px] lg:h-[58px] lg:w-[124px]" />
      <div className="hidden lg:block absolute left-[230px] bottom-8 h-[30px] w-[66px] bg-surface-alt/75 lg:left-[510px] lg:bottom-[78px] lg:h-[42px] lg:w-[92px]" />
      <div className="hidden lg:block absolute left-[180px] bottom-40 h-16 w-16 rounded-full bg-surface/70 lg:left-[400px] lg:bottom-[250px] lg:h-20 lg:w-20" />
      <div className="absolute right-14 bottom-8 h-10 w-10 rounded-full bg-surface/70 lg:left-[560px] lg:bottom-[36px] lg:h-14 lg:w-14" />
      <div className="absolute left-10 top-10 text-primary/85 lg:left-40 lg:top-24">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="absolute right-10 top-12 text-primary/85 lg:left-56 lg:top-28">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="absolute left-10 bottom-14 text-primary/85 lg:left-24 lg:bottom-20">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="absolute right-12 bottom-16 text-primary/85 lg:left-[120px] lg:top-[360px]">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="hidden lg:block absolute left-[52px] bottom-[180px] text-primary/85 lg:left-[500px] lg:bottom-[260px]">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="hidden lg:block absolute left-[260px] bottom-10 text-primary/85 lg:left-[420px] lg:bottom-[120px]">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="hidden lg:block absolute left-[228px] bottom-34 text-primary/85 lg:left-[470px] lg:bottom-[236px]">
        <MapPin size={24} strokeWidth={2} />
      </div>
      <div className="hidden lg:block absolute left-[278px] bottom-6 text-primary/85 lg:left-[590px] lg:bottom-[92px]">
        <MapPin size={24} strokeWidth={2} />
      </div>
    </div>
  );
}

type PageStatus = "loading" | "ready" | "expired";

function ResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const nextSafe = safeInternalPath(searchParams.get("next"));

  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let gotRecovery = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          gotRecovery = true;
          setPageStatus("ready");
        }
      },
    );

    // If PASSWORD_RECOVERY doesn't fire within 5s, the link is expired or missing
    const timer = setTimeout(() => {
      if (!gotRecovery) setPageStatus("expired");
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Ensure session cookies are committed before navigation
    await supabase.auth.getSession();
    window.location.assign("/login?message=password-updated");
  }

  const authPanelContent =
    pageStatus === "loading" ? (
      <p className="text-body-l text-text-secondary">Verifying reset link…</p>
    ) : pageStatus === "expired" ? (
      <>
        <p className="text-ui-label-xl text-text-secondary">Link expired</p>
        <p className="text-body-l text-text">
          This reset link has expired or is invalid.{" "}
          <Link href="/forgot-password" className="text-accent text-link">
            Request a new one.
          </Link>
        </p>
      </>
    ) : (
      <>
        <p className="text-ui-label-xl text-text-secondary">
          Set a new password
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-16">
          <Input
            variant="field"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            className="bg-surface"
          />
          <Input
            variant="field"
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            className="bg-surface"
          />
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full text-ui-button disabled:opacity-50"
          >
            {isLoading ? "Saving…" : "Set new password"}
          </Button>
        </form>
        {error && <p className="text-body-s text-status-low">{error}</p>}
      </>
    );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="lg:hidden flex min-h-screen flex-col">
        <div className="relative h-[240px] overflow-hidden">
          <AuthIllustration />
          <section className="relative z-10 mx-auto flex h-full w-full max-w-md flex-col items-center justify-center px-16 text-center">
            <h1 className="text-display-xl text-primary">elsewhere</h1>
            <p className="mt-8 text-[24px] text-primary">
              Find your spot to work.
            </p>
          </section>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-4 px-16 md:grid-cols-8 md:px-24">
          <section className="relative col-span-4 flex min-h-0 flex-1 flex-col pt-24 md:col-span-6 md:col-start-2">
            <div className="flex flex-col gap-16">{authPanelContent}</div>
            <Link
              href="/login"
              className="mx-auto mt-auto pb-16 text-body-l text-accent text-link"
            >
              Back to login
            </Link>
          </section>
        </div>
      </div>

      <div className="hidden lg:block">
        <AuthIllustration />
        <div className="relative z-10 mx-auto flex min-h-screen w-full flex-col px-16 pb-24 pt-24 lg:px-0 lg:py-24">
          <div className="grid flex-1 items-start gap-24 lg:grid-cols-12 lg:items-center lg:gap-24">
            <section className="mx-auto w-full max-w-md pt-48 text-center lg:col-span-6 lg:mx-auto lg:max-w-xl lg:pt-0">
              <h1 className="text-display-xl text-primary lg:text-display-xl">
                elsewhere
              </h1>
              <p className="mt-8 text-[24px] text-primary">
                Find your spot to work.
              </p>
            </section>

            <section className="relative mx-auto flex min-h-full w-full max-w-md flex-col gap-16 lg:col-span-6 lg:mx-auto lg:max-w-lg lg:justify-center">
              <div className="flex flex-col gap-16 lg:rounded-radius-md lg:px-24 lg:py-24">
                {authPanelContent}
              </div>

              <Link
                href="/login"
                className="mx-auto pb-16 text-body-l text-accent text-link lg:absolute lg:bottom-24 lg:left-1/2 lg:-translate-x-1/2 lg:pb-0"
              >
                Back to login
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-background" aria-hidden />}
    >
      <ResetPasswordPageInner />
    </Suspense>
  );
}
