"use client";

import { useSyncExternalStore } from "react";

/**
 * Remembers a job's access token in the browser so the client can revisit their analysis.
 *
 * The token travels in the link's fragment (`/analysis/{id}#k=…`), which browsers never send
 * to a server — so it stays out of request logs and Referer headers. This module is the only
 * place that reads or writes it.
 */

const STORAGE_KEY = "menu-profit.jobs";
const FRAGMENT_KEY = "k";

type StoredJob = { token: string; expiresAt: string };
type Store = Record<string, StoredJob>;

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    // Private mode or blocked storage: the fragment is still enough for this visit.
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Nothing to do — losing the convenience of a remembered link is not an error.
  }
}

/** Drops jobs whose retention window has passed, so stale tokens don't pile up. */
function prune(store: Store): Store {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(store).filter(([, job]) => new Date(job.expiresAt).getTime() > now),
  );
}

export function rememberJob(jobId: string, token: string, expiresAt: string): void {
  const store = prune(readStore());
  store[jobId] = { token, expiresAt };
  writeStore(store);
}

export function forgetJob(jobId: string): void {
  const store = prune(readStore());
  delete store[jobId];
  writeStore(store);
}

/** The token from the URL fragment if present, otherwise the remembered one. */
export function resolveToken(jobId: string): string | null {
  const fromFragment = new URLSearchParams(window.location.hash.slice(1)).get(FRAGMENT_KEY);
  if (fromFragment) return fromFragment;
  return readStore()[jobId]?.token ?? null;
}

/**
 * Reads the token during render without a hydration mismatch: the server has no fragment and
 * no storage, so it renders the "still resolving" state and the client fills it in.
 */
export function useJobToken(jobId: string): { token: string | null; resolved: boolean } {
  const token = useSyncExternalStore(
    subscribeToNothing,
    () => resolveToken(jobId),
    () => null,
  );
  const resolved = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  return { token, resolved };
}

/** The token can only change by navigating, which remounts this tree. */
function subscribeToNothing(): () => void {
  return () => {};
}

export function analysisPath(jobId: string, token: string): string {
  return `/analysis/${jobId}#${FRAGMENT_KEY}=${token}`;
}

export function analysisUrl(jobId: string, token: string): string {
  return `${window.location.origin}${analysisPath(jobId, token)}`;
}
