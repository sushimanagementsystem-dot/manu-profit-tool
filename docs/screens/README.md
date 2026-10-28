# Screens

Design material for the screens of Menu Profit. Today there is one screen under design: the analysis screen
(`/analysis/[jobId]`). Nothing here is shipped code; the shipped code lives in `frontend/`.

| Folder | What it holds |
|---|---|
| `reference/` | Images supplied as a starting point. They are inspiration, **not** a specification: they show things the product does not have (see the gap table in [phase 11](../phases/phase-11-analysis-screen-redesign.md)). |
| `current/` | Screenshots of the screen as it is built today, taken from the running app. The "before" of any redesign. |
| `prototype/` | The proposed design: the HTML it is rendered from, and the images. Re-render from the HTML rather than editing an image. |

## Files

| File | |
|---|---|
| `reference/analysis-screen-reference.png` | The reference mock-up supplied for the redesign (2026-10-28). |
| `current/analysis-screen-current.png` | The analysis screen as built at commit `b84b1e4` (editable table, chat with a pending change). |
| `prototype/analysis-screen-v1.html` | Source of the prototype. Open it in a browser; resize to see the responsive layouts. |
| `prototype/analysis-screen-v1-desktop.png` | Desktop, first screen the client sees. |
| `prototype/analysis-screen-v1-desktop-full.png` | Desktop, the whole page. |
| `prototype/analysis-screen-v1-mobile.png` | Phone width. |

## Rules for anything added here
- Figures in a prototype are computed from the dummy dataset in `~/Downloads/MenuProfit-TestData` (see its README),
  never typed in, so a design cannot show numbers the engine would not produce.
- A prototype must not draw something as if it worked when it does not exist. Anything the product cannot do today
  is listed in the phase document as new work.

## final/
`analysis-screen-final-desktop.png` (1440 × 1000) and `analysis-screen-final-mobile.png` (390 × 844): the built screen, from the same test job as `current/`, for comparison with `prototype/`.
