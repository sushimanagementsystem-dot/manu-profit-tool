import { Injectable } from '@nestjs/common';

import { sha256Hex } from '../common/crypto';
import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { CALC_VERSION, computeResults, type Issue } from './engine';
import { loadEngineInput, type Db } from './engine-input.loader';
import {
  serializeResult,
  type PendingMatchJson,
  type RecipeLineJson,
  type SnapshotPayload,
  type SupplierPriceJson,
} from './snapshot.serializer';

export type StoredSnapshot = { revision: number; payload: SnapshotPayload; payloadHash: string };

/** Runs the calculation engine for a job and stores the result as the snapshot of a revision. */
@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /** Computes results from the current data without storing them (used for previews). */
  async compute(db: Db, jobId: string, revision: number): Promise<SnapshotPayload> {
    const job = await db.analysisJob.findUniqueOrThrow({ where: { id: jobId }, select: { currency: true } });
    const input = await loadEngineInput(db, jobId);
    const result = computeResults(input, job.currency);
    return serializeResult(result, {
      revision,
      calcVersion: CALC_VERSION,
      currency: job.currency,
      extraIssues: await this.pipelineIssues(db, jobId),
      pendingMatches: await this.pendingMatches(db, jobId),
      recipes: await this.recipes(db, jobId),
      supplierPrices: await this.supplierPrices(db, jobId),
    });
  }

  async recompute(db: Db, jobId: string, revision: number): Promise<StoredSnapshot> {
    const payload = await this.compute(db, jobId, revision);
    const payloadHash = sha256Hex(JSON.stringify(payload));
    await db.resultSnapshot.upsert({
      where: { jobId_revisionNumber: { jobId, revisionNumber: revision } },
      create: { jobId, revisionNumber: revision, calcVersion: CALC_VERSION, payload, payloadHash },
      update: { calcVersion: CALC_VERSION, payload, payloadHash },
    });
    return { revision, payload, payloadHash };
  }

  /** The snapshot for a revision (default: the job's current one). */
  async get(jobId: string, revision?: number): Promise<StoredSnapshot> {
    const job = await this.prisma.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { currentRevision: true, status: true },
    });
    const snapshot = await this.prisma.resultSnapshot.findUnique({
      where: { jobId_revisionNumber: { jobId, revisionNumber: revision ?? job.currentRevision } },
    });
    if (!snapshot) {
      throw job.status === 'READY'
        ? Problems.notFound('No results for this revision.')
        : Problems.invalidState('Results are not ready yet.');
    }
    return {
      revision: snapshot.revisionNumber,
      payload: snapshot.payload as SnapshotPayload,
      payloadHash: snapshot.payloadHash,
    };
  }

  /** Issues that come from processing rather than from the numbers: unreadable files, unconfirmed matches. */
  private async pipelineIssues(db: Db, jobId: string): Promise<Issue[]> {
    const [failedFiles, pending] = await Promise.all([
      db.uploadedFile.findMany({ where: { jobId, status: 'FAILED' }, select: { originalName: true, statusMessage: true } }),
      db.matchSuggestion.count({ where: { jobId, status: 'PENDING' } }),
    ]);
    const issues: Issue[] = failedFiles.map((file) => ({
      code: 'file_not_processed',
      severity: 'critical',
      text: `"${file.originalName}" could not be processed${file.statusMessage ? `: ${file.statusMessage}` : '.'}`,
    }));
    if (pending) {
      issues.push({
        code: 'matches_unconfirmed',
        severity: 'warning',
        text: `${pending} POS item name(s) could not be matched to the menu with certainty. Ask the assistant to review them.`,
      });
    }
    return issues;
  }

  /** Recipe detail per menu item, carried in the snapshot so exports need no further queries. */
  private async recipes(db: Db, jobId: string): Promise<Map<string, RecipeLineJson[]>> {
    const lines = await db.recipeLine.findMany({
      where: { jobId },
      include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const byItem = new Map<string, RecipeLineJson[]>();
    for (const line of lines) {
      const entry: RecipeLineJson = {
        recipeLineId: line.id,
        ingredientId: line.ingredient.id,
        ingredientName: line.ingredient.name,
        quantity: line.quantity.toString(),
        unit: line.unit,
        baseQuantity: line.baseQuantity.toString(),
        baseUnit: line.ingredient.baseUnit,
        source: line.source,
      };
      byItem.set(line.menuItemId, [...(byItem.get(line.menuItemId) ?? []), entry]);
    }
    return byItem;
  }

  private async supplierPrices(db: Db, jobId: string): Promise<SupplierPriceJson[]> {
    const lines = await db.invoiceLine.findMany({
      where: { jobId, invoice: { duplicateOfId: null } },
      include: {
        invoice: { select: { supplierName: true, invoiceNumber: true, invoiceDate: true } },
      },
      orderBy: { id: 'asc' },
    });
    return lines.map((line) => ({
      supplier: line.invoice.supplierName,
      invoiceNumber: line.invoice.invoiceNumber,
      invoiceDate: line.invoice.invoiceDate?.toISOString().slice(0, 10) ?? null,
      description: line.rawDescription,
      quantity: line.quantity?.toString() ?? null,
      pack: [line.packCount?.toString(), line.packSize?.toString(), line.packUnit]
        .filter(Boolean)
        .join(' × ') || null,
      lineNet: line.lineNet?.toString() ?? null,
      costPerBaseUnit: line.costPerBaseUnit?.toString() ?? null,
      baseUnit: line.baseUnit,
      confidence: line.confidence,
    }));
  }

  private async pendingMatches(db: Db, jobId: string): Promise<PendingMatchJson[]> {
    const matches = await db.matchSuggestion.findMany({
      where: { jobId, status: 'PENDING' },
      orderBy: { posDisplayName: 'asc' },
    });
    const candidateIds = matches.flatMap((match) => (match.candidateId ? [match.candidateId] : []));
    const names = new Map(
      (await db.menuItem.findMany({ where: { id: { in: candidateIds } }, select: { id: true, name: true } })).map(
        (item) => [item.id, item.name],
      ),
    );
    return matches.map((match) => ({
      matchId: match.id,
      posName: match.posDisplayName,
      suggestedMenuItemId: match.candidateId,
      suggestedMenuItemName: match.candidateId ? (names.get(match.candidateId) ?? null) : null,
      score: match.score.toFixed(4),
    }));
  }
}
