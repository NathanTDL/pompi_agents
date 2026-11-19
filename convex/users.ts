import { query } from "./_generated/server";

/** Who's signed in, or null. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      userId: identity.subject,
      name: identity.name ?? identity.email ?? "You",
      email: identity.email ?? null,
      image: typeof identity.pictureUrl === "string" ? identity.pictureUrl : null,
    };
  },
});
