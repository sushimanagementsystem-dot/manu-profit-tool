import { Injectable, Logger } from '@nestjs/common';

import { hmacHex, signToken } from '../common/crypto';
import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';
import type { FileCategory } from '../generated/prisma/enums';
import { EXTRACTION_SCHEMA_VERSION } from './extraction.schemas';

/** How long n8n may use a file download URL. */
const FILE_URL_TTL_SECONDS = 10 * 60;
const DISPATCH_TIMEOUT_MS = 15_000;

export type ExtractionTask = {
  jobId: string;
  taskId: string;
  attempt: number;
  file: { id: string; category: FileCategory; mimeType: string; pageCount: number | null };
  currency: string;
};

export type FileUrlClaims = { fileId: string; taskId: string; exp: number };

/**
 * Sends one extraction task to the n8n MP-01 workflow (docs/N8N_WORKFLOWS.md).
 * Requests are signed with HMAC; n8n downloads the file through a short-lived signed URL
 * and reports back to /internal/n8n/callbacks.
 */
@Injectable()
export class N8nClient {
  private readonly logger = new Logger(N8nClient.name);

  constructor(@InjectConfig() private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return Boolean(this.config.N8N_BASE_URL && this.config.N8N_INBOUND_KEY);
  }

  async dispatchExtraction(task: ExtractionTask): Promise<void> {
    if (!this.isConfigured) throw new Error('n8n is not configured.');
    const apiBase = `${this.config.PUBLIC_API_BASE_URL}/api/v1`;
    const fileToken = signToken(this.config.N8N_FILE_URL_SECRET, {
      fileId: task.file.id,
      taskId: task.taskId,
      exp: Math.floor(Date.now() / 1000) + FILE_URL_TTL_SECONDS,
    } satisfies FileUrlClaims);

    const body = JSON.stringify({
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      jobId: task.jobId,
      taskId: task.taskId,
      attempt: task.attempt,
      file: {
        id: task.file.id,
        category: task.file.category,
        mimeType: task.file.mimeType,
        pageCount: task.file.pageCount,
        downloadUrl: `${apiBase}/internal/files/${fileToken}`,
      },
      hints: { currency: task.currency },
      model: this.config.EXTRACTION_MODEL,
      callbackUrl: `${apiBase}/internal/n8n/callbacks`,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const response = await fetch(`${this.config.N8N_BASE_URL}${this.config.N8N_EXTRACT_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mp-key': this.config.N8N_INBOUND_KEY as string,
        'x-mp-timestamp': timestamp,
        'x-mp-signature': `sha256=${hmacHex(this.config.N8N_REQUEST_SECRET, `${timestamp}.${body}`)}`,
      },
      body,
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      this.logger.warn({ taskId: task.taskId, status: response.status }, 'n8n rejected a task');
      throw new Error(`n8n responded with HTTP ${response.status}`);
    }
  }
}
