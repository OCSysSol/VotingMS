# Design: Meeting Results PDF, Floor Vote Labels, and Meeting Controls
**Status:** Implemented

**PRD references:** `US-PDF-DL-01`, `US-SMTP-08`, `US-UI-FLOOR-01`

## Overview

Closed-meeting summary emails currently contain only meeting metadata and two participation totals. The admin results page has the complete motion tallies and voter-level data, but there is no offline full-report download. This design adds one backend PDF renderer that feeds both the email attachment and a new authenticated download endpoint, and exposes that endpoint through a `Download Summary PDF` button beside the summary-email action.

The same change corrects the user-facing provenance label for ballots entered by an admin from the internal sentinel `admin` to `Floor vote`, renames the vote-entry action to `Enter Floor Votes`, and moves `Add Motion` / `Enter Floor Votes` above the `Motions` heading.

## Personas and Decisions

| Persona | Need | Decision |
|---|---|---|
| Admin / meeting host | A complete offline record and predictable email attachment | Generate the PDF from existing authoritative meeting detail at request/send time |
| Lot owner / proxy voter | Their own submitted identity must remain accurate in results | Only admin-entered ballots display `Floor vote`; voter/proxy emails remain unchanged |
| Platform operator | Avoid exposing sensitive voter data and avoid storage drift | No public object URL and no persisted PDF in the initial release |

The report is available only for closed meetings, matching the summary-email action. The internal source remains `submitted_by_admin` plus the persisted `voter_email="admin"` sentinel; this change is presentation-only.

## Root Cause / Background

- `backend/app/services/email_service.py::send_report` calls `get_general_meeting_detail`, but `report_email.html` currently renders only building/meeting metadata and participation totals.
- `backend/app/services/admin_service.py::get_general_meeting_detail` already returns complete binary and multi-choice tallies, voter lists, `submitted_by_admin`, entitlement snapshots, and submission timestamps.
- `frontend/src/components/admin/AGMReportView.tsx` renders the raw `voter_email` value. Admin-entered votes persist the sentinel `"admin"`, so the voting-detail email cell displays `admin`.
- `frontend/src/pages/admin/GeneralMeetingDetailPage.tsx` renders the `Motions` heading before the Add Motion / vote-entry controls.
- `AdminVoteEntryPanel` and related tests still use `In-Person` copy.

## Storage Architecture Decision

### Recommended initial approach: generate on demand

Generate the PDF in memory from `get_general_meeting_detail` whenever:

1. the authenticated admin requests the download; or
2. the email send/retry worker needs the attachment.

This keeps `general_meetings`, `votes`, `motion_options`, and `general_meeting_lot_weights` as the only source of truth. There is no stale duplicate to invalidate when a closed meeting is reopened, a report is resent, or a bug fix changes report presentation. There is also no new sensitive-data store or public URL, which matters because voter lists include owner names and email addresses.

The expected report size is bounded to the building's lot population and can be rendered with paginated tables. This is simpler and cheaper than operating storage, lifecycle rules, and private-access controls in the first release. A dedicated admin rate limiter bounds repeated CPU-heavy requests.

### Object storage: when it becomes appropriate

Persist the PDF only when a hard requirement exists to preserve the exact file that was delivered. In that case:

- write to a private object store, never the current public `blob_service.upload_to_blob()` path;
- key by tenant/deployment, meeting ID, and report version/checksum;
- store who generated it and when, the source meeting `closed_at`, SHA-256 digest, and retention expiry;
- overwrite or version after meeting reopen/result changes;
- serve downloads through an authenticated endpoint or a very short-lived signed URL;
- enforce retention and deletion alongside the meeting-data retention policy.

An immutable archive is useful for legal/audit retention but does not replace the database and is not required by this change. On-demand generation avoids paying to store files that are usually viewed once and avoids stale copies.

## Technical Design

### Database changes

None. PDFs are render artifacts, not domain records. `buildings.oc_plan_number` remains nullable for legacy data in the companion OC Plan design. No report archive table is added in this phase.

### Backend changes

#### PDF dependency

Add `reportlab` to `backend/pyproject.toml` and update `backend/uv.lock`. ReportLab is preferable to launching a headless browser and is compatible with the Vercel Python runtime. Use its Platypus layout primitives (`SimpleDocTemplate`, `Paragraph`, `Table`, `PageBreak`) so long tables split across A4 pages with repeated headers.

Add `pypdf` only to the dev dependency group if integration tests need to extract text from generated PDFs.

