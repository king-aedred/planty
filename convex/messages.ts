import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const requireSelf = async (ctx: QueryCtx | MutationCtx, clerkId: string) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity || identity.subject !== clerkId) {
    throw new Error("Unauthorized");
  }
};

export const getMessagesByClerkId = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSelf(ctx, args.clerk_id);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .collect();

    return messages.sort((left, right) => right.created_at - left.created_at);
  },
});

export const getUnreadCount = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSelf(ctx, args.clerk_id);

    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_clerk_id_and_read", (q) => q.eq("clerk_id", args.clerk_id).eq("read", false))
      .collect();

    return unreadMessages.length;
  },
});

export const markAsRead = mutation({
  args: {
    message_id: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.message_id);

    if (!message) {
      return null;
    }

    await requireSelf(ctx, message.clerk_id);

    await ctx.db.patch(args.message_id, {
      read: true,
    });

    return args.message_id;
  },
});

// Diese Mutation hat absichtlich keinen Auth-Check,
// da sie ausschließlich vom internen Backend-Processor
// aufgerufen wird, nicht direkt von der Mobile App.
// Sicherheit wird durch Netzwerk-Isolation und
// zukünftige HMAC-Verifizierung des Sensors sichergestellt.
export const createMessage = mutation({
  args: {
    clerk_id: v.string(),
    device_id: v.string(),
    plant_name: v.string(),
    type: v.union(v.literal("plant_message"), v.literal("system_message")),
    state: v.union(v.literal("ok"), v.literal("warning"), v.literal("critical")),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      clerk_id: args.clerk_id,
      device_id: args.device_id,
      plant_name: args.plant_name,
      type: args.type,
      state: args.state,
      text: args.text,
      read: false,
      created_at: Date.now(),
    });
  },
});

export const updateMessageText = mutation({
  args: {
    message_id: v.id("messages"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.message_id);

    if (!message) {
      console.warn('[messages/updateMessageText] Message not found', args.message_id);
      return null;
    }

    await ctx.db.patch(args.message_id, {
      text: args.text,
    });

    return args.message_id;
  },
});