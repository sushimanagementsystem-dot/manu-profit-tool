import { Injectable } from '@nestjs/common';

import { ProblemException, Problems } from '../common/problem';
import type { Db } from '../costing/engine-input.loader';
import { SnapshotService } from '../costing/snapshot.service';
import type { RevisionSource } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { buildImpact, type ImpactPreview } from './impact';
import { applyOperation, type OperationEffect } from './operation-applier';
import type { Operation } from './operations.schema';

/** Signals a deliberate rollback of the preview transaction. */
class PreviewRollback extends Error {
  constructor(readonly impact: ImpactPreview) {
    super('preview');
  }
}

export type RevisionView = {
  id: string;
  number: number | null;
  status: string;
  source: RevisionSource;
  rationale: string | null;
  changes: string[];
  impact: ImpactPreview | null;
  createdAt: Date;
  decidedAt: Date | null;
};

/**
 * Owns every change to a job's analysis inputs. Operations are applied in one transaction,
 * the results are recalculated, and the before/after impact is recorded — so an approved
 * revision is always paired with the snapshot it produced.
 */
@Injectable()
export class RevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotService,
  ) {}

  /** Applies the operations in a transaction that is always rolled back, to show the effect. */
  async preview(jobId: string, operations: Operation[]): Promise<ImpactPreview> {
    const current = await this.snapshots.get(jobId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const effects = await this.applyAll(tx, jobId, 0, operations);
        if (!effects.length) throw Problems.validation('These changes would have no effect.');
        const after = await this.snapshots.compute(tx, jobId, current.revision);
        throw new PreviewRollback(buildImpact(current.payload, after));
      });
    } catch (error) {
      if (error instanceof PreviewRollback) return error.impact;
      throw error;
    }
    throw Problems.validation('The preview could not be computed.');
  }

  /** Records a change the client has yet to confirm (used by the chat). */
  async propose(
    jobId: string,
    baseRevision: number,
    operations: Operation[],
    rationale: string,
    messageId?: string,
  ) {
    const impact = await this.preview(jobId, operations);
    const revision = await this.prisma.revision.create({
      data: {
        jobId,
        status: 'PROPOSED',
        source: 'CHAT',
        baseRevision,
        operations: operations as never,
        rationale,
        impactPreview: impact as never,
        proposedByMessageId: messageId,
      },
    });
    return { revisionId: revision.id, impact };
  }

  /** Applies a proposed revision, then recalculates the results. */
  async approve(jobId: string, revisionId: string): Promise<{ revision: number; impact: ImpactPreview }> {
    const proposal = await this.prisma.revision.findFirst({ where: { id: revisionId, jobId } });
    if (!proposal) throw Problems.notFound('That change no longer exists.');
    if (proposal.status === 'APPROVED') {
      return {
        revision: proposal.number as number,
        impact: proposal.impactPreview as unknown as ImpactPreview,
      };
    }
    if (proposal.status !== 'PROPOSED') {
      throw Problems.invalidState('That change was already decided.');
    }
    return this.apply(jobId, proposal.operations as unknown as Operation[], {
      source: 'CHAT',
      rationale: proposal.rationale,
      revisionId: proposal.id,
    });
  }

  /**
   * Applies edits the client made directly in the results table. They go through the same
   * operations, validation, recalculation and revision history as a confirmed chat change, so the
   * table, the assistant and the Excel workbook can never disagree about what the figures are.
   */
  applyManual(jobId: string, operations: Operation[]): Promise<{ revision: number; impact: ImpactPreview }> {
    return this.apply(jobId, operations, { source: 'MANUAL' });
  }

  async reject(jobId: string, revisionId: string): Promise<void> {
    const { count } = await this.prisma.revision.updateMany({
      where: { id: revisionId, jobId, status: 'PROPOSED' },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    if (!count) throw Problems.invalidState('That change was already decided.');
  }

  /**
   * Applies operations and stores the resulting snapshot as a new revision number.
   * Everything happens in one transaction: either the change and its results are both
   * stored, or neither is.
   */
  async apply(
    jobId: string,
    operations: Operation[],
    options: { source: RevisionSource; rationale?: string | null; revisionId?: string },
  ): Promise<{ revision: number; impact: ImpactPreview }> {
    const current = await this.snapshots.get(jobId);
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.analysisJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { currentRevision: true, status: true },
      });
      if (job.status !== 'READY') throw Problems.invalidState('The analysis is still being prepared.');
      // A proposal made against an older revision is still fine as long as its operations
      // still validate against the current data, which applyAll checks below.
      const nextRevision = job.currentRevision + 1;

      const effects = await this.applyAll(tx, jobId, nextRevision, operations);
      const snapshot = await this.snapshots.recompute(tx, jobId, nextRevision);
      const impact = buildImpact(current.payload, snapshot.payload);

      const data = {
        status: 'APPROVED' as const,
        number: nextRevision,
        appliedDiff: effects as never,
        impactPreview: impact as never,
        decidedAt: new Date(),
      };
      if (options.revisionId) await tx.revision.update({ where: { id: options.revisionId }, data });
      else {
        await tx.revision.create({
          data: {
            ...data,
            jobId,
            source: options.source,
            baseRevision: job.currentRevision,
            operations: operations as never,
            rationale: options.rationale ?? null,
          },
        });
      }
      await tx.analysisJob.update({ where: { id: jobId }, data: { currentRevision: nextRevision } });
      await tx.jobEvent.create({
        data: { jobId, type: 'REVISION_APPROVED', meta: { revision: nextRevision, operations: operations.length } },
      });
      return { revision: nextRevision, impact };
    });
  }

  async history(jobId: string): Promise<RevisionView[]> {
    const revisions = await this.prisma.revision.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });
    return revisions.map((revision) => ({
      id: revision.id,
      number: revision.number,
      status: revision.status,
      source: revision.source,
      rationale: revision.rationale,
      changes: ((revision.appliedDiff as unknown as OperationEffect[]) ?? []).map((effect) => effect.description),
      impact: (revision.impactPreview as unknown as ImpactPreview) ?? null,
      createdAt: revision.createdAt,
      decidedAt: revision.decidedAt,
    }));
  }

  private async applyAll(db: Db, jobId: string, revision: number, operations: Operation[]): Promise<OperationEffect[]> {
    const effects: OperationEffect[] = [];
    for (const [index, operation] of operations.entries()) {
      try {
        effects.push(await applyOperation(db, jobId, revision, operation));
      } catch (error) {
        if (error instanceof ProblemException) {
          const reason = error.detail ?? 'is not valid.';
          throw Problems.validation(operations.length === 1 ? reason : `Change ${index + 1} of ${operations.length}: ${reason}`);
        }
        throw error;
      }
    }
    return effects;
  }
}
