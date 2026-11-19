import { query } from "./_generated/server";

/** Which sign-in providers this deployment has keys for (the login page shows setup help otherwise). */
export const providers = query({
  args: {},
  handler: async () => ({
    google: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
  }),
});
