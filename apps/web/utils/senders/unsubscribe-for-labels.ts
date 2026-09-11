import { NewsletterStatus } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";

/**
 * When mail lands under one of the account's auto-unsubscribe labels (filed
 * by a rule or moved by the user), unsubscribe the sender via its
 * List-Unsubscribe header. Senders already unsubscribed are left alone.
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
  if (!labelIds.some((id) => watched.includes(id))) return;

  const existing = await prisma.newsletter.findUnique({
    where: { email_emailAccountId: { email: sender, emailAccountId } },
    select: { status: true },
  });
  if (existing?.status === NewsletterStatus.UNSUBSCRIBED) return;

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
