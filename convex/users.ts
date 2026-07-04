import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const notificationChannelValue = v.union(v.literal("push"), v.literal("telegram"), v.literal("call"));

const notificationRulesValue = v.object({
  ok: v.array(notificationChannelValue),
  warning: v.array(notificationChannelValue),
  critical: v.array(notificationChannelValue),
});

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

export const getUserByClerkIdForProcessor = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();

    if (!user) {
      return null;
    }

    return {
      telegram_chat_id: user.telegram_chat_id,
      expo_push_token: user.expo_push_token,
      notification_rules: user.notification_rules,
      contact_window_start: user.contact_window_start,
      contact_window_end: user.contact_window_end,
      max_notifications_per_day: user.max_notifications_per_day,
    };
  },
});

export const getNotificationCount = query({
  args: {
    clerk_id: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.BACKEND_SECRET

    if (!expectedSecret || args.backend_secret !== expectedSecret) {
      throw new Error("Unauthorized: invalid backend secret")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();

    if (!user) {
      return 0;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (user.notifications_sent_date !== today) {
      return 0;
    }

    return user.notifications_sent_today ?? 0;
  },
});

export const incrementNotificationCount = mutation({
  args: {
    clerk_id: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.BACKEND_SECRET

    if (!expectedSecret || args.backend_secret !== expectedSecret) {
      throw new Error("Unauthorized: invalid backend secret")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .first();

    if (!user) {
      return 0;
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentCount = user.notifications_sent_date === today ? (user.notifications_sent_today ?? 0) : 0;
    const nextCount = currentCount + 1;

    await ctx.db.patch(user._id, {
      notifications_sent_today: nextCount,
      notifications_sent_date: today,
    });

    return nextCount;
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
      max_notifications_per_day: 3,
      created_at: Date.now(),
    });

    return id;
  },
});

export const updateUserSettings = mutation({
  args: {
    clerk_id: v.string(),
    settings: v.object({
      notification_rules: v.optional(notificationRulesValue),
      contact_window_start: v.optional(v.number()),
      contact_window_end: v.optional(v.number()),
      measure_time: v.optional(v.string()),
      phone_number: v.optional(v.string()),
      max_notifications_per_day: v.optional(v.number()),
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
      notification_rules: args.settings.notification_rules,
      contact_window_start: args.settings.contact_window_start,
      contact_window_end: args.settings.contact_window_end,
      measure_time: args.settings.measure_time,
      phone_number: args.settings.phone_number,
      max_notifications_per_day: args.settings.max_notifications_per_day,
    });

    return user._id;
  },
});

export const updatePushToken = mutation({
  args: {
    clerk_id: v.string(),
    token: v.string(),
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
      expo_push_token: args.token,
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
    const normalizedCode = args.code.trim();

    if (!normalizedCode) {
      throw new Error("Invalid code");
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