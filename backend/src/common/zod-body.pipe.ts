import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { Problems } from './problem';

/** Validates a request body against a zod schema and returns the parsed value. */
export class ZodBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw Problems.validation(
      'The request body is invalid.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(body)',
        code: issue.code,
        message: issue.message,
      })),
    );
  }
}
