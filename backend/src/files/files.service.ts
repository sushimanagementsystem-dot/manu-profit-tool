import { Injectable } from '@nestjs/common';

import { sha256Hex } from '../common/crypto';
import { ProblemException, Problems } from '../common/problem';
import { FileCategory } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { countPdfPages, sniffFile, zipUncompressedSize } from './file-sniff';
import { MIME_BY_TYPE, UPLOAD_LIMITS } from './upload-limits';

export type UploadInput = { buffer: Buffer; originalName: string };

export type FileView = {
  id: string;
  category: FileCategory;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
  statusMessage: string | null;
};

const FILE_VIEW_SELECT = {
  id: true,
  category: true,
  originalName: true,
  sizeBytes: true,
  mimeType: true,
  status: true,
  statusMessage: true,
} as const;

const REJECTION_MESSAGES = {
  legacy_xls: 'Old .xls files are not supported. Please re-save it as .xlsx or .csv and upload again.',
  heic: 'HEIC photos are not supported. Please export the photo as JPG and upload again.',
  unknown: 'This file type is not supported.',
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(jobId: string): Promise<FileView[]> {
    return this.prisma.uploadedFile.findMany({
      where: { jobId, status: { not: 'DELETED' } },
      select: FILE_VIEW_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async upload(jobId: string, category: FileCategory, input: UploadInput): Promise<FileView> {
    await this.assertDraft(jobId);
    const { buffer } = input;
    const originalName = sanitizeFileName(input.originalName);
    const rule = UPLOAD_LIMITS.categories[category];

    if (buffer.length === 0) throw Problems.validation(`"${originalName}" is empty.`);
    if (buffer.length > UPLOAD_LIMITS.maxFileBytes) {
      throw new ProblemException(413, 'payload_too_large', `"${originalName}" is larger than 15 MB.`);
    }

    const sniffed = sniffFile(buffer, originalName);
    if (!sniffed.ok) {
      throw new ProblemException(415, 'unsupported_media_type', REJECTION_MESSAGES[sniffed.reason]);
    }
    if (!(rule.types as string[]).includes(sniffed.type)) {
      throw new ProblemException(
        415,
        'unsupported_media_type',
        `"${originalName}" is a ${sniffed.type.toUpperCase()} file, which is not accepted for this category.`,
      );
    }

    const pageCount = sniffed.type === 'pdf' ? countPdfPages(buffer) : null;
    if (pageCount !== null && pageCount > UPLOAD_LIMITS.maxPdfPages) {
      throw Problems.validation(
        `"${originalName}" has ${pageCount} pages; the limit is ${UPLOAD_LIMITS.maxPdfPages}.`,
      );
    }
    if (
      sniffed.type === 'xlsx' &&
      zipUncompressedSize(buffer) > UPLOAD_LIMITS.maxXlsxUncompressedBytes
    ) {
      throw Problems.validation(`"${originalName}" is too large to process once unpacked.`);
    }

    const existing = await this.prisma.uploadedFile.findMany({
      where: { jobId, status: { not: 'DELETED' } },
      select: { category: true, sizeBytes: true, sha256: true },
    });
    const sha256 = sha256Hex(buffer);
    if (existing.some((file) => file.sha256 === sha256)) {
      throw new ProblemException(422, 'duplicate_file', `"${originalName}" was already uploaded.`);
    }
    if (existing.filter((file) => file.category === category).length >= rule.maxFiles) {
      throw new ProblemException(
        422,
        'category_limit',
        `You can upload at most ${rule.maxFiles} files in this category.`,
      );
    }
    const totalBytes = existing.reduce((total, file) => total + file.sizeBytes, buffer.length);
    if (totalBytes > UPLOAD_LIMITS.maxTotalBytes) {
      throw new ProblemException(413, 'payload_too_large', 'The total upload size limit (150 MB) was reached.');
    }

    const storageKey = await this.storage.put(jobId, 'uploads', buffer);
    const file = await this.prisma.uploadedFile.create({
      data: {
        jobId,
        category,
        originalName,
        mimeType: MIME_BY_TYPE[sniffed.type],
        sizeBytes: buffer.length,
        sha256,
        storageKey,
        pageCount,
      },
      select: FILE_VIEW_SELECT,
    });
    await this.prisma.jobEvent.create({
      data: { jobId, type: 'FILE_UPLOADED', meta: { fileId: file.id, category } },
    });
    return file;
  }

  async remove(jobId: string, fileId: string): Promise<void> {
    await this.assertDraft(jobId);
    const file = await this.prisma.uploadedFile.findFirst({ where: { id: fileId, jobId } });
    if (!file) throw Problems.notFound('File not found.');
    await this.storage.delete(file.storageKey);
    await this.prisma.uploadedFile.delete({ where: { id: file.id } });
    await this.prisma.jobEvent.create({
      data: { jobId, type: 'FILE_REMOVED', meta: { fileId } },
    });
  }

  private async assertDraft(jobId: string): Promise<void> {
    const job = await this.prisma.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { status: true },
    });
    if (job.status !== 'DRAFT') {
      throw Problems.invalidState('Files can only be changed before the analysis is submitted.');
    }
  }
}

/** Display-only name: no path parts, no control characters, bounded length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'file').slice(0, 200);
}
