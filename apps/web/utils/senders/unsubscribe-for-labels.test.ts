import { vi, describe, it, expect, beforeEach } from "vitest";
import { unsubscribeForLabels } from "./unsubscribe-for-labels";
import { NewsletterStatus } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import prisma from "@/utils/prisma";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: { findUnique: vi.fn() },
    newsletter: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: vi.fn().mockResolvedValue({
    unsubscribe: { attempted: true, success: true },
  }),
}));

describe("unsubscribeForLabels", () => {
  const getMessage = vi.fn();
  const provider = { getMessage } as unknown as EmailProvider;
  const args = {
    emailAccountId: "email-account-id",
    labelIds: ["Label_blackhole"],
    sender: "news@example.com",
    messageId: "123",
    provider,
    logger,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      autoUnsubscribeLabelIds: ["Label_blackhole"],
    } as any);
    vi.mocked(prisma.newsletter.findUnique).mockResolvedValue(null);
    getMessage.mockResolvedValue({
      headers: { "list-unsubscribe": "<https://example.com/u>" },
    });
  });

  it("unsubscribes using the message's List-Unsubscribe header", async () => {
    await unsubscribeForLabels(args);

    expect(unsubscribeSenderAndMark).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        senderEmail: "news@example.com",
        listUnsubscribeHeader: "<https://example.com/u>",
      }),
    );
  });

  it("ignores labels that are not configured", async () => {
    await unsubscribeForLabels({ ...args, labelIds: ["Label_other"] });

    expect(getMessage).not.toHaveBeenCalled();
    expect(unsubscribeSenderAndMark).not.toHaveBeenCalled();
  });

  it("skips senders already unsubscribed", async () => {
    vi.mocked(prisma.newsletter.findUnique).mockResolvedValue({
      status: NewsletterStatus.UNSUBSCRIBED,
    } as any);

    await unsubscribeForLabels(args);

    expect(getMessage).not.toHaveBeenCalled();
    expect(unsubscribeSenderAndMark).not.toHaveBeenCalled();
  });

  it("does nothing without a List-Unsubscribe header", async () => {
    getMessage.mockResolvedValue({ headers: {} });

    await unsubscribeForLabels(args);

    expect(unsubscribeSenderAndMark).not.toHaveBeenCalled();
  });

  it("does nothing when the message cannot be read", async () => {
    getMessage.mockRejectedValue(new Error("gone"));

    await unsubscribeForLabels(args);

    expect(unsubscribeSenderAndMark).not.toHaveBeenCalled();
  });
});
