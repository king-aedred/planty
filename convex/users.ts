import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const requireSelf = async (ctx: QueryCtx | MutationCtx, clerkId: string) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity || identity.subject !== clerkId) {
    throw new Error("Unauthorized");
  }
};

const getAuthenticatedUser = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Unauthorized");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
    .first();

  if (!user) {
    throw new Error("User not found");
  }

  return user;
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
      contact_window_start: v.optional(v.number()),
      contact_window_end: v.optional(v.number()),
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

export const generateTelegramConnectCode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const users = await ctx.db.query("users").collect();

    let code = "";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextCode = String(Math.floor(100000 + Math.random() * 900000));

      if (!users.some((entry) => entry.telegram_connect_code === nextCode)) {
        code = nextCode;
        break;
      }
    }

    if (!code) {
      throw new Error("Could not generate connect code");
    }

    await ctx.db.patch(user._id, {
      telegram_connect_code: code,
    });

    return code;
  },
});

export const connectTelegramByCode = mutation({
  args: {
    code: v.string(),
    chat_id: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedCode = args.code.trim()

    if (!normalizedCode) {
      throw new Error("Invalid code")
    }

    const users = await ctx.db.query("users").collect();
    const user = users.find((entry) => entry.telegram_connect_code === normalizedCode);

    if (!user) {
      throw new Error("Invalid code");
    }

    await ctx.db.patch(user._id, {
      telegram_chat_id: args.chat_id,
      telegram_connect_code: undefined,
    });

    return user._id;
  },
});

export const disconnectTelegram = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    await ctx.db.patch(user._id, {
      telegram_chat_id: undefined,
      telegram_connect_code: undefined,
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