import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const requireSelf = async (ctx: QueryCtx | MutationCtx, clerkId: string) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity || identity.subject !== clerkId) {
    throw new Error("Unauthorized");
  }
};

export const getUserByClerkId = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSelf(ctx, args.clerk_id);

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();
  },
});

export const createUser = mutation({
  args: {
    clerk_id: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSelf(ctx, args.clerk_id);

    const id = await ctx.db.insert("users", {
      clerk_id: args.clerk_id,
      email: args.email,
      plan: "basic",
      is_dev: false,
      created_at: Date.now(),
    });

    return id;
  },
});

export const isDevUser = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSelf(ctx, args.clerk_id);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();

    return user?.is_dev ?? false;
  },
});