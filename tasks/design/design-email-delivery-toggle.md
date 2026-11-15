# Design: Admin-Controlled Email Delivery

## Overview

Add a database-backed email-delivery switch to the Mail Server settings. The switch controls whether any email is sent through SMTP, without deleting or otherwise changing the stored SMTP configuration.

`TESTING_MODE` remains an environment-level policy:

- `TESTING_MODE=true`: every application startup resets email delivery to disabled.
- `TESTING_MODE=false`: every application startup resets email delivery to enabled.

An admin can temporarily enable delivery in a testing environment for human UAT. A later cold start resets it to disabled. This trade-off is intentional: email temporarily not working in a testing environment is preferable to CI making repeated costly SMTP calls.

The existing `otp_email_enabled` tenant setting remains unchanged. It controls whether Email is offered as an OTP verification channel; the new setting controls whether the backend actually performs email delivery.

## Decisions

1. Persist the new setting in the `tenant_smtp_config` singleton as `email_delivery_enabled`.
2. Synchronize the setting from `TESTING_MODE` on every FastAPI lifespan startup, before pending report emails are requeued.
3. Gate every outbound SMTP path, not only OTP delivery:
   - OTP email
   - Results-report email
   - Results-report retries
   - Startup requeueing
   - Admin test email
4. Allow only an authenticated admin to retrieve the latest OTP, and only when `TESTING_MODE=true` and delivery is disabled.
5. Expose a small admin-only PATCH endpoint for toggling delivery. Do not overload the full SMTP configuration update.
6. Keep request-OTP enumeration-safe. A known email still receives the normal success-shaped response even when delivery is suppressed.

## Data Model

Add one column to `tenant_smtp_config`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `email_delivery_enabled` | BOOLEAN | `true` | Effective SMTP delivery switch |

The migration should:

- Add the column as `NOT NULL`.
- Backfill existing rows to `true`.
- Keep a server default of `true` so a missing config row behaves predictably until startup synchronization runs.

No delivery-history migration is needed. Existing pending `email_deliveries` rows remain pending while delivery is disabled and may be sent after delivery is enabled and requeueing resumes.

## Startup Synchronization

Add a service operation in `smtp_config_service.py`:

```text
sync_email_delivery_from_testing_mode(db)
    config = get_smtp_config(db)
    config.email_delivery_enabled = not settings.testing_mode
    commit
```

Call it from the FastAPI lifespan after the migration-head check and before `EmailService.requeue_pending_on_startup()`.

Startup order:

1. Verify migrations are current.
2. Synchronize `email_delivery_enabled` from `TESTING_MODE`.
3. Requeue pending report emails only if delivery is enabled.

This ordering prevents a testing deployment's first cold start from retrying report emails before the delivery switch has been forced off.

The synchronization intentionally runs on every cold start. It may overwrite an admin's temporary UAT value, which is accepted behaviour.

## Effective Delivery Rule

Centralize the check in the SMTP configuration service:

```text
is_email_delivery_enabled(db) =
    tenant_smtp_config.email_delivery_enabled
```

SMTP configuration completeness remains a separate check:

```text
can_send_email(db) =
    is_email_delivery_enabled(db)
    && host is set
    && username is set
    && from-address is set
    && encrypted password exists
```

These states must remain distinguishable in admin responses and logs:

- Delivery disabled
- Delivery enabled but SMTP unconfigured
- Delivery enabled and SMTP configured

## Backend API

### Read SMTP configuration

`GET /api/admin/config/smtp`

Add `email_delivery_enabled: boolean` to `SmtpConfigOut`.

### Update delivery switch

`PATCH /api/admin/config/smtp/delivery`

Request:

```json
{ "enabled": true }
```

Response:

```json
{ "email_delivery_enabled": true }
```

Requirements:

- Admin authentication remains enforced by the existing admin router dependency.
- The update is atomic and committed before returning.
- It does not require SMTP fields or credentials.
- Log an admin-facing audit event containing the new value and authenticated admin user ID. Do not log credentials.

### Test email

`POST /api/admin/config/smtp/test`

When delivery is disabled, return `409 Conflict` without calling `aiosmtplib`:

```text
Email delivery is disabled
```

The frontend disables the button in this state, but the backend check remains authoritative.

## OTP Delivery Flow

The request-OTP handler continues to:

1. Resolve the effective email/SMS channel.
2. Check whether the email belongs to a voter or proxy.
3. Generate and persist the OTP.
4. Return the same response shape for known and unknown addresses.

For the email path:

```text
if email_delivery_enabled:
    send through SMTP
else:
    log a structured "suppressed" event
    do not call send_otp_email
```

The existing `settings.testing_mode` check around SMS delivery should remain in place unless a separate SMS requirement changes it. The new setting is specifically an email/SMTP delivery control.

Add a defensive guard inside `send_otp_email()` as well so direct callers cannot bypass the policy. It should raise a dedicated `EmailDeliveryDisabledError` before resolving credentials or invoking `aiosmtplib`.

## Results-Report Delivery

Apply the same policy to report email paths:

- `EmailService.send_report()` checks delivery policy before rendering or contacting SMTP.
- `EmailService.trigger_with_retry()` checks before acquiring an advisory lock and before each retry attempt. If delivery becomes disabled mid-retry, it exits without incrementing the attempt counter or marking the delivery failed.
- `requeue_pending_on_startup()` returns immediately when delivery is disabled.
- The manual resend endpoint returns `409 Conflict` when delivery is disabled.

Suppression is not an SMTP failure. Pending delivery records must not be marked `failed` solely because an admin or testing environment disabled delivery.

## OTP Retrieval Endpoint

`GET /api/test/latest-otp` remains a test-only endpoint but changes authorization and availability:

```text
requires authenticated admin
and TESTING_MODE=true
and email_delivery_enabled=false
```

Behaviour:

- No admin session: existing `require_admin` behaviour (`401`, or upstream auth failure).
- Authenticated admin, production/testing retrieval unavailable: `404`.
- Authenticated admin, testing environment with delivery enabled: `404`.
- Authenticated admin, testing environment with delivery disabled: return the most recent unused OTP.

Implement the environment/delivery availability check inside the handler after `require_admin`; keep the production-safe 404 semantics.

The E2E helper already retrieves OTPs through an admin-authenticated API context (`makeAdminApi`). Update its stale comments that mention `skip_email`; no request-body bypass field should be introduced.

## Frontend

In the Email Server tab's Mail Server card:

- Add an "Email delivery" toggle near the top of the card.
- Add explanatory text distinguishing it from "Email verification" in the Authentication section.
- Save changes immediately through `PATCH /api/admin/config/smtp/delivery`, not through the existing Save button for credentials.
- Show a persistent warning when disabled: "Email delivery is disabled. OTP and results emails will not be sent."
- Show supporting text: "Testing deployments reset this setting on server startup."
- Disable "Send test email" while delivery is disabled.
- Revert the visible toggle and show an inline error if the PATCH fails.

The API client and Settings page state should include `email_delivery_enabled` when loading SMTP configuration.

## Security

- OTP retrieval requires admin authentication and remains impossible when `TESTING_MODE=false`.
- Delivery suppression never returns or reveals an OTP to an unauthenticated voter.
- Request-OTP remains enumeration-safe.
- SMTP credentials are untouched by the toggle and remain write-only.
- Disabling delivery must not weaken CSRF, session-cookie security, rate limiting, or other `TESTING_MODE` controls.
- Tests must prove there are zero `aiosmtplib.send` calls while delivery is disabled.
- Test data cleanup must continue removing pending delivery rows for test meetings.

## Failure and Concurrency Behaviour

- Startup synchronization is best effort under the existing startup retry policy. A testing environment must fail closed with respect to email if synchronization cannot establish the disabled state.
- Concurrent admin toggle requests are last-write-wins at row level.
- Cold-start synchronization intentionally wins over a temporary UAT enable.
- A retry worker that is already running observes the flag before its next attempt and exits when delivery is disabled.

## Test Plan

### Migration/model

- New column exists, is non-null, and defaults existing/fresh rows to enabled.
- ORM default and migration server default agree.

### Startup

- `TESTING_MODE=true` sets delivery disabled.
- `TESTING_MODE=false` sets delivery enabled.
- Synchronization occurs after migration checking and before report requeueing.
- Requeueing does not launch report workers while delivery is disabled.
- Running startup again in testing mode resets a manually enabled value.

### SMTP config/admin API

- `GET /config/smtp` returns `email_delivery_enabled`.
- PATCH toggles the value without changing SMTP credentials.
- PATCH requires admin authentication.
- Invalid body returns 422.
- Test-email returns 409 and makes no SMTP call while disabled.
- Audit log contains admin identity and new value.

### OTP

- Known email with delivery enabled calls `send_otp_email`.
- Known email with delivery disabled creates the OTP but does not call SMTP.
- Unknown email remains indistinguishable and makes no send call.
- Direct `send_otp_email` raises the disabled error without resolving credentials.
- SMS behaviour is unchanged by this feature.

### Reports/retries

- `send_report` is suppressed before any SMTP call while disabled.
- Retry workers exit without incrementing attempts when disabled.
- Disabling during a retry stops the next attempt.
- Startup requeue is a no-op while disabled.
- Resend endpoint returns 409 while disabled.

### OTP retrieval

- Unauthenticated request is rejected.
- Admin request succeeds only in testing mode with delivery disabled.
- Admin request returns 404 with delivery enabled.
- Admin request returns 404 with `TESTING_MODE=false`.
- Used and expired OTPs remain excluded.

### Frontend

- Toggle renders from API state.
- Enable/disable calls the PATCH endpoint and updates immediately.
- PATCH failure reverts the toggle and shows an error.
- Disabled state shows the warning and disables test email.
- Existing SMTP credential save and test-email flows continue to work when enabled.

### E2E

- Automated voter authentication obtains OTP only through the admin-authenticated retrieval API and sends no email.
- A testing deployment starts with email delivery disabled.
- The existing full voting workflow remains functional without SMTP.

## Files Expected to Change

| File | Change |
|---|---|
| `backend/alembic/versions/<new>.py` | Add `email_delivery_enabled` |
| `backend/app/models/tenant_smtp_config.py` | Add model field |
| `backend/app/services/smtp_config_service.py` | Delivery policy, toggle, startup synchronization |
| `backend/app/services/email_service.py` | Central SMTP suppression and report/retry gating |
| `backend/app/main.py` | Startup synchronization ordering |
| `backend/app/schemas/config.py` | SMTP read/update/status schemas |
| `backend/app/routers/admin.py` | GET/PATCH/test-email/resend behaviour |
| `backend/app/routers/auth.py` | OTP delivery gate and admin-only retrieval |
| `backend/app/routers/voting.py` | Only if report sending is scheduled there |
| `frontend/src/api/config.ts` | Types and PATCH client |
| `frontend/src/pages/admin/SettingsPage.tsx` | Toggle, warning, disabled test action |
| Backend/frontend tests | Coverage listed above |
| `e2e_tests/workflows/helpers.ts` | Comments/assertions for admin retrieval |

## Out of Scope

- Per-request CI tokens
- Per-building delivery controls
- Deployment-ID-based one-time startup initialization
- Changing SMS provider controls
- Viewing or exporting stored SMTP credentials
