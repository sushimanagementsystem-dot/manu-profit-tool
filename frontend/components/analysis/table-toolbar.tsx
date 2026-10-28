"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  FILTER_LABELS,
  SORT_LABELS,
  type ItemFilter,
  type ItemSort,
} from "@/lib/audit/item-view";
import { cn } from "@/lib/utils";

/**
 * Search, filter chips with their counts, and the sort order. These only change which rows are
 * shown, in this browser; nothing here touches the analysis.
 */
export function TableToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  filter: ItemFilter;
  onFilterChange: (filter: ItemFilter) => void;
  counts: Record<ItemFilter, number>;
  sort: ItemSort;
  onSortChange: (sort: ItemSort) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search items"
            aria-label="Search menu items"
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-auto">
          Sort by
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as ItemSort)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {(Object.keys(SORT_LABELS) as ItemSort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div role="group" aria-label="Filter items" className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as ItemFilter[]).map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(key)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-brand-line bg-brand-soft text-brand-ink"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {FILTER_LABELS[key]}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
