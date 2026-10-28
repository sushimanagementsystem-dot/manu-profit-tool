"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";
import { forgetJob } from "@/lib/api/job-session";
import { formatTimeLeft } from "@/lib/format";

/** Retention: how long the analysis is kept, and the two-step "delete everything now". */
export function AnalysisFooter({
  jobId,
  token,
  expiresAt,
}: {
  jobId: string;
  token: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.deleteJob(jobId, token),
    onSuccess: () => {
      forgetJob(jobId);
      toast.success("Your files and analysis have been deleted.");
      router.push("/");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The analysis could not be deleted."),
  });

  return (
    <div className="flex w-full flex-col gap-3 border-t pt-4 text-sm">
      <p className="text-muted-foreground">
        This analysis and its files are deleted automatically{" "}
        <span className="font-medium text-foreground">{formatTimeLeft(expiresAt)}</span>. Anyone
        with the link can open it until then.
      </p>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="gap-1.5"
            >
              {remove.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Yes, delete everything
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            className="gap-1.5 text-muted-foreground"
          >
            <Trash2 className="size-3.5" />
            Delete now
          </Button>
        )}
      </div>
    </div>
  );
}
