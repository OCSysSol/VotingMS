# File Backup Runbook (RR3-43)

## Overview

The AGM Voting App is a serverless application (Vercel Lambdas + Neon PostgreSQL). All persistent application state lives in the database. This runbook documents the non-database assets that exist, their importance, and how to back them up or recover them.

---

## Non-Database Assets

### 1. Vercel Blob Storage (logo and favicon uploads)

**What it is:** The admin portal allows uploading a building logo and favicon via `POST /api/admin/config/logo` and `POST /api/admin/config/favicon`. These images are stored in Vercel Blob storage (using `@vercel/blob`). The public URLs are stored in the `tenant_config` table (`logo_url`, `favicon_url`).

**Risk:** If the Vercel project is deleted or Blob storage is purged, the images are lost. The app continues to function — it just shows no logo/favicon until re-uploaded.

**Backup procedure:**
1. Retrieve the current URLs from the DB:
   ```sql
   SELECT logo_url, favicon_url FROM tenant_config LIMIT 1;
   ```
2. Download the files:
   ```bash
   curl -o logo.png "<logo_url>"
   curl -o favicon.ico "<favicon_url>"
   ```
3. Store the files in a safe location (e.g. project assets folder, S3 bucket, or shared drive).

**Recovery:** Re-upload via the admin portal (`/admin/config`) or via the API directly.

---

### 2. Environment Variables and Secrets

**What they are:** Vercel environment variables including `DATABASE_URL`, `SESSION_SECRET`, `SMTP_*`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ALLOWED_ORIGIN`.

**Risk:** If Vercel project is deleted, these secrets are lost. The application cannot start without them.

**Backup procedure:**
- Store all secrets in macOS Keychain (already done for `agm-survey` service) and/or a team password manager (e.g. 1Password, Bitwarden).
- The `vercel env pull` command retrieves non-sensitive vars but NOT encrypted secrets.
- Critical secrets to backup manually:
  - `SESSION_SECRET` — used to sign session cookies; changing it invalidates all active sessions
  - `ADMIN_PASSWORD` (bcrypt hash) — admin portal access
  - `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Neon connection strings (also retrievable from Neon console)
  - `SMTP_*` credentials — email delivery

**Recovery:** Re-add via Vercel dashboard (`Settings → Environment Variables`) or via CLI:
```bash
vercel env add DATABASE_URL production
```

---

### 3. Example / Template Files

**What they are:** `examples/Owners_SBT.xlsx`, `examples/AGM Motion test.xlsx`, `examples/Lot financial position.csv` — used as test fixtures and client-facing import templates.

**Location:** Checked into the git repository. Git history is the backup.

**Recovery:** `git checkout examples/` from any clone of the repository.

---

### 4. Configuration Files

**What they are:** `vercel.json`, `pyproject.toml`, `alembic.ini`, `podman-compose.yml` — infrastructure configuration files.

**Location:** All checked into git. No separate backup required.

---

## Summary

| Asset | Location | Backup method | Recovery |
|-------|----------|---------------|----------|
| Logo / favicon images | Vercel Blob | Download URLs and store offline | Re-upload via admin portal |
| Secrets / env vars | Vercel + Keychain | Keychain + password manager | Re-add to Vercel |
| Example templates | Git repo | Git history | `git checkout examples/` |
| Config files | Git repo | Git history | `git checkout <file>` |
| All app data | Neon PostgreSQL | Neon automated backups (see disaster-recovery.md) | Neon restore |
