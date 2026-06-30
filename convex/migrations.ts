import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const notificationChannelValue = v.union(v.literal("push"), v.literal("telegram"), v.literal("call"));

type LegacyUser = {
  _id: Id<"users">;
  notification_push?: boolean;
  notification_telegram?: boolean;
  notification_planty_messenger?: boolean;
  notification_call?: boolean;
};

type SanitizedUserDocument = Record<string, unknown> & {
  _id?: unknown;
  _creationTime?: unknown;
  notification_push?: unknown;
  notification_telegram?: unknown;
  notification_planty_messenger?: unknown;
  notification_call?: unknown;
};

const buildNotificationRules = (channels: Array<"push" | "telegram" | "call">) => ({
  ok: channels,
  warning: channels,
  critical: channels,
});

export const migrateLegacyNotificationRules = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const users = (await ctx.db.query("users").collect()) as LegacyUser[];
    const dryRun = args.dryRun ?? false;

    let inspected = 0;
    let migrated = 0;

    for (const user of users) {
      const hasLegacyNotificationFields =
        typeof user.notification_push === "boolean" ||
        typeof user.notification_telegram === "boolean" ||
        typeof user.notification_planty_messenger === "boolean" ||
        typeof user.notification_call === "boolean";

      if (!hasLegacyNotificationFields) {
        continue;
      }

      inspected += 1;

      const enabledChannels = new Set<"push" | "telegram" | "call">();

      if (user.notification_push) {
        enabledChannels.add("push");
      }

      if (user.notification_planty_messenger) {
        enabledChannels.add("push");
      }

      if (user.notification_telegram) {
        enabledChannels.add("telegram");
      }

      if (user.notification_call) {
        enabledChannels.add("call");
      }

      const notificationRules = buildNotificationRules([...enabledChannels]);

      if (!dryRun) {
        const sanitizedFields = { ...(user as LegacyUser & Record<string, unknown>) } as SanitizedUserDocument

        delete sanitizedFields._id
        delete sanitizedFields._creationTime
        delete sanitizedFields.notification_push
        delete sanitizedFields.notification_telegram
        delete sanitizedFields.notification_planty_messenger
        delete sanitizedFields.notification_call

        sanitizedFields.notification_rules = notificationRules

        await ctx.db.replace(user._id, sanitizedFields as never)
      }

      migrated += 1;
    }

    return {
      inspected,
      migrated,
      dryRun,
    };
  },
});
