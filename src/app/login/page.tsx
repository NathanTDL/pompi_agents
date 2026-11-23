"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { Logo } from "@/components/brand/logo";
import { HeroDemo } from "@/components/landing/hero-demo";

const noop = () => () => {};

/** Where to go after signing in: a same-site path from ?next=, else the board list. */
function readNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/app";
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const providers = useQuery(api.config.providers, {});
  const [pending, setPending] = React.useState(false);
  const next = React.useSyncExternalStore(noop, readNext, () => "/app");
  const origin = React.useSyncExternalStore(noop, () => window.location.origin, () => "http://localhost:3000");

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(next);
  }, [isLoading, isAuthenticated, router, next]);

  const signIn = async () => {
    setPending(true);
    track("sign_in_clicked");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: next });
      if (result.error) toast.error("Google sign-in failed", { description: result.error.message ?? "Please try again." });
    } catch (error) {
      toast.error("Google sign-in failed", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <main className="relative flex flex-col px-6 py-6 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-16">
          <h1 className="animate-fade-up text-[34px] leading-[1.05] font-bold tracking-[-0.04em]">Welcome to Pompi</h1>
          <p className="mt-3 animate-fade-up text-[15px] leading-relaxed text-muted [animation-delay:60ms]">Sign in to open your boards and work alongside your AI teammates.</p>
          <div className="mt-9 animate-fade-up [animation-delay:120ms]">
            {providers === undefined ? (
              <div className="h-12 animate-pulse rounded-xl bg-black/[0.05]" />
            ) : providers.google ? (
              <button
                type="button"
                onClick={() => void signIn()}
                disabled={pending || isLoading}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-white text-[15px] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-black/15 hover:shadow-[0_6px_18px_-8px_rgba(0,0,0,0.25)] disabled:opacity-60"
              >
                {pending ? <LoaderCircle className="size-5 animate-spin" /> : <GoogleMark />}
                {pending ? "Opening Google…" : "Continue with Google"}
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-black/15 p-4 text-xs leading-relaxed text-muted">
                <p className="text-sm font-semibold text-ink">Google sign-in isn&apos;t set up yet</p>
                <p className="mt-1.5">Create OAuth credentials in the Google Cloud Console with this redirect URI, then set them on Convex:</p>
                <code className="mt-2 block rounded-lg bg-black/[0.05] px-3 py-2 font-mono break-all">{origin}/api/auth/callback/google</code>
                <code className="mt-2 block rounded-lg bg-black/[0.05] px-3 py-2 font-mono">npx convex env set GOOGLE_CLIENT_ID …</code>
                <code className="mt-1 block rounded-lg bg-black/[0.05] px-3 py-2 font-mono">npx convex env set GOOGLE_CLIENT_SECRET …</code>
              </div>
            )}
          </div>
          <p className="mt-6 text-[12.5px] leading-relaxed text-muted">By continuing you agree to use Pompi kindly. Choose a plan once you&apos;re in, from $19 a month.</p>
        </div>
      </main>
      <aside className="relative m-3 hidden overflow-hidden rounded-[28px] bg-[#16151A] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 70% 0%, rgba(123,77,255,0.55), transparent 70%), radial-gradient(40% 40% at 10% 100%, rgba(255,36,189,0.25), transparent 70%)" }} />
        <div className="relative px-12 pt-14">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-white/50 uppercase">Pompi</p>
          <p className="mt-4 max-w-md text-[32px] leading-[1.08] font-bold tracking-[-0.035em] text-white">Write it on the board. The right agent walks over and does it.</p>
        </div>
        <div className="relative mt-auto px-12 pb-12">
          <div className="pompi-window overflow-hidden rounded-2xl bg-white">
            <HeroDemo />
          </div>
        </div>
      </aside>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.26-2.09 3.54-5.17 3.54-8.87Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.63l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}
