"use client";

import * as React from "react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";

export function ConvexClientProvider({ children, initialToken }: { children: React.ReactNode; initialToken?: string | null }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const client = React.useMemo(() => (convexUrl ? new ConvexReactClient(convexUrl) : null), [convexUrl]);
  if (!client) return <MissingConvexSetup />;
  return (
    <ConvexBetterAuthProvider client={client} authClient={authClient as unknown as AuthClient} initialToken={initialToken}>
      {children}
    </ConvexBetterAuthProvider>
  );
}

/** Shown in development until a Convex deployment is connected (see README). */
function MissingConvexSetup() {
  if (process.env.NODE_ENV === "production") {
    return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-black/60">Pompi is briefly unavailable. Please try again in a few minutes.</div>;
  }
  const steps = [
    "npx convex dev",
    "npx convex env set SITE_URL http://localhost:3000",
    "npx convex env set BETTER_AUTH_SECRET <32+ random characters>",
    "npx convex env set GOOGLE_CLIENT_ID <id>",
    "npx convex env set GOOGLE_CLIENT_SECRET <secret>",
  ];
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-8 shadow-lg">
        <p className="text-xs font-bold tracking-widest text-pompi uppercase">Pompi setup</p>
        <h1 className="mt-2 text-xl font-semibold">Connect a Convex deployment to start</h1>
        <p className="mt-3 text-sm text-black/60">Pompi keeps its boards in Convex. Run these once, then restart the dev server:</p>
        <ol className="mt-5 space-y-2 text-sm">
          {steps.map((step, i) => (
            <li key={step} className="rounded-lg bg-black/[0.04] p-3 font-mono text-[13px]">
              {i + 1}. {step}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-black/50">
          <code className="font-mono">npx convex dev</code> writes <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> into <code className="font-mono">.env.local</code> for you.
        </p>
      </div>
    </div>
  );
}
