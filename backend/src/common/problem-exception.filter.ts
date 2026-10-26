import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ProblemCode, ProblemException } from './problem';

const STATUS_CODES: Partial<Record<number, ProblemCode>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/** Renders every error as application/problem+json without leaking internals. */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const problem = this.toProblem(exception);
    if (problem.getStatus() >= 500) {
      // Log the stack, never the request body (it can contain restaurant data).
      this.logger.error(
        { requestId: request.id, route: request.route?.path as string | undefined },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (problem.getStatus() === 429) response.setHeader('Retry-After', '60');

    response
      .status(problem.getStatus())
      .type('application/problem+json')
      .json(problem.toBody(request.id));
  }

  private toProblem(exception: unknown): ProblemException {
    if (exception instanceof ProblemException) return exception;
    if (exception instanceof ThrottlerException) return new ProblemException(429, 'rate_limited');
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODES[status] ?? (status >= 500 ? 'internal' : 'bad_request');
      return new ProblemException(status, code, status < 500 ? exception.message : undefined);
    }
    return new ProblemException(HttpStatus.INTERNAL_SERVER_ERROR, 'internal');
  }
}
