/** Shapes returned by the Menu Profit API (docs/API_SPECIFICATION.md). */

export type JobStatus =
  | "DRAFT"
  | "QUEUED"
  | "EXTRACTING"
  | "NORMALIZING"
  | "MATCHING"
  | "CALCULATING"
  | "READY"
  | "FAILED"
  | "EXPIRED";

export type FileCategory = "MENU" | "INVOICE" | "POS";

export type Confidence =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "ESTIMATED"
  | "INCOMPLETE";

export type UploadLimits = {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxPdfPages: number;
  categories: Record<FileCategory, { maxFiles: number; accept: string[] }>;
};

export type CreatedJob = {
  jobId: string;
  accessToken: string;
  status: JobStatus;
  expiresAt: string;
  limits: UploadLimits;
};

export type UploadedFile = {
  id: string;
  category: FileCategory;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
  statusMessage: string | null;
};

export type ProgressMessage = {
  level: "info" | "warning" | "error";
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

export type JobStatusResponse = {
  jobId: string;
  status: JobStatus;
  progress: JobProgress;
  files: UploadedFile[];
  currentRevision: number;
  isActive: boolean;
  failure: { code: string; message: string } | null;
  expiresAt: string;
  rawFilesExpireAt: string | null;
};

export type Readiness = {
  ready: boolean;
  issues: { code: string; category?: string; message: string }[];
};

export type Metric = {
  value: string | null;
  confidence: Confidence;
  reasons: string[];
};

export type ResultItem = {
  menuItemId: string;
  name: string;
  category: string | null;
  grossPrice: string | null;
  netPrice: Metric;
  costPerPortion: Metric;
  /** Where the cost came from: the recipe, or a figure the client entered. */
  costSource: "RECIPE" | "MANUAL";
  gpPerPortion: Metric;
  gpPercent: Metric;
  unitsSold: string | null;
  netRevenue: Metric;
  theoreticalGp: Metric;
  matrixClass: "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG" | null;
  confidence: Confidence;
  reasons: string[];
};

export type ResultsResponse = {
  revision: number;
  currency: string;
  snapshotHash: string;
  summary: {
    netRevenue: string | null;
    unitsSold: string | null;
    theoreticalGp: string | null;
    realisedGp: string | null;
    gpPercent: string | null;
    itemsTotal: number;
    itemsCosted: number;
    revenueCoveredPercent: string | null;
  };
  items: ResultItem[];
  issues: {
    code: string;
    severity: "info" | "warning" | "critical";
    text: string;
  }[];
  pendingMatches: {
    matchId: string;
    posName: string;
    suggestedMenuItemName: string | null;
  }[];
  recommendations: {
    priority: number;
    kind: string;
    title: string;
    body: string;
    impactGp: string | null;
  }[];
};

export type ImpactPreview = {
  summary: {
    realisedGpBefore: string | null;
    realisedGpAfter: string | null;
    deltaGp: string | null;
    gpPercentAfter: string | null;
    itemsCostedBefore: number;
    itemsCostedAfter: number;
  };
  items: {
    menuItemId: string;
    name: string;
    gpPerPortionBefore: string | null;
    gpPerPortionAfter: string | null;
    gpPercentAfter: string | null;
    deltaGpContribution: string | null;
  }[];
};

/** A change to the analysis inputs; the backend validates and applies these (revisions API). */
export type Operation =
  | { op: "RENAME_MENU_ITEM"; menuItemId: string; name: string }
  | { op: "SET_UNITS_SOLD"; menuItemId: string; quantity: string }
  | { op: "SET_SELLING_PRICE"; menuItemId: string; grossPrice: string }
  | { op: "SET_ITEM_COST"; menuItemId: string; cost: string | null };

/** What the AI cost for one analysis. Only filled in when the server has SHOW_AI_COST on. */
export type AiUsagePart = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** US dollars; null when a model has no known price. */
  costUsd: string | null;
};

export type AiUsageResponse =
  | { enabled: false }
  | {
      enabled: true;
      extraction: AiUsagePart;
      chat: AiUsagePart;
      totalUsd: string | null;
      currency: "USD";
      note: string;
    };

export type ChatProposal = {
  revisionId: string;
  summary: string;
  status: string;
};

export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  proposal: ChatProposal | null;
};

export type ChatReply = {
  message: ChatMessage;
  proposal: (ChatProposal & { impact: ImpactPreview }) | null;
};

export type ExportView = {
  exportId: string;
  format: "XLSX";
  revision: number;
  status: string;
  sizeBytes: number | null;
  fileName: string;
  createdAt: string;
};
