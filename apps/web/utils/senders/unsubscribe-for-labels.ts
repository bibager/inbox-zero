import {
  ActionType,
  GroupItemType,
  NewsletterStatus,
} from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";

/**
 * When mail lands under one of the account's auto-unsubscribe labels,
 * unsubscribe the sender via its List-Unsubscribe header - but only when the
 * user put it there: moved by hand, or filed by a rule because the sender is
 * trained into it. A label the AI chose on its own never unsubscribes anyone.
 * Senders already unsubscribed are left alone.
 */
export async function unsubscribeForLabels({
  emailAccountId,
  labelIds,
  sender,
  messageId,
  provider,
  logger,
}: {
  emailAccountId: string;
  labelIds: string[];
  sender: string;
  messageId: string;
  provider: EmailProvider;
  logger: Logger;
}) {
  if (!labelIds.length) return;

  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { autoUnsubscribeLabelIds: true },
  });
  const watched = account?.autoUnsubscribeLabelIds ?? [];
  const hit = labelIds.filter((id) => watched.includes(id));
  if (!hit.length) return;

  const existing = await prisma.newsletter.findUnique({
    where: { email_emailAccountId: { email: sender, emailAccountId } },
    select: { status: true },
  });
  if (existing?.status === NewsletterStatus.UNSUBSCRIBED) return;

  const trained = await prisma.groupItem.findFirst({
    where: {
      type: GroupItemType.FROM,
      value: sender,
      exclude: false,
      group: {
        emailAccountId,
        rule: {
          actions: { some: { type: ActionType.LABEL, labelId: { in: hit } } },
        },
      },
    },
    select: { id: true },
  });
  if (!trained) {
    const appliedByRule = await prisma.executedAction.findFirst({
      where: {
        type: ActionType.LABEL,
        labelId: { in: hit },
        executedRule: { messageId, emailAccountId },
      },
      select: { id: true },
    });
    if (appliedByRule) {
      logger.info(
        "Label chosen by a rule for an untrained sender, not unsubscribing",
      );
      return;
    }
  }

  const message = await provider.getMessage(messageId).catch((error) => {
    logger.warn("Could not read message for auto-unsubscribe", {
      messageId,
      error,
    });
    return null;
  });
  const header = message?.headers["list-unsubscribe"];
  if (!header) {
    logger.info("No List-Unsubscribe header, skipping auto-unsubscribe");
    return;
  }

  const result = await unsubscribeSenderAndMark({
    emailAccountId,
    senderEmail: sender,
    listUnsubscribeHeader: header,
    logger,
  });

  logger.info("Auto-unsubscribe from label", {
    success: result.unsubscribe.success,
    reason: result.unsubscribe.reason,
  });
}
