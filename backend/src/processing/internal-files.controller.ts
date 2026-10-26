import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { verifyToken } from '../common/crypto';
import { Problems } from '../common/problem';
import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';
import type { FileUrlClaims } from '../extraction/n8n.client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Serves one uploaded file to the n8n extraction workflow. Access comes from a signed,
 * short-lived token bound to the file and its task, and only while that task is dispatched —
 * so the URL stops working as soon as extraction finishes or the token expires.
 */
@Controller('internal/files')
export class InternalFilesController {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const claims = verifyToken<FileUrlClaims>(this.config.N8N_FILE_URL_SECRET, token);
    if (!claims) throw Problems.forbidden();

    const task = await this.prisma.processingTask.findUnique({
      where: { id: claims.taskId },
      select: { status: true, fileId: true },
    });
    if (!task || task.status !== 'DISPATCHED' || task.fileId !== claims.fileId) throw Problems.forbidden();

    const file = await this.prisma.uploadedFile.findUnique({ where: { id: claims.fileId } });
    if (!file || file.deletedAt) throw Problems.notFound('File no longer available.');

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.sizeBytes);
    response.setHeader('Cache-Control', 'no-store');
    this.storage.stream(file.storageKey).pipe(response);
  }
}
