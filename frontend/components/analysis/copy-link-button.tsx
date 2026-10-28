"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { analysisUrl } from "@/lib/api/job-session";

/**
 * Copies the secure link, the one that carries the access token. Icon only on a phone, where
 * the header has little room.
 */
export function CopyLinkButton({ jobId, token }: { jobId: string; token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(analysisUrl(jobId, token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link. Copy it from the address bar instead.");
    }
  }

  return (
    <Button variant="outline" onClick={() => void copy()} aria-label="Copy secure link" className="gap-2">
      {copied ? <Check className="text-brand" /> : <Link2 />}
      <span className="hidden sm:inline">{copied ? "Link copied" : "Copy secure link"}</span>
    </Button>
  );
}
