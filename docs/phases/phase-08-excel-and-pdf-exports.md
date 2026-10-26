# Phase 8 — Excel and PDF Exports

**Status:** Planned. **Release 1: Excel only (ADR-022),** with an extra "Needs review" sheet listing uncertain
matches and missing data. PDF comes in Release 2.

## Objective
Downloadable Excel and PDF that reflect exactly the same approved revision, delivered over secure short-lived links.

## Scope
- `exports/xlsx`, using exceljs:
  - Sheets: Summary, Sales Analysis, Menu Costing, Recipe Lines, Ingredient Costs, Supplier Price Records,
    Recommendations, Assumptions & Data Quality, Revision Log. Sheets that have no data are omitted, and the
    Summary notes that.
  - Live formulas for GP, GP% and cost per portion (INDEX/MATCH into Recipe Lines and Ingredient Costs), with
    cached results equal to the engine output.
  - Assumption cells (VAT, wastage) that the formulas reference, so the client can play with the numbers.
  - A confidence column with conditional formatting. Missing values are left blank with a "reason" column, never 0.
  - Frozen headers, number formats (currency per job), and column widths.
  - A footer and document properties with job date, revision number and snapshot hash.
- `exports/pdf`, using pdfmake:
  - Cover (restaurant name if given, period, revision).
  - Executive summary, sales performance and menu mix, the GP and contribution tables, the menu matrix
    (server-rendered SVG), item findings, pricing and cost opportunities with engine impact, prioritized
    recommendations, and assumptions, missing data and limitations.
  - The Geist font is embedded (license OK).
- Generation is asynchronous (a `ReportExport` row) but usually takes under 5 s. Results are cached per
  `(job, revision, format)`.
- Download links are single-use, valid for 5 min, HMAC-signed, and served with attachment + `no-store` headers.

**Exclusions:** DOCX, emailing reports, and branding customization beyond the name and logo.

## Dependencies
Phase 5 (snapshot); Phase 7 for chat-approved changes (exports simply follow the current revision).

## Frontend tasks
A Downloads panel with "Download Excel" and "Download PDF" for the current revision, a status spinner, and a
note on which revision is exported. It replaces the old banner's `/api/audits/[id]/report` link.

## Backend tasks
As in Scope.

## Database changes
Migration `0008_exports`: `ReportExport`.

## n8n workflows
None (generation stays in the backend; the old n8n Excel node is retired).

## API endpoints
`POST /jobs/:id/exports`, `GET /jobs/:id/exports`, `POST /jobs/:id/exports/:exportId/link`, `GET /downloads/:token`.

## Testing requirements
- Re-open the XLSX: sheet set, cached values equal to the snapshot, formulas present, and the revision stamp.
- PDF: extracted text contains the totals and the revision stamp.
- Consistency: after a revision both files change, and their hashes match the snapshot.
- Security: a reused, expired, or other-job download token returns 404.
- Manual: open the workbook in Excel and LibreOffice and check that the formulas recalculate to the same values.

## Acceptance criteria
- Both files for DS-1 match the UI numbers.
- The workbook is editable and correct.
- The PDF is readable and professional (reviewed by the Hospitality Audits consultant).

## Risks
Formula/engine divergence (mitigated: tests compare formula semantics on fixtures; an optional HyperFormula check
in the MVP, which would need dependency approval); PDF layout effort.

## Deliverables
Excel (prototype), PDF (MVP), secure downloads, and migration 0008.
