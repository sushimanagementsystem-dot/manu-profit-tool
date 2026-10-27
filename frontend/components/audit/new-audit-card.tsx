"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Loader2,
  Lock,
  Receipt,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { UploadSlot, type SlotFile } from "@/components/audit/upload-slot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, api, uploadFile } from "@/lib/api/client";
import { analysisPath, rememberJob } from "@/lib/api/job-session";
import type { CreatedJob, FileCategory, UploadLimits } from "@/lib/api/types";
import { preCheckFile, SLOTS } from "@/lib/audit/slots";

const ICONS = { MENU: ReceiptText, INVOICE: Receipt, POS: BarChart3 };

type SlotState = Record<FileCategory, SlotFile[]>;

const emptySlots = (): SlotState => ({ MENU: [], INVOICE: [], POS: [] });

/** Local key → the file id the server assigned, so Remove can delete the right file. */
type UploadRecord = { fileId?: string; controller: AbortController };

export function NewAuditCard() {
  const router = useRouter();
  const [files, setFiles] = useState<SlotState>(emptySlots);
  const [slotErrors, setSlotErrors] = useState<Partial<Record<FileCategory, string>>>({});
  const [limits, setLimits] = useState<UploadLimits | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const job = useRef<CreatedJob | null>(null);
  const creating = useRef<Promise<CreatedJob> | null>(null);
  const uploads = useRef(new Map<string, UploadRecord>());

  /**
   * The rules are fetched on their own, so every slot can state what it accepts before
   * a file is picked — the draft job that also carries them does not exist yet.
   */
  useEffect(() => {
    let cancelled = false;
    api
      .uploadLimits()
      .then((fetched) => {
        if (!cancelled) setLimits(fetched);
      })
      .catch(() => {
        // Not fatal: the slot keeps its waiting label and the server still enforces the rules.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The draft job is created on the first file, not on page load: an abandoned page
   * should not leave an empty job behind. Concurrent first uploads share one request.
   */
  const ensureJob = useCallback(async (): Promise<CreatedJob> => {
    if (job.current) return job.current;
    creating.current ??= api.createJob().then((created) => {
      job.current = created;
      setLimits(created.limits);
      rememberJob(created.jobId, created.accessToken, created.expiresAt);
      return created;
    });
    try {
      return await creating.current;
    } catch (error) {
      creating.current = null;
      throw error;
    }
  }, []);

  const updateFile = useCallback(
    (category: FileCategory, key: string, patch: Partial<SlotFile>) => {
      setFiles((current) => ({
        ...current,
        [category]: current[category].map((file) =>
          file.key === key ? { ...file, ...patch } : file,
        ),
      }));
    },
    [],
  );

  async function addFiles(category: FileCategory, incoming: File[]) {
    setSlotErrors((current) => ({ ...current, [category]: undefined }));

    let created: CreatedJob;
    try {
      created = await ensureJob();
    } catch (error) {
      setSlotErrors((current) => ({
        ...current,
        [category]: error instanceof ApiError ? error.message : "Could not start the upload.",
      }));
      return;
    }

    const accepted = incoming.filter((file) => {
      const problem = preCheckFile(category, file, created.limits);
      if (problem) setSlotErrors((current) => ({ ...current, [category]: problem }));
      return !problem;
    });

    for (const file of accepted) {
      const key = `${file.name}-${file.size}-${crypto.randomUUID()}`;
      const controller = new AbortController();
      uploads.current.set(key, { controller });

      setFiles((current) => ({
        ...current,
        [category]: [
          ...current[category],
          { key, name: file.name, sizeBytes: file.size, progress: 0, status: "uploading" },
        ],
      }));

      try {
        const uploaded = await uploadFile(
          created.jobId,
          created.accessToken,
          category,
          file,
          (percent) => updateFile(category, key, { progress: percent }),
          controller.signal,
        );
        uploads.current.set(key, { fileId: uploaded.id, controller });
        updateFile(category, key, { status: "done", progress: 100 });
      } catch (error) {
        if (error instanceof ApiError && error.code === "aborted") continue;
        updateFile(category, key, {
          status: "error",
          error: error instanceof ApiError ? error.message : "The upload failed.",
        });
      }
    }
  }

  async function removeFile(category: FileCategory, key: string) {
    const record = uploads.current.get(key);
    record?.controller.abort();
    uploads.current.delete(key);
    setFiles((current) => ({
      ...current,
      [category]: current[category].filter((file) => file.key !== key),
    }));

    if (record?.fileId && job.current) {
      try {
        await api.deleteFile(job.current.jobId, job.current.accessToken, record.fileId);
      } catch {
        // The file stays on the server but out of the UI; submit-time readiness still rules.
        toast.error("The file was removed here, but the server may still have it.");
      }
    }
  }

  async function startAudit() {
    const current = job.current;
    if (!current) {
      setSlotErrors({ MENU: "Upload your files first." });
      return;
    }
    setSubmitting(true);
    try {
      const readiness = await api.readiness(current.jobId, current.accessToken);
      if (!readiness.ready) {
        const next: Partial<Record<FileCategory, string>> = {};
        for (const issue of readiness.issues) {
          if (issue.category) next[issue.category as FileCategory] = issue.message;
        }
        setSlotErrors(next);
        return;
      }
      await api.submit(current.jobId, current.accessToken, {});
      router.push(analysisPath(current.jobId, current.accessToken));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "The analysis could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const uploading = SLOTS.some((slot) =>
    files[slot.category].some((file) => file.status === "uploading"),
  );

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardContent className="flex flex-col gap-6">
          {SLOTS.map((slot) => (
            <UploadSlot
              key={slot.category}
              slot={slot}
              icon={ICONS[slot.category]}
              files={files[slot.category]}
              limits={limits}
              disabled={submitting}
              error={slotErrors[slot.category]}
              onAdd={(incoming) => void addFiles(slot.category, incoming)}
              onRemove={(key) => void removeFile(slot.category, key)}
            />
          ))}

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={submitting || uploading}
              onClick={() => void startAudit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Starting…
                </>
              ) : uploading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Uploading files…
                </>
              ) : (
                <>
                  <Sparkles />
                  Start Audit
                  <ArrowRight />
                </>
              )}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              Your files are used only for this analysis and deleted automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
