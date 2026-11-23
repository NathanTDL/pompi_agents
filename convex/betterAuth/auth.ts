import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import authConfig from "../auth.config";
import { capture } from "../analytics";
import schema from "./schema";

export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

/**
 * The site's own origin plus its www / bare twin, so sign-in works whichever
 * one the host treats as primary (e.g. Vercel redirecting example.com → www).
 */
function trustedOrigins(siteUrl: string | undefined): string[] {
  if (!siteUrl) return [];
  try {
    const url = new URL(siteUrl);
    const twin = new URL(url.origin);
    twin.hostname = url.hostname.startsWith("www.")
      ? url.hostname.slice(4)
      : `www.${url.hostname}`;
    return url.hostname === "localhost" ? [url.origin] : [url.origin, twin.origin];
  } catch {
    return [];
  }
}

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return {
    appName: "Pompi",
    baseURL: process.env.SITE_URL,
    trustedOrigins: trustedOrigins(process.env.SITE_URL),
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    ...(googleClientId && googleClientSecret
      ? {
          socialProviders: {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          },
        }
      : {}),
    plugins: [convex({ authConfig })],
    // A new person: the start of every funnel (analytics.ts).
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await capture("signed_up", user.id, {}, { email: user.email, name: user.name });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
};

export const options = createAuthOptions({} as GenericCtx<DataModel>);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};