#### New shared PDF service

Create `backend/app/services/report_pdf_service.py`:

```python
def generate_meeting_results_pdf(detail: dict) -> bytes: ...
def report_pdf_filename(detail: dict) -> str: ...
def format_voter_display(voter: dict) -> str: ...
```

`generate_meeting_results_pdf` is synchronous and accepts the existing normalized `GeneralMeetingDetail` dictionary. It performs no database queries, which keeps the email path and download path identical.

Report contents:

1. **Header:** application/tenant-neutral `Meeting Results Report`, OC Plan number when present, building name, meeting title, status, meeting time, voting close time, and generation time.
2. **Participation:** eligible lots, submitted ballots, and participation percentage.
3. **Every motion, ordered by `display_order`:** motion number/label, title, description, and `General Resolution` / `Special Resolution`.
4. **Binary general/special motions:** weighted and voter-count totals for For, Against, Abstained, Absent, and Not eligible; then voter rows grouped by category.
5. **Multi-choice motions:** option limit, every option's For/Against/Abstained weighted and voter-count tallies, outcome when present, then voter rows per option plus motion-level Abstained/Absent/Not eligible rows.
6. **Voter rows:** Lot number, owner/voter identity, Email/source, entitlement (UOE), and submitted timestamp. Multi-choice rows also include option and choice.
7. **Empty states:** `No voter records` for an empty category; no `None`, enum representation, or raw JSON is printed.

`format_voter_display` is the canonical PDF display rule:

- `submitted_by_admin=True` -> `Floor vote`;
- owner/name plus email when `voter_name` exists;
- email alone otherwise;
- append `(proxy)` when `proxy_email` exists.

Use an XML-escape helper for all meeting, motion, option, owner, and proxy text before passing it to `Paragraph`; user content must never be interpreted as ReportLab markup. Keep table cell font sizes readable and set `repeatRows=1`. Do not hard-code the current tenant logo or fonts.

`report_pdf_filename` returns a filesystem-safe attachment name, for example `results-<meeting-title-slug>-<meeting-id>.pdf`. Strip path separators/control characters and cap the title slug length.

#### Download endpoint

Add to `backend/app/routers/admin.py`:

```http
GET /api/admin/general-meetings/{general_meeting_id}/results.pdf
```

Behaviour:

1. Router-level `require_admin` authentication applies.
2. Apply a dedicated `admin_report_limiter` (for example 10 requests per minute per admin user).
3. Call `get_general_meeting_detail`; preserve 404 for unknown meetings.
4. Return 409 unless effective status is `closed`.
5. Generate bytes with `generate_meeting_results_pdf`.
6. Return `Response` with `media_type="application/pdf"`, `Content-Disposition: attachment; filename="<safe name>"`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.

Add `admin_report_limiter = RateLimiter(max_requests=10, window_seconds=60)` to `backend/app/rate_limiter.py`.

#### Summary email attachment

Modify `EmailService.send_report`:

1. Fetch `detail` once.
2. Render the existing HTML body as before.
3. Call `generate_meeting_results_pdf(detail)`.
4. Build an outer `MIMEMultipart("mixed")` message.
5. Attach a nested `MIMEMultipart("alternative")` containing the existing HTML body.
6. Attach `MIMEApplication(pdf_bytes, _subtype="pdf")` with `Content-Disposition: attachment` and `report_pdf_filename(detail)`.

Generation occurs before SMTP send. A renderer exception therefore follows the existing retry/failure path; an email is never sent without the required attachment.

#### Backend presentation contract

No API schema or database rename is needed. `VoterEntry.submitted_by_admin` is already present. If the frontend display helper needs `submitted_by_admin_username`, add it to the existing TS `VoterEntry` interface; the backend already returns it. Do not replace the sentinel or expose it in UI/PDF text.

### Frontend changes

#### Download API

Add `downloadMeetingResultsPdf(meetingId): Promise<Blob>` to `frontend/src/api/admin.ts`. It must call the authenticated endpoint with existing same-origin credentials/header conventions, throw the existing formatted HTTP error on non-2xx, and return `response.blob()`.

In `GeneralMeetingDetailPage.tsx`, add a mutation or async handler that:

1. calls the API;
2. creates an object URL and temporary anchor with the returned/suggested PDF filename;
3. clicks the anchor and revokes the object URL in `finally`;
4. exposes `Downloading…`, an inline success-free state, and an accessible error message.

