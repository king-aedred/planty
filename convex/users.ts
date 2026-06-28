import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getUserByClerkId = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();

    return user?.is_dev ?? false;
  },
});