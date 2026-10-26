import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import { Problems } from '../common/problem';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { FileCategory } from '../generated/prisma/enums';
import { CurrentJob, JobAccessGuard, type JobContext } from '../jobs/job-access.guard';
import { FilesService } from './files.service';
import { UPLOAD_LIMITS } from './upload-limits';

const uploadBodySchema = z.object({ category: z.enum(FileCategory) });

@Controller('jobs/:jobId/files')
@UseGuards(JobAccessGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** One file per request, so the browser can show per-file progress and retry individually. */
  @Post()
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.maxFileBytes + 1, files: 1 } }),
  )
  async upload(
    @CurrentJob() job: JobContext,
    @Body(new ZodBodyPipe(uploadBodySchema)) body: z.infer<typeof uploadBodySchema>,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw Problems.validation('Attach the file in the "file" form field.');
    const created = await this.files.upload(job.id, body.category, {
      buffer: file.buffer,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    });
    return { file: created };
  }

  @Delete(':fileId')
  @HttpCode(204)
  async remove(
    @CurrentJob() job: JobContext,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ): Promise<void> {
    await this.files.remove(job.id, fileId);
  }
}