Replace any inline color values added for this UI with existing design tokens/classes. Keep the control row above the Results Report on narrow screens.

#### Closed-meeting action row

Always render the closed-meeting action row. When no email-delivery banner is shown, place these adjacent buttons in the same row:

```text
[Send Summary Email / Resend Summary Email] [Download Summary PDF]
```

`Download Summary PDF` uses `.btn.btn--secondary`. When the email status banner is visible, keep the download button available separately; SMTP configuration must not block access to an already-generated local report.

#### Floor vote display

Add a small shared helper such as `frontend/src/utils/voterDisplay.ts`:

```ts
formatVoterIdentity(voter): string
```

It returns `Floor vote` for `submitted_by_admin`, otherwise the existing owner/email/proxy display. Use it for the binary and multi-choice Email cells in `AGMReportView.tsx`. Use the same rule in human-readable CSV email/source fields so exports do not leak the internal sentinel. Keep internal comparisons and payload values unchanged.

#### Controls and terminology

In `GeneralMeetingDetailPage.tsx`, move the non-closed action row (`Add Motion`, optional `Enter Floor Votes`, Show All, Hide All) before the `<h2>Motions</h2>` heading. Keep Add Motion available for pending/open meetings and floor-vote entry available only for open meetings.

Rename all user-facing `Enter In-Person Votes` / `in-person votes` copy in:

- `GeneralMeetingDetailPage.tsx`;
- `AdminVoteEntryPanel.tsx` accessible names, headings, descriptions, and confirmation text;
- affected tests and E2E locators.

Suggested copy: `Enter Floor Votes`, `Enter Floor Votes — Select Lots`, `Enter Floor Votes — Vote Grid`, and `Submit floor votes?`. Backend function names and API payload names may remain `enter_votes` / `in_person`; no contract migration is required.

## Data Flow

### Email

Admin clicks Send/Resend Summary Email -> existing endpoint resets delivery state -> retry worker calls `send_report` -> `get_general_meeting_detail` loads authoritative results -> HTML and PDF are rendered from that same `detail` object -> mixed MIME message includes HTML plus PDF -> SMTP sends -> delivery record becomes delivered.

### Download

Admin opens a closed meeting -> clicks `Download Summary PDF` -> authenticated endpoint loads the same `detail` object -> PDF service renders in memory -> response streams a no-store PDF attachment -> browser saves it.

## Security Considerations

- **Authentication:** Both email and download remain behind the admin-authenticated `/api/admin/` surface.
- **Input validation:** Meeting ID is parsed as UUID by FastAPI. All content rendered into PDF is XML-escaped; filename slugs are sanitized.
- **Session/cookies:** No change.
- **Secrets:** No new secrets for on-demand generation. If private archival is introduced later, use server-only object-store credentials.
- **Rate limiting:** New PDF endpoint is rate-limited per authenticated admin/user.
- **Data exposure:** PDF includes sensitive owner/voter data. Do not upload it to the existing public Blob helper, do not make an unauthenticated link, and return `Cache-Control: no-store`.
- **Email scope:** Existing manager-recipient and `EMAIL_OVERRIDE` behavior is preserved.

## Files to Change

| File | Change |
|---|---|
| `backend/pyproject.toml`, `backend/uv.lock` | Add ReportLab; optionally add `pypdf` to dev tests |
| `backend/app/services/report_pdf_service.py` | Shared PDF layout, voter formatting, safe filename |
| `backend/app/services/email_service.py` | Generate and attach PDF in mixed/alternative MIME message |
| `backend/app/routers/admin.py` | Authenticated closed-meeting PDF download endpoint |
| `backend/app/rate_limiter.py` | Admin report-generation limiter |
| `backend/app/services/admin_service.py` | No query change expected; verify detail contains all PDF fields |
| `backend/tests/test_report_pdf_service.py` | PDF content, pagination, escaping, empty categories, admin label |
| `backend/tests/test_email.py` | HTML + PDF multipart attachment and generation failure behavior |
| `backend/tests/test_admin_meetings_api.py` | Download success/401/404/409/rate-limit/media headers |
| `frontend/src/api/admin.ts` | PDF blob API function and type updates |
| `frontend/src/pages/admin/GeneralMeetingDetailPage.tsx` | Download button, always-available closed actions, controls above heading |
| `frontend/src/pages/admin/AdminVoteEntryPanel.tsx` | Floor Votes copy and accessible names |
| `frontend/src/components/admin/AGMReportView.tsx` | Floor vote identity helper in binary/multi-choice details and CSV |
| `frontend/src/utils/voterDisplay.ts` | Shared voter identity/display formatter |
| `frontend/src/pages/admin/__tests__/GeneralMeetingDetailPage.test.tsx` | Button, download, order, label tests |
| `frontend/src/pages/admin/__tests__/AdminVoteEntryPanel.test.tsx` | Floor Votes copy tests |
| `frontend/src/components/admin/__tests__/AGMReportView.test.tsx` | Admin vs voter display and CSV tests |
| `frontend/tests/msw/handlers.ts` | Mock PDF blob endpoint |
| `e2e_tests/admin/*`, `e2e_tests/workflows/agm-33m-workflow.spec.ts` | Updated floor-vote locators and new PDF journey |

