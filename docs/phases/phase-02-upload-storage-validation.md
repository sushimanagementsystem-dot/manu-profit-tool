# Phase 2 — File Upload, Storage, and Validation

**Status:** Planned.

## Objective
Clients can upload multiple files per category to a draft job, with progress and removal. The backend
authoritatively validates and privately stores them, and the existing upload UI is preserved.

## Scope
- `files/`: multipart upload (one file per request, streamed to disk), magic-byte sniffing (PDF, PNG, JPEG, ZIP-XLSX,
  CSV text heuristic), size, count and total limits, PDF page count, SHA-256 duplicate rejection, and the XLSX
  zip-bomb guard.
- `StorageService` interface + `LocalStorageDriver` (`STORAGE_ROOT/{jobId}/uploads/{randomId}`).
- Readiness check and submit validation.
- `UploadedFile` table.

**Exclusions:** parsing and extraction, and the S3 driver (MVP+).

## Dependencies
Phase 1.

## Frontend tasks (preserve the design)
- `new-audit-card.tsx`:
  - keep the slots, colors, dropzones, file list and button;
  - change it to create the job on the first file added (or on submit, decided in the implementation review);
  - allow **multiple files for every category**;
  - upload each file through XHR with a per-file progress bar and retry;
  - make remove call `DELETE`;
  - take the limits and accepted types from the `POST /jobs` response;
  - show server validation errors per file;
  - have Submit call `/submit` and navigate to `/analysis/{jobId}#k=…`.
- Keep `validate-upload.ts` as the pre-check and feed it the server limits.
- Update the slot hints and copy (types and sizes).
- Add a short "What to upload" helper text per category (data requirements).

## Backend tasks
As in Scope, plus the `JobEvent`s `FILE_UPLOADED` and `FILE_REMOVED` (without names).

## Database changes
Migration `0002_files`: `UploadedFile`, enums `FileCategory` and `FileStatus`, unique `(jobId, sha256)`.

## n8n workflows
None.

## API endpoints
`POST /jobs/:id/files`, `DELETE /jobs/:id/files/:fileId`, `GET /jobs/:id/readiness`, and the full `POST /jobs/:id/submit`
(readiness enforced).

## Testing requirements
- **Unit:** sniffing for each type, including the renamed `.exe`, the polyglot, and the zip bomb (DS-10).
- **Integration:**
  - upload limits;
  - duplicate rejection;
  - delete only in DRAFT;
  - cross-job file access attempts;
  - submit when not ready returns 422.

## Acceptance criteria
- Upload 25 invoices + 2 menus + 2 POS files with visible progress.
- Removal works.
- Invalid files are rejected with clear messages.
- Files sit on disk with random names outside any served path.
- The UI looks the same as today apart from the progress and the multi-file support.

## Risks
Large uploads through a reverse proxy (set its body size to ≥ 16 MB); browser MIME lies (handled by sniffing).

## Deliverables
A working upload flow end to end and migration 0002.
