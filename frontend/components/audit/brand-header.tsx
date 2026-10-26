import { BarChart3 } from "lucide-react";

export function BrandHeader() {
  return (
    <div className="flex items-center gap-2">
      <BarChart3 className="size-8 text-emerald-500" strokeWidth={2.5} />
      <div className="flex flex-col leading-none">
        <span className="text-xl font-extrabold tracking-tight">
          Menu Profit
        </span>
        <span className="text-[0.65rem] font-medium tracking-[0.2em] text-muted-foreground">
          RESTAURANT AUDITS
        </span>
      </div>
    </div>
  );
}
