# Security and Data Retention — Menu Profit

Status: **PLANNED.** This applies to a product with no accounts, where each analysis job is the security boundary.

## 1. Threat model (short)
| Threat | Control |
|---|---|
| Guessing or enumerating jobs | UUIDv4 job ID **and** a separate 256-bit access token. 404 for missing and unauthorized alike. Throttling. |
| A leaked link (shared, browser history) | The token sits in the URL **fragment** (`#k=`), so it is never sent to servers, logs, or Referer. Short retention (48 h). "Delete now" button. |
| Cross-job data leakage | `jobId` comes only from the guard. Every query filters by `jobId`. Chat tools are bound server-side. Integration tests try cross-job access on every endpoint. |
| Malicious uploads | Magic-byte sniffing (not the browser MIME type). Allow-list. Size, count, and PDF page limits. XLSX zip-bomb guard (uncompressed ≤ 50 MB, ≤ 50 k rows). Files are never executed or served inline. |
| Forged n8n callbacks | HMAC-SHA256 with timestamp (±300 s) and constant-time compare. Task and attempt state check. |
| Abuse of file URLs | HMAC-signed, 10-min expiry, bound to file and task, valid only while the task is DISPATCHED. |
| Download link leakage | Single-use, 5-min, export-bound tokens. `no-store`. |
| Prompt injection through documents or chat | Extracted text is treated as data. The model's only powers are read-only job tools and *proposing* revisions, which are validated and need user approval. |
| AI cost abuse | Per-job chat caps. Per-IP job-creation limits. File limits bound extraction cost. Spend alerts on the Anthropic console. |
| Secrets exposure | Secrets only in server env or the n8n credential store. No `NEXT_PUBLIC_` secrets. Separate keys per component. `.env*` gitignored. Scrub `.env.example` (KI-04). |
| Verbose errors and logs | problem+json with user-safe text. Logs carry ids, counts, durations, and codes, never filenames, item names, prices, or document text. |

## 2. Access token flow
1. `POST /jobs` returns `{jobId, accessToken}` once.
2. The frontend stores `{jobId → token}` in `localStorage` (each entry has its own expiry and is cleaned when the
   job expires) and navigates to `/analysis/{jobId}#k={token}`. It shows "Copy secure link" plus a warning that
   anyone with the link can view the analysis until it expires.
3. Requests send `Authorization: Bearer <token>`. The server compares `sha256(token)` with `accessTokenHash`
   (`timingSafeEqual`).
4. No cookies are used, so there is no CSRF surface. CORS allows only the frontend origin.

Why an unguessable URL alone is not enough:
- The token can be revoked by deleting the job.
- It is excluded from logs.
- It is rate-limited.
- Downloads use separate short-lived tokens, so a file URL that gets copied does not grant access to the job.
- The retention window limits exposure.

## 3. Upload limits (proposed, adjustable)
| Category | Max files | Types | Notes |
|---|---|---|---|
| Menu | 5 (historical versions) | PDF, JPG, PNG, CSV, XLSX | optional validFrom/validTo per file |
| Invoices | 40 | PDF, JPG, PNG, CSV, XLSX | the brief expects 20+ |
| POS reports | 5 | CSV, XLSX, (PDF in MVP) | |

Each file may be up to 15 MB, with up to 150 MB per job and up to 20 PDF pages per file. `.xls` and HEIC are
rejected with guidance. Duplicate files (by SHA-256) are rejected.

## 4. Retention policy (recommended default — confirm with client)
| Data | Retention | Mechanism |
|---|---|---|
| Unsubmitted draft jobs + their files | 2 h after creation | cleanup cron |
| Raw uploaded files | **24 h after submission** (or at job expiry if sooner). After that, re-extraction is impossible and the UI says so. | cleanup cron deletes blobs and marks files `DELETED` |
| Extracted data, matches, recipes, assumptions, revisions, snapshots, recommendations, chat | **48 h after submission** | cascade delete at `expiresAt` |
| Generated Excel/PDF | Regenerated on demand. Cached copies are deleted at `expiresAt`. | same |
| Job tombstone (status EXPIRED, no data) | 7 days after purge, so the link shows "expired" rather than "not found" | hard delete |
| `JobEvent` log | Deleted with the job | cascade |
| n8n execution data | Success: not saved. Error: 48 h. | n8n env settings |
| Application logs (no content) | 14 days | host log rotation |
| Postgres backups | **7 days.** Purged job data can therefore survive in backups for up to 7 days; this is disclosed in the privacy note. | daily `pg_dump`, encrypted, rotated |
| Uploads volume | **Not backed up** (ephemeral by design) | — |
| Anthropic API | Inputs are processed under Anthropic's API data-retention terms. Confirm the current terms and whether zero-data-retention is needed or available for this account. | Provider policy, outside our control |

**"Extend by 24 h"** (MVP, optional): the user can extend once, up to 72 h total.
**"Delete now":** the user can purge immediately.

## 5. Cleanup design
- `@nestjs/schedule` runs every 15 min. It selects up to 50 due jobs with `FOR UPDATE SKIP LOCKED`. For each job:
  1. delete the storage prefix `{jobId}/`;
  2. delete the data rows in one transaction;
  3. set `status=EXPIRED, purgedAt`;
  4. write a `DELETED` event.
- On failure it increments `cleanupAttempts` and stores `lastCleanupError` (a code only). Jobs stay due, so the
  next run retries. After 5 failures an ops log line is written at `error` level for alerting.
- A raw-file pass (same cron) deletes files where `rawFilesExpireAt < now()`.
- An **orphan sweep runs daily**:
  - storage prefixes with no job row, older than 1 h, are deleted;
  - file rows whose blob is missing are marked;
  - export files with no row are deleted.
- **Idempotent:** deleting a missing file counts as success.
- **Verified by tests:** after a time-travelled cleanup, there are no rows for the job, no files under its
  prefix, and the API returns 410.

## 6. Secret management
- Backend env is validated with zod at boot. `.env.example` holds placeholders only. Production secrets live in
  the host's secret store (Docker/Coolify env, not committed).
- Secrets to generate (each ≥ 32 random bytes): `N8N_INBOUND_KEY`, `N8N_REQUEST_SECRET`, `N8N_CALLBACK_SECRET`,
  `N8N_FILE_URL_SECRET`, `DOWNLOAD_TOKEN_SECRET`, plus `ANTHROPIC_API_KEY` (backend, chat) and a separate
  Anthropic key stored in n8n credentials.
- **Action now:** the existing `frontend/.env` holds n8n secrets for the old flow. Rotate them when the new
  workflows go live, and remove the real n8n host URL from `frontend/.env.example` before the first commit.

## 7. Audit logging
`JobEvent` stores ids, counts, and codes only, and is deleted with the job. Ops logs are structured JSON with
`requestId`, `jobId`, route, status, and duration. No request bodies are logged.