## Test Cases

### Unit / Integration

- A closed binary motion PDF has `%PDF-` header, meeting/OC Plan metadata, weighted tallies, voter rows, and `Floor vote`.
- A multi-choice PDF includes every option and its For/Against/Abstained counts and voter rows.
- Long motion/description/option/owner text is escaped and wraps without ReportLab parsing errors.
- Large voter lists split onto additional pages and repeat table headers.
- Empty category lists render an intentional empty state.
- PDF filenames are sanitized and deterministic for the same meeting.
- Email MIME message contains a nested alternative HTML part and one PDF attachment with `application/pdf`.
- A PDF-generation exception propagates to existing retry handling and no SMTP call is made for that attempt.
- Download endpoint returns 200 with correct media/disposition/no-store headers for closed meetings.
- Download endpoint returns 401 unauthenticated, 404 missing, and 409 pending/open.
- Rate limiter returns 429 after the configured threshold.
- Frontend renders both buttons beside each other on a closed meeting with no banner.
- Download remains available with the email banner visible.
- Download calls the API once, saves a blob without navigation, and handles failures accessibly.
- DOM order places Add Motion / Enter Floor Votes before the Motions heading.
- Floor-vote entry appears only for open meetings; Add Motion remains for pending/open.
- Binary and multi-choice detail tables show `Floor vote` for `submitted_by_admin=True` and actual email for a voter.
- CSV/global export paths also use `Floor vote` for admin-entered rows.

### E2E

- Closed-meeting happy path: create/close a meeting with a binary vote and an admin-entered floor vote -> open detail -> confirm send and download buttons -> download PDF -> assert `.pdf` filename, nonzero download, and no navigation.
- Multi-choice path: create a multi-choice motion with option votes -> close -> download -> verify successful request/download; detailed text content is validated by backend extraction tests.
- Floor vote path: enter a floor vote for a lot -> close -> expand voting details -> assert the Email/source cell says `Floor vote` and not `admin`.
- Layout path: open an open meeting -> assert Add Motion and Enter Floor Votes precede the Motions heading in the DOM and on desktop/mobile widths.
- Email state path: simulate unconfigured/disabled email on a closed meeting -> confirm the email banner may be present while Download Summary PDF remains usable.

## E2E Test Scenarios

### Happy path

Admin creates a meeting, submits voter and floor votes, closes the meeting, downloads the PDF from the closed-meeting action row, and opens the downloaded file successfully.

### Error and edge cases

- Download clicked while the meeting is pending/open does not produce a file and shows an error.
- Download endpoint response error is displayed inline without navigating away.
- A closed meeting with no voter rows still produces a valid PDF with empty-state text.
- Long motion/option text and a large lot list do not break the download or layout.

### State-based

- Email delivery disabled/unconfigured: download remains available.
- Admin-entered ballot: UI/PDF say `Floor vote`.
- Voter/proxy-entered ballot: actual identity and proxy context remain visible.

### Multi-step sequence

Create meeting -> add binary and multi-choice motions -> submit an online ballot -> enter a floor ballot -> close meeting -> download PDF -> send/resend summary email -> verify both outputs use the same shared renderer contract.

### Existing journeys affected

- Admin meeting-management and results journey.
- Admin floor vote entry journey.
- Closed-meeting email delivery journey.
- Existing `agm-33m-workflow` and `admin-vote-entry-partial` specs must be updated, not only extended.

## Vertical Slice Decomposition

This feature should remain one worktree because the shared renderer and frontend download action form one vertical slice. Backend can be implemented first (renderer, attachment, endpoint), then frontend (API/button/labels), with contract tests between them. Floor-vote display and action reordering can be implemented independently inside the same branch after the shared download contract is stable.

## Schema Migration Required

No.
