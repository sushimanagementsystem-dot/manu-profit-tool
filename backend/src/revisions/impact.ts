import { Decimal } from '../common/decimal';
import type { SnapshotPayload } from '../costing/snapshot.serializer';

export type ImpactPreview = {
  summary: {
    realisedGpBefore: string | null;
    realisedGpAfter: string | null;
    deltaGp: string | null;
    gpPercentBefore: string | null;
    gpPercentAfter: string | null;
    itemsCostedBefore: number;
    itemsCostedAfter: number;
  };
  items: {
    menuItemId: string;
    name: string;
    gpPerPortionBefore: string | null;
    gpPerPortionAfter: string | null;
    gpPercentBefore: string | null;
    gpPercentAfter: string | null;
    deltaGpContribution: string | null;
  }[];
};

const MAX_ITEMS = 25;

const delta = (before: string | null, after: string | null) =>
  before !== null && after !== null ? new Decimal(after).minus(before).toFixed(4) : null;

/** What changed between two snapshots: the headline totals plus the items that actually moved. */
export function buildImpact(before: SnapshotPayload, after: SnapshotPayload): ImpactPreview {
  const beforeItems = new Map(before.items.map((item) => [item.menuItemId, item]));
  const items: ImpactPreview['items'] = [];

  for (const item of after.items) {
    const previous = beforeItems.get(item.menuItemId);
    const gpBefore = previous?.gpPerPortion.value ?? null;
    const contributionDelta = delta(previous?.theoreticalGp.value ?? null, item.theoreticalGp.value);
    const unchanged =
      gpBefore === item.gpPerPortion.value &&
      (previous?.gpPercent.value ?? null) === item.gpPercent.value &&
      (contributionDelta === null || new Decimal(contributionDelta).isZero());
    if (previous && unchanged) continue;

    items.push({
      menuItemId: item.menuItemId,
      name: item.name,
      gpPerPortionBefore: gpBefore,
      gpPerPortionAfter: item.gpPerPortion.value,
      gpPercentBefore: previous?.gpPercent.value ?? null,
      gpPercentAfter: item.gpPercent.value,
      deltaGpContribution: contributionDelta,
    });
  }

  return {
    summary: {
      realisedGpBefore: before.summary.realisedGp,
      realisedGpAfter: after.summary.realisedGp,
      deltaGp: delta(before.summary.realisedGp, after.summary.realisedGp),
      gpPercentBefore: before.summary.gpPercent,
      gpPercentAfter: after.summary.gpPercent,
      itemsCostedBefore: before.summary.itemsCosted,
      itemsCostedAfter: after.summary.itemsCosted,
    },
    items: items.slice(0, MAX_ITEMS),
  };
}
