/** The page's own heading: what this is, how much it is built from, and that it is ready. */
export function AnalysisTitle({ filesRead, changes }: { filesRead: number; changes: number }) {
  const parts = [
    `${filesRead} ${filesRead === 1 ? "file" : "files"} read`,
    changes > 0 ? `includes ${changes} confirmed ${changes === 1 ? "change" : "changes"}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-x-3.5 gap-y-1">
      <div>
        <h1 className="text-[22px] leading-[1.15] font-semibold tracking-tight sm:text-[26px]">
          Menu profitability
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{parts.join(" · ")}</p>
      </div>
      <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
        <span className="size-[7px] rounded-full bg-brand" aria-hidden />
        Ready
      </span>
    </div>
  );
}
