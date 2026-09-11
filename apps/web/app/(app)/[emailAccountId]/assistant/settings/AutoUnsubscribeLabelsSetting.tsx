"use client";

import { useAction } from "next-safe-action/hooks";
import { useLabels } from "@/hooks/useLabels";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { setAutoUnsubscribeLabelsAction } from "@/utils/actions/rule";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

// Which labels, when applied to an email (by a rule or by hand), unsubscribe
// the sender via the message's List-Unsubscribe header.
export function AutoUnsubscribeLabelsSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { userLabels, isLoading: labelsLoading } = useLabels();

  const { execute, isExecuting } = useAction(
    setAutoUnsubscribeLabelsAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => mutate(),
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "There was an error",
      }),
    },
  );

  const selected = data?.autoUnsubscribeLabelIds ?? [];
  const names = userLabels
    .filter((l) => selected.includes(l.id))
    .map((l) => l.name);

  const toggle = (labelId: string, on: boolean) => {
    if (!data) return;
    const labelIds = on
      ? [...selected, labelId]
      : selected.filter((id) => id !== labelId);
    mutate({ ...data, autoUnsubscribeLabelIds: labelIds }, false);
    execute({ labelIds });
  };

  return (
    <SettingCard
      title={
        <div className="flex items-center gap-1.5">
          <span>Unsubscribe on label</span>
          <TooltipExplanation
            side="top"
            text="When an email gets one of these labels - filed by a rule or moved by you - the sender is unsubscribed using the email's List-Unsubscribe link. Senders without one are left alone."
          />
        </div>
      }
      description={
        names.length
          ? `Unsubscribing senders filed under: ${names.join(", ")}`
          : "Pick labels that should unsubscribe the sender."
      }
      right={
        <LoadingContent
          loading={isLoading || labelsLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isExecuting}>
                {selected.length
                  ? `${selected.length} selected`
                  : "Choose labels"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-80 overflow-y-auto"
            >
              {userLabels.map((label) => (
                <DropdownMenuCheckboxItem
                  key={label.id}
                  checked={selected.includes(label.id)}
                  onCheckedChange={(on) => toggle(label.id, on === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {label.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </LoadingContent>
      }
    />
  );
}
