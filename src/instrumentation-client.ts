import posthog from "posthog-js";

/**
 * PostHog: product analytics, session replays and errors, when
 * NEXT_PUBLIC_POSTHOG_KEY is set (on Vercel for pompi.cc; nowhere by default).
 * Events go through /ingest (next.config.ts), so ad blockers don't drop them.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (KEY) {
  posthog.init(KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    capture_exceptions: true,
    person_profiles: "identified_only",
  });
}
