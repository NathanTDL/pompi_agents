import posthog from "posthog-js";

/** A product event for PostHog (a no-op where it isn't running, like localhost). */
export function track(event: string, props?: Record<string, unknown>) {
  if (posthog.__loaded) posthog.capture(event, props);
}
