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

export const updateUserSettings = mutation({
  args: {
    clerk_id: v.string(),
    settings: v.object({
      notification_push: v.optional(v.boolean()),
      notification_telegram: v.optional(v.boolean()),
      notification_planty_messenger: v.optional(v.boolean()),
      notification_call: v.optional(v.boolean()),
      contact_window_start: v.optional(v.string()),
      contact_window_end: v.optional(v.string()),
      measure_time: v.optional(v.string()),
      phone_number: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requireSelf(ctx, args.clerk_id);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();

    if (!user) {
      return null;
    }

    await ctx.db.patch(user._id, {
      notification_push: args.settings.notification_push,
      notification_telegram: args.settings.notification_telegram,
      notification_planty_messenger: args.settings.notification_planty_messenger,
      notification_call: args.settings.notification_call,
      contact_window_start: args.settings.contact_window_start,
      contact_window_end: args.settings.contact_window_end,
      measure_time: args.settings.measure_time,
      phone_number: args.settings.phone_number,
    });

    return user._id;
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