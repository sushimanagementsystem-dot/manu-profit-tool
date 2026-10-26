import { HttpException } from '@nestjs/common';

/** Stable, machine-readable error codes (docs/API_SPECIFICATION.md → Conventions). */
export type ProblemCode =
  | 'bad_request'
  | 'validation_failed'
  | 'job_not_found'
  | 'job_expired'
  | 'not_found'
  | 'invalid_state'
  | 'revision_conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'duplicate_file'
  | 'category_limit'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'ai_unavailable'
  | 'internal';

export type ProblemFieldError = { path: string; code: string; message: string };

export type ProblemBody = {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  errors?: ProblemFieldError[];
  requestId?: string;
};

const TITLES: Record<ProblemCode, string> = {
  bad_request: 'Bad request',
  validation_failed: 'Validation failed',
  job_not_found: 'Analysis not found',
  job_expired: 'Analysis expired',
  not_found: 'Not found',
  invalid_state: 'Action not allowed in the current state',
  revision_conflict: 'The analysis changed in the meantime',
  payload_too_large: 'File too large',
  unsupported_media_type: 'Unsupported file type',
  duplicate_file: 'Duplicate file',
  category_limit: 'Too many files',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  rate_limited: 'Too many requests',
  ai_unavailable: 'AI service unavailable',
  internal: 'Internal error',
};

/** An error that is rendered as RFC 9457 problem+json by ProblemExceptionFilter. */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly code: ProblemCode,
    readonly detail?: string,
    readonly errors?: ProblemFieldError[],
  ) {
    super({ code, detail }, status);
  }

  toBody(requestId?: string): ProblemBody {
    return {
      type: `https://menuprofit.app/errors/${this.code}`,
      title: TITLES[this.code],
      status: this.getStatus(),
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.errors?.length ? { errors: this.errors } : {}),
      ...(requestId ? { requestId } : {}),
    };
  }
}

export const Problems = {
  jobNotFound: () => new ProblemException(404, 'job_not_found'),
  jobExpired: () =>
    new ProblemException(410, 'job_expired', 'This analysis has expired and its data was deleted.'),
  notFound: (detail?: string) => new ProblemException(404, 'not_found', detail),
  invalidState: (detail: string) => new ProblemException(409, 'invalid_state', detail),
  validation: (detail: string, errors?: ProblemFieldError[]) =>
    new ProblemException(422, 'validation_failed', detail, errors),
  badRequest: (detail: string) => new ProblemException(400, 'bad_request', detail),
  unauthorized: () => new ProblemException(401, 'unauthorized'),
  forbidden: () => new ProblemException(403, 'forbidden'),
  aiUnavailable: (detail: string) => new ProblemException(503, 'ai_unavailable', detail),
};
