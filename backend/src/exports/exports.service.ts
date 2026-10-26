import { Injectable } from '@nestjs/common';

import { sha256Hex, signToken, verifyToken } from '../common/crypto';
import { Problems } from '../common/problem';
import { SnapshotService } from '../costing/snapshot.service';
import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { RevisionsService } from '../revisions/revisions.service';
import { StorageService } from '../storage/storage.service';
import { buildWorkbook } from './workbook.builder';

const DOWNLOAD_TTL_SECONDS = 5 * 60;

type DownloadClaims = { exportId: string; jobId: string; nonce: string; exp: number };

export type ExportView = {
  exportId: string;
  format: 'XLSX';
  revision: number;
  status: string;
  sizeBytes: number | null;
  fileName: string;
  createdAt: Date;
};

/**
 * Generates the client's Excel file from a stored result snapshot and hands it out through
 * single-use, short-lived signed links. One export per (job, revision), so a download always
 * matches the figures the client confirmed.
 */
@Injectable()
export class ExportsService {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly snapshots: SnapshotService,
    private readonly revisions: RevisionsService,
  ) {}

  async list(jobId: string): Promise<ExportView[]> {
    const exports = await this.prisma.reportExport.findMany({
      where: { jobId },
      orderBy: { revisionNumber: 'desc' },
    });
    return exports.map((report) => this.toView(report));
  }

  /** Returns the existing export for this revision, or builds it. */
  async create(jobId: string, revision?: number): Promise<ExportView> {
    const snapshot = await this.snapshots.get(jobId, revision);
    const existing = await this.prisma.reportExport.findUnique({
      where: { jobId_revisionNumber_format: { jobId, revisionNumber: snapshot.revision, format: 'XLSX' } },
    });
    if (existing?.status === 'READY' && existing.snapshotHash === snapshot.payloadHash) {
      return this.toView(existing);
    }

    const buffer = await buildWorkbook(snapshot.payload, await this.revisions.history(jobId), new Date());
    if (existing?.storageKey) await this.storage.delete(existing.storageKey);
    const storageKey = await this.storage.put(jobId, 'exports', buffer);

    const data = {
      status: 'READY' as const,
      storageKey,
      sizeBytes: buffer.byteLength,
      sha256: sha256Hex(buffer),
      snapshotHash: snapshot.payloadHash,
    };
    const report = await this.prisma.reportExport.upsert({
      where: { jobId_revisionNumber_format: { jobId, revisionNumber: snapshot.revision, format: 'XLSX' } },
      create: { jobId, revisionNumber: snapshot.revision, format: 'XLSX', ...data },
      update: { ...data, downloadedTokens: [] },
    });
    await this.prisma.jobEvent.create({
      data: { jobId, type: 'EXPORT_CREATED', meta: { revision: snapshot.revision, format: 'XLSX' } },
    });
    return this.toView(report);
  }

  /** A one-time link; the token is bound to this export and expires in five minutes. */
  async createLink(jobId: string, exportId: string): Promise<{ url: string; expiresAt: Date }> {
    const report = await this.prisma.reportExport.findFirst({ where: { id: exportId, jobId } });
    if (!report || report.status !== 'READY') throw Problems.notFound('That download is not available.');

    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS;
    const token = signToken(this.config.DOWNLOAD_TOKEN_SECRET, {
      exportId: report.id,
      jobId,
      nonce: sha256Hex(`${report.id}:${Date.now()}:${Math.random()}`).slice(0, 16),
      exp,
    } satisfies DownloadClaims);
    return { url: `/api/v1/downloads/${token}`, expiresAt: new Date(exp * 1000) };
  }

  /** Validates a download token, marks it used, and returns the file. */
  async resolveDownload(token: string): Promise<{ fileName: string; buffer: Buffer }> {
    const claims = verifyToken<DownloadClaims>(this.config.DOWNLOAD_TOKEN_SECRET, token);
    if (!claims) throw Problems.notFound('This download link has expired.');

    const report = await this.prisma.reportExport.findFirst({
      where: { id: claims.exportId, jobId: claims.jobId, status: 'READY' },
    });
    if (!report?.storageKey) throw Problems.notFound('This download is no longer available.');

    const used = (report.downloadedTokens as string[]) ?? [];
    if (used.includes(claims.nonce)) throw Problems.notFound('This download link was already used.');
    await this.prisma.reportExport.update({
      where: { id: report.id },
      data: { downloadedTokens: [...used.slice(-20), claims.nonce] },
    });
    await this.prisma.jobEvent.create({
      data: { jobId: claims.jobId, type: 'EXPORT_DOWNLOADED', meta: { exportId: report.id } },
    });

    return {
      fileName: this.fileName(report.revisionNumber),
      buffer: await this.storage.read(report.storageKey),
    };
  }

  private toView(report: {
    id: string;
    revisionNumber: number;
    status: string;
    sizeBytes: number | null;
    createdAt: Date;
  }): ExportView {
    return {
      exportId: report.id,
      format: 'XLSX',
      revision: report.revisionNumber,
      status: report.status,
      sizeBytes: report.sizeBytes,
      fileName: this.fileName(report.revisionNumber),
      createdAt: report.createdAt,
    };
  }

  private fileName(revision: number): string {
    return `menu-profit-analysis-v${revision}.xlsx`;
  }
}
