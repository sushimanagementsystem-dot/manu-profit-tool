import { JobStatus } from '../generated/prisma/enums';

/** Allowed lifecycle transitions (docs/ARCHITECTURE.md §4, Release 1 subset). */
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['QUEUED', 'EXPIRED'],
  QUEUED: ['EXTRACTING', 'FAILED', 'EXPIRED'],
  EXTRACTING: ['NORMALIZING', 'FAILED', 'EXPIRED'],
  NORMALIZING: ['MATCHING', 'FAILED', 'EXPIRED'],
  MATCHING: ['CALCULATING', 'FAILED', 'EXPIRED'],
  CALCULATING: ['READY', 'FAILED', 'EXPIRED'],
  READY: ['CALCULATING', 'EXPIRED'],
  FAILED: ['QUEUED', 'EXPIRED'],
  EXPIRED: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses in which the backend is still working and the client should keep polling. */
export const ACTIVE_STATUSES: JobStatus[] = [
  'QUEUED',
  'EXTRACTING',
  'NORMALIZING',
  'MATCHING',
  'CALCULATING',
];

export type ProgressMessage = {
  level: 'info' | 'warning' | 'error';
  code: string;
  text: string;
  fileId?: string;
};

export type JobProgress = {
  stage: JobStatus;
  completedTasks: number;
  totalTasks: number;
  percent: number;
  messages: ProgressMessage[];
};

/** Rough progress per stage, so the bar moves even when a stage has no countable tasks. */
const STAGE_BASE: Partial<Record<JobStatus, [number, number]>> = {
  QUEUED: [0, 5],
  EXTRACTING: [5, 75],
  NORMALIZING: [75, 85],
  MATCHING: [85, 92],
  CALCULATING: [92, 99],
  READY: [100, 100],
};

export function stagePercent(stage: JobStatus, completed = 0, total = 0): number {
  const [start, end] = STAGE_BASE[stage] ?? [0, 0];
  if (total <= 0) return start;
  return Math.round(start + ((end - start) * completed) / total);
}
