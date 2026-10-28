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
 * The table's title and count, search, filter chips with their counts, and the sort order. These
 * only change which rows are shown, in this browser; nothing here touches the analysis.
 */
export function TableToolbar({
  total,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
}: {
  total: number;
  query: string;
  onQueryChange: (query: string) => void;
  filter: ItemFilter;
  onFilterChange: (filter: ItemFilter) => void;
  counts: Record<ItemFilter, number>;
  sort: ItemSort;
  onSortChange: (sort: ItemSort) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 px-[18px] pt-4 pb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          Menu items
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/70">
            {total}
          </span>
        </h2>
        <div className="relative w-full sm:ml-auto sm:w-60">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search dishes"
            aria-label="Search menu items"
            className="h-9 rounded-[10px] pl-8.5"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto px-[18px] pb-3 max-sm:flex-nowrap">
        <div role="group" aria-label="Filter items" className="flex gap-1.5">
          {(Object.keys(FILTER_LABELS) as ItemFilter[]).map((key) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(key)}
                className={cn(
                  "h-[30px] shrink-0 cursor-pointer rounded-full border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-foreground/70 hover:bg-muted",
                )}
              >
                {FILTER_LABELS[key]}
                <span className={cn("ml-1.5 font-semibold tabular-nums", active ? "opacity-75" : "text-muted-foreground")}>
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
        <label className="ml-auto flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground max-sm:hidden">
          Sorted by
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as ItemSort)}
            className="h-8 cursor-pointer rounded-lg border-0 bg-transparent px-1 text-[12.5px] font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {(Object.keys(SORT_LABELS) as ItemSort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
