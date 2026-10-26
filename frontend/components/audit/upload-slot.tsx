"use client";

import { AlertCircle, CloudUpload, Info, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UploadLimits } from "@/lib/api/types";
import { formatBytes } from "@/lib/format";
import { describeAccepted, type SlotConfig } from "@/lib/audit/slots";
import { cn } from "@/lib/utils";

/** One file being uploaded or already stored, as the slot shows it. */
export type SlotFile = {
  key: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function UploadSlot({
  slot,
  icon: Icon,
  files,
  limits,
  disabled,
  error,
  onAdd,
  onRemove,
}: {
  slot: SlotConfig;
  icon: typeof CloudUpload;
  files: SlotFile[];
  limits: UploadLimits | null;
  disabled: boolean;
  error?: string;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxFiles = limits?.categories[slot.category].maxFiles ?? 1;
  const atLimit = files.filter((file) => file.status !== "error").length >= maxFiles;

  return (
    <div className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          slot.color.badge,
        )}
      >
        {slot.step}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              slot.color.icon,
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 text-left">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {slot.label}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="cursor-help text-muted-foreground"
                    aria-label={`What to include in ${slot.label}`}
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{slot.requirements}</TooltipContent>
              </Tooltip>
            </p>
            <p className="text-sm text-muted-foreground">{slot.description}</p>
          </div>
        </div>

        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {files.map((file) => (
              <li
                key={file.key}
                className={cn(
                  "flex flex-col gap-1 rounded-md border px-3 py-2 text-sm",
                  file.status === "error"
                    ? "border-destructive/30 bg-destructive/5"
                    : "bg-muted/30",
                )}
              >
                <div className="flex items-center gap-2">
                  {file.status === "uploading" && (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  {file.status === "error" && (
                    <AlertCircle className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-left font-medium">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(file.key)}
                    disabled={disabled}
                    className="shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {file.status === "uploading" && (
                  <div
                    className="h-1 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={file.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${file.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
                {file.status === "error" && file.error && (
                  <p className="text-left text-xs text-destructive">{file.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {!atLimit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (!disabled && event.dataTransfer.files.length) {
                onAdd(Array.from(event.dataTransfer.files));
              }
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              slot.color.dropzone,
              dragOver && "ring-2 ring-primary/40",
            )}
          >
            <CloudUpload className="size-5 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-semibold">Click to upload</span> or drag and drop
              {files.length > 0 ? " more" : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {describeAccepted(slot.category, limits)}
            </span>
          </button>
        )}

        {error && <p className="text-left text-sm text-destructive">{error}</p>}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={limits?.categories[slot.category].accept.join(",")}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onAdd(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
