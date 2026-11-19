"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "convex/react";

/** Sends someone who isn't signed in to the login page, coming back here after. True once signed in. */
export function useSignedIn() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  React.useEffect(() => {
    if (isLoading || isAuthenticated) return;
    const here = window.location.pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [isLoading, isAuthenticated, router]);
  return !isLoading && isAuthenticated;
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="size-8 animate-spin rounded-full border-[3px] border-black/10 border-t-figblue" />
    </div>
  );
}
