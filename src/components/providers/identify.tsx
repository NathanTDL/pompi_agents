"use client";

import * as React from "react";
import posthog from "posthog-js";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** Ties PostHog's events to the signed-in person, and lets go on sign-out. */
export function Identify() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const who = useQuery(api.billing.whoami, isAuthenticated ? {} : "skip");
  const was = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!posthog.__loaded || isLoading) return;
    if (who) {
      if (was.current !== who.userId) posthog.identify(who.userId, { email: who.email, name: who.name });
      was.current = who.userId;
    } else if (!isAuthenticated && was.current) {
      posthog.reset();
      was.current = null;
    }
  }, [who, isAuthenticated, isLoading]);
  return null;
}
