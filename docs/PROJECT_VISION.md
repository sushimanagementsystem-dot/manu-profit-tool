# Project Vision — Menu Profit (Hospitality Audits)

## What it is
Menu Profit is a no-account web tool for restaurants. The client uploads a **menu**, **supplier invoices** and
**POS sales reports**. The system extracts and reconciles the data and produces a sales and gross-profit
analysis with clear data-quality flags and prioritized recommendations. The client can review uncertain matches,
edit the costing, ask an AI assistant questions, approve changes, and download the final analysis as **Excel**
and **PDF**.

## Who it is for
Restaurant owners and managers, and the Hospitality Audits consultant who works with them. Either of them uses a
temporary, secure link. There are no logins.

## Core user journey
1. Open the site. No sign-up.
2. Upload files in three categories (multiple files per category).
3. Submit, then watch progress, validation errors, missing data and uncertain matches.
4. Resolve matches and fill gaps (recipes, prices) where needed.
5. Review the results: summary, sales matrix, categories, items, costing, data quality, and recommendations.
6. Chat with the AI. It explains, runs what-if scenarios, and proposes changes. The client approves them, and
   the backend recalculates.
7. Download Excel and PDF. Both reflect the same approved revision.
8. Start another analysis from the same form.

## Product principles
- **Honest numbers.** Every figure carries a status of `verified`, `partially_verified`, `estimated`, or
  `incomplete`. Missing data is never invented. Estimates are labelled as estimates.
- **Deterministic money.** All arithmetic lives in the backend calculation engine. AI interprets, suggests, and
  extracts. It never calculates figures that we present as results.
- **Human in the loop.** AI suggests matches, recipes, and changes. Uncertain items need human approval.
- **Data minimization.** Data is temporary (default 48 h). Nothing is stored outside our control. There are no
  accounts.
- **Small and cheap.** One backend, one database, and a thin n8n layer. No microservices.

## Explicitly out of scope (initial)
User registration, login, subscriptions, billing, CRM, appointment booking, WhatsApp or voice channels,
multi-restaurant portfolios, POS API integrations (file upload only), and cross-client benchmarking.

## Key business rules to confirm with the client
| Rule | Proposed default | Status |
|---|---|---|
| ≥ 50 % of the menu materially unchanged over the reporting period | Computed as a **warning**, not a blocker. "Materially unchanged" means the item is present all period and its price moved ≤ 5 %. | **To confirm** |
| Default retention | 48 h after submission; raw files 24 h | **To confirm** |
| Currency and VAT | EUR; menu prices VAT-inclusive; the client enters VAT rates (food/drink) | **To confirm** |
| Ingredient price basis | Latest invoice price in the period (alternatives: weighted average, max) | **To confirm** |
| Missing recipes | The AI proposes estimated recipes from invoiced ingredients. They are labelled `estimated` until the client edits or approves them. | **To confirm** |
