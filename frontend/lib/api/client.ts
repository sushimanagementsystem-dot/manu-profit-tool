import type {
  ChatMessage,
  ChatReply,
  CreatedJob,
  ExportView,
  FileCategory,
  ImpactPreview,
  JobStatusResponse,
  Operation,
  Readiness,
  ResultsResponse,
  UploadedFile,
  UploadLimits,
} from "./types";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

/** An error carrying the API's problem+json detail, so the UI can show the server's wording. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: { path: string; message: string }[],
  ) {
    super(message);
  }

  /** True when the analysis is gone — its link has expired or it was deleted. */
  get isGone(): boolean {
    return this.code === "job_expired" || this.code === "job_not_found";
  }
}

type ProblemBody = {
  code?: string;
  title?: string;
  detail?: string;
  errors?: { path: string; message: string }[];
};

async function toApiError(response: Response): Promise<ApiError> {
  let body: ProblemBody = {};
  try {
    body = (await response.json()) as ProblemBody;
  } catch {
    // Non-JSON error (proxy, network appliance): fall back to the status text.
  }
  return new ApiError(
    response.status,
    body.code ?? "unknown",
    body.detail ?? body.title ?? response.statusText ?? "Something went wrong.",
    body.errors,
  );
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      0,
      "network",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  if (!response.ok) throw await toApiError(response);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/**
 * Uploads one file with progress. XHR rather than fetch, because fetch gives no upload
 * progress events — and a 15 MB invoice on a restaurant's connection needs a visible bar.
 */
export function uploadFile(
  jobId: string,
  token: string,
  category: FileCategory,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("category", category);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/jobs/${jobId}/files`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      let body: (ProblemBody & { file?: UploadedFile }) | null = null;
      try {
        body = JSON.parse(xhr.responseText) as ProblemBody & { file?: UploadedFile };
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.file) {
        resolve(body.file);
        return;
      }
      reject(
        new ApiError(
          xhr.status,
          body?.code ?? "unknown",
          body?.detail ?? body?.title ?? "The file could not be uploaded.",
        ),
      );
    });
    xhr.addEventListener("error", () =>
      reject(new ApiError(0, "network", "The upload failed. Check your connection.")),
    );
    xhr.addEventListener("abort", () => reject(new ApiError(0, "aborted", "Upload cancelled.")));
    signal?.addEventListener("abort", () => xhr.abort());

    xhr.send(form);
  });
}

export const api = {
  /** The upload rules without creating a job, so the slots can state them on page load. */
  uploadLimits: () => request<UploadLimits>("/upload-limits"),

  createJob: () => request<CreatedJob>("/jobs", { method: "POST", body: {} }),

  deleteFile: (jobId: string, token: string, fileId: string) =>
    request<void>(`/jobs/${jobId}/files/${fileId}`, { method: "DELETE", token }),

  readiness: (jobId: string, token: string) =>
    request<Readiness>(`/jobs/${jobId}/readiness`, { token }),

  submit: (
    jobId: string,
    token: string,
    assumptions: { vatRate?: string | null; vatRateDrink?: string | null },
  ) =>
    request<JobStatusResponse>(`/jobs/${jobId}/submit`, {
      method: "POST",
      token,
      body: { assumptions },
    }),

  status: (jobId: string, token: string) =>
    request<JobStatusResponse>(`/jobs/${jobId}`, { token }),

  retry: (jobId: string, token: string) =>
    request<JobStatusResponse>(`/jobs/${jobId}/retry`, { method: "POST", token }),

  deleteJob: (jobId: string, token: string) =>
    request<void>(`/jobs/${jobId}`, { method: "DELETE", token }),

  results: (jobId: string, token: string) =>
    request<ResultsResponse>(`/jobs/${jobId}/results`, { token }),

  chatHistory: (jobId: string, token: string) =>
    request<ChatMessage[]>(`/jobs/${jobId}/chat/messages`, { token }),

  sendChat: (jobId: string, token: string, content: string) =>
    request<ChatReply>(`/jobs/${jobId}/chat/messages`, {
      method: "POST",
      token,
      body: { content },
    }),

  approveRevision: (jobId: string, token: string, revisionId: string) =>
    request<{ revision: number; impact: ImpactPreview }>(
      `/jobs/${jobId}/revisions/${revisionId}/approve`,
      { method: "POST", token },
    ),

  /** Edits made directly in the results table: applied and recalculated in one step. */
  applyChanges: (jobId: string, token: string, operations: Operation[]) =>
    request<{ revision: number; impact: ImpactPreview }>(`/jobs/${jobId}/revisions/apply`, {
      method: "POST",
      token,
      body: { operations },
    }),

  rejectRevision: (jobId: string, token: string, revisionId: string) =>
    request<{ status: string }>(`/jobs/${jobId}/revisions/${revisionId}/reject`, {
      method: "POST",
      token,
    }),

  createExport: (jobId: string, token: string) =>
    request<ExportView>(`/jobs/${jobId}/exports`, { method: "POST", token, body: {} }),

  createDownloadLink: (jobId: string, token: string, exportId: string) =>
    request<{ url: string; expiresAt: string }>(
      `/jobs/${jobId}/exports/${exportId}/link`,
      { method: "POST", token },
    ),

  /** Absolute URL for a link the API returned as a path. */
  absoluteUrl: (path: string) => `${BASE_URL.replace(/\/api\/v1$/, "")}${path}`,
};
