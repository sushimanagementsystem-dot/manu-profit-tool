import { BrandHeader } from "@/components/audit/brand-header";
import { NewAuditCard } from "@/components/audit/new-audit-card";

export default function NewAuditPage() {
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
      <BrandHeader />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Upload Your Restaurant Data
        </h1>
        <p className="text-muted-foreground">
          Upload your menu, supplier invoices and POS sales report. Our AI
          will analyze your data and generate a detailed profitability
          report.
        </p>
      </div>

      <NewAuditCard />
    </div>
  );
}
