# Design: Building Owners Management

PRD reference: US-BO-01, US-BO-02, US-BO-03

**Status:** Implemented

---

## Overview

The current data model stores the lot owner's name on the `LotOwner` record (one name per lot) and email addresses in a separate `LotOwnerEmail` table (multiple emails per lot, email-only, no name). The proxy holder is stored on `LotProxy` with both a name and an email.

This feature aligns the owner and proxy models: each lot can have multiple owners, where every owner entry carries **both** a name (given name + surname) and an email address. This models the real world more accurately — a lot can be co-owned by two or more people, each with their own contact details. The admin building edit UI is updated to let admins add, edit, and remove individual owner records (name + email pairs) for a lot, and manage the proxy using the same name+email pattern that already exists.

---

## Background

### Current state
- `LotOwner`: has `given_name`, `surname`, `lot_number`, `unit_entitlement`, FK to `Building`
- `LotOwnerEmail`: multiple email-only records per `LotOwner` (no name per email)
- `LotProxy`: one optional proxy per lot, stores `proxy_email`, `given_name`, `surname`
- Admin UI: the `LotOwnerForm` `EditModal` lists emails as bare strings and lets admin add/remove by email value only

### Desired state
- Each email address on a lot has a name associated with it (the individual owner)
- Admin UI shows owner cards with name + email, supports add/edit/remove
- Proxy management retains its existing name+email structure (already correct)

### Schema option analysis

**Option A — Add `name` fields to `LotOwnerEmail`**

Add `given_name` and `surname` nullable columns to `lot_owner_emails`. The existing `email` column stays. Migration is backward-compatible: new columns are nullable, existing rows remain valid with `given_name = NULL`. The `LotOwner.given_name` / `LotOwner.surname` fields become the "primary owner" name only (or can be deprecated in favour of the per-email name).

**Option B — New `LotOwnerPerson` table replacing `LotOwnerEmail`**

Create a new table with `id`, `lot_owner_id` FK, `given_name`, `surname`, `email`. Requires a data migration to copy existing `LotOwnerEmail` rows into the new table and drop the old one. Cascades (ballot auth lookup by email, proxy email lookup) all need updating. More invasive, higher regression risk.

**Decision: Option A**

Option A is safer and simpler:
- Backward-compatible: `NULL` names are valid; no data migration needed
- No change to the `emails` batch-load pattern in `list_lot_owners` and auth lookup
- The `LotOwner.given_name` / `LotOwner.surname` fields (currently used as the lot-level name, e.g. from CSV import) are retained as-is. The per-email name fields on `LotOwnerEmail` are *additive* — they represent the individual owner associated with that email address.
- Auth service continues to look up `LotOwnerEmail.email` without needing to change join logic.

The `LotOwner`-level `given_name`/`surname` fields are kept as the lot-level primary owner name (populated from CSV import) and are not removed — this avoids a cascade of changes to existing import logic, API responses, and tests.

---

## Technical Design

### Database changes

**Migration: add `given_name` and `surname` to `lot_owner_emails`**

```sql
ALTER TABLE lot_owner_emails ADD COLUMN given_name VARCHAR NULL;
ALTER TABLE lot_owner_emails ADD COLUMN surname VARCHAR NULL;
```

Both columns are nullable. No default required. No constraint (empty string names are acceptable — the UI trims and treats empty as null but the DB allows it). No new indexes needed (these columns are not used in `WHERE` / `JOIN` / `ORDER BY` queries). The migration is fully backward-compatible: existing rows get `NULL` values, application code can handle `NULL` as "name not provided".

The `unique` constraint `uq_lot_owner_emails_owner_email` (on `lot_owner_id, email`) is unchanged.

**No other schema changes.** `LotProxy` already has `given_name` and `surname` — no changes needed there.

### Backend changes

#### 1. SQLAlchemy model — `LotOwnerEmail`

File: `backend/app/models/lot_owner_email.py`

Add two new mapped columns:

```python
given_name: Mapped[str | None] = mapped_column(String, nullable=True)
surname: Mapped[str | None] = mapped_column(String, nullable=True)
```

#### 2. Pydantic schemas — `backend/app/schemas/admin.py`

**New schema: `LotOwnerEmailOut`**

Replace the current `emails: list[str]` field on `LotOwnerOut` with a richer type:

```python
class LotOwnerEmailOut(BaseModel):
    id: uuid.UUID
    email: str | None
    given_name: str | None = None
    surname: str | None = None
    model_config = {"from_attributes": True}
```

**Modified: `LotOwnerOut`**

Change:
```python
emails: list[str]          # old — plain email strings
```
To:
```python
owner_emails: list[LotOwnerEmailOut]  # new — objects with id, email, given_name, surname
```

The field is renamed from `emails` to `owner_emails` to avoid breaking callers that still expect `emails: list[str]`. The old `emails` field is added as a computed alias for backward compatibility:

```python
@computed_field
@property
def emails(self) -> list[str]:
    return [e.email for e in self.owner_emails if e.email]
```

This ensures all existing code that reads `.emails` on `LotOwnerOut` (e.g. `LotOwnerTable.tsx` which renders `lo.emails.join(", ")`) continues to work without changes, while new code can read the richer `owner_emails` list.

**New schema: `AddOwnerEmailRequest`**

```python
class AddOwnerEmailRequest(BaseModel):
    email: str = Field(..., max_length=254)
    given_name: str | None = Field(default=None, max_length=255)
    surname: str | None = Field(default=None, max_length=255)

    @field_validator("email")
    @classmethod
    def email_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("email must not be empty")
        return v
```

The existing `AddEmailRequest` is kept as-is for backward compatibility (it is still used by the old `POST /lot-owners/{id}/emails` endpoint).

**New schema: `UpdateOwnerEmailRequest`**

```python
class UpdateOwnerEmailRequest(BaseModel):
    email: str | None = Field(default=None, max_length=254)
    given_name: str | None = Field(default=None, max_length=255)
    surname: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UpdateOwnerEmailRequest":
        if self.email is None and self.given_name is None and self.surname is None:
            raise ValueError("At least one field must be provided")
        return self
```

#### 3. Service functions — `backend/app/services/admin_service.py`

**Modified: `list_lot_owners`**

The existing batch load fetches only `(lot_owner_id, email)`. Extend it to also fetch `id`, `given_name`, `surname`:

```python
emails_result = await db.execute(
    select(
        LotOwnerEmail.id,
        LotOwnerEmail.lot_owner_id,
        LotOwnerEmail.email,
        LotOwnerEmail.given_name,
        LotOwnerEmail.surname,
    ).where(LotOwnerEmail.lot_owner_id.in_(owner_ids))
)
```

The returned dict now uses `owner_emails: list[dict]` instead of `emails: list[str]`. The `emails` key is also kept for backward compatibility (computed from `owner_emails`).

**Modified: `get_lot_owner`** — same pattern as above.

**New: `add_owner_email_to_lot_owner(lot_owner_id, email, given_name, surname, db)`**

Creates a new `LotOwnerEmail` row with `given_name` and `surname`. Replaces the existing `add_email_to_lot_owner` for new callers (old function retained for backward compat).

**New: `update_owner_email(lot_owner_email_id, data, db)`**

Updates `email`, `given_name`, and/or `surname` on a `LotOwnerEmail` row by primary key.

- Returns 404 if the row does not exist.
- If `email` is being changed and the new email already exists on this lot (`uq_lot_owner_emails_owner_email`), returns 409.
- Returns the updated `LotOwner` dict (same shape as `get_lot_owner`).

**New: `remove_owner_email_by_id(lot_owner_email_id, db)`**

Deletes a `LotOwnerEmail` row by its `id` (rather than by email string, which is how the existing `remove_email_from_lot_owner` works). Returns the updated lot owner dict. Returns 404 if not found.

#### 4. Router endpoints — `backend/app/routers/admin.py`

**New: `POST /lot-owners/{lot_owner_id}/owner-emails`**

Replaces the old `POST /lot-owners/{lot_owner_id}/emails` endpoint semantically but is a new URL so the old endpoint stays active for backward compat.

```
POST /api/admin/lot-owners/{lot_owner_id}/owner-emails
Request: AddOwnerEmailRequest { email, given_name?, surname? }
Response: LotOwnerOut (201)
Errors: 404 lot not found, 409 email already exists on this lot
```

**New: `PATCH /lot-owners/{lot_owner_id}/owner-emails/{email_id}`**

```
PATCH /api/admin/lot-owners/{lot_owner_id}/owner-emails/{email_id}
Request: UpdateOwnerEmailRequest { email?, given_name?, surname? }
Response: LotOwnerOut (200)
Errors: 404 lot or email record not found, 409 new email duplicates existing, 422 no fields provided
```

Note: `lot_owner_id` is part of the path for authorization scope; the service validates that `email_id` belongs to `lot_owner_id`.

**New: `DELETE /lot-owners/{lot_owner_id}/owner-emails/{email_id}`**

```
DELETE /api/admin/lot-owners/{lot_owner_id}/owner-emails/{email_id}
Response: LotOwnerOut (200)
Errors: 404 lot or email record not found
```

**Existing endpoints unchanged:**
- `POST /lot-owners/{id}/emails` (AddEmailRequest, no name) — kept
- `DELETE /lot-owners/{id}/emails/{email}` (by email string) — kept
- `PUT /lot-owners/{id}/proxy` — unchanged
- `DELETE /lot-owners/{id}/proxy` — unchanged

### Frontend changes

#### 1. TypeScript types — `frontend/src/types/index.ts`

Add `LotOwnerEmail` interface:

```typescript
export interface LotOwnerEmailEntry {
  id: string;
  email: string | null;
  given_name: string | null;
  surname: string | null;
}
```

Extend `LotOwner`:

```typescript
export interface LotOwner {
  // existing fields unchanged
  owner_emails: LotOwnerEmailEntry[];   // new
  emails: string[];                     // backward-compat alias, kept
}
```

#### 2. API client — `frontend/src/api/admin.ts`

**New request types:**

```typescript
export interface AddOwnerEmailRequest {
  email: string;
  given_name?: string | null;
  surname?: string | null;
}

export interface UpdateOwnerEmailRequest {
  email?: string | null;
  given_name?: string | null;
  surname?: string | null;
}
```

**New functions:**

```typescript
export async function addOwnerEmailToLotOwner(
  lotOwnerId: string,
  data: AddOwnerEmailRequest
): Promise<LotOwner>

export async function updateOwnerEmail(
  lotOwnerId: string,
  emailId: string,
  data: UpdateOwnerEmailRequest
): Promise<LotOwner>

export async function removeOwnerEmailById(
  lotOwnerId: string,
  emailId: string
): Promise<LotOwner>
```

#### 3. MSW mock handlers — `frontend/tests/msw/handlers.ts`

Add handlers for the three new endpoints:
- `POST /api/admin/lot-owners/:lotOwnerId/owner-emails`
- `PATCH /api/admin/lot-owners/:lotOwnerId/owner-emails/:emailId`
- `DELETE /api/admin/lot-owners/:lotOwnerId/owner-emails/:emailId`

Existing handlers for the old `/emails` endpoints are kept.

#### 4. Component — `frontend/src/components/admin/LotOwnerForm.tsx`

**`EditModal` changes:**

The email list section is the primary change. Currently it renders a plain `list[str]` with "Remove" buttons that call `removeEmailFromLotOwner(email_string)`. The new design:

- Render each `owner_emails` entry as a card/row showing: `[given name surname] [email] [Edit] [Remove]`
- When name is null/empty, show a placeholder "— no name —"
- "Edit" opens an inline edit row (or a small sub-form within the modal) pre-filled with the current name + email; Save calls `updateOwnerEmail(lotOwnerId, entry.id, ...)`
- "Remove" calls `removeOwnerEmailById(lotOwnerId, entry.id)` (replaces `removeEmailFromLotOwner` which removes by email string)
- "Add owner" row: three inputs — given name, surname, email — with an "Add" button. Calls `addOwnerEmailToLotOwner(lotOwnerId, data)`. All three fields are visible at once; email is required, names are optional.

The proxy section below remains structurally unchanged. The existing `SetProxyRequest` already takes `given_name` and `surname` — no change needed there.

**`AddForm` changes:**

The single `email` input (which sets the first email on lot creation) becomes `given_name`, `surname`, and `email` fields grouped under a label "Owner (optional)". The `LotOwnerCreate` schema already accepts `emails: list[str]` — no backend change needed for the add path; the owner name on create is set via the lot-level `given_name`/`surname` on `LotOwner` (existing behaviour). The new per-email name is only settable after creation via the edit modal.

Note: To keep the add form simple, the initial create still passes `emails: [email]` (no per-email name). The per-email name can be set via "Edit" in the edit modal after creation. This avoids over-complicating the add form.

#### 5. Component — `frontend/src/components/admin/LotOwnerTable.tsx`

The "Email" column currently renders `(lo.emails ?? []).join(", ")`. This continues to work because `LotOwner.emails` (the `list[str]` backward-compat field) is preserved. No mandatory change here.

Optional enhancement: the "Email" column could show `given_name surname <email>` for each owner entry if desired, but this is out of scope for this design.

---

## Data Flow (happy path: admin edits an owner email's name)

1. Admin opens BuildingDetailPage → clicks "Edit" on a lot row → `LotOwnerForm` `EditModal` opens
2. Modal loads `owner_emails` from `LotOwner` prop (already in cache from the lot-owners list query)
3. Admin clicks "Edit" on an owner email row → inline edit row expands with given name, surname, email pre-filled
4. Admin changes given name → clicks "Save"
5. Frontend calls `PATCH /api/admin/lot-owners/{id}/owner-emails/{emailId}` with `{ given_name: "Jane" }`
6. Backend `update_owner_email` fetches the `LotOwnerEmail` row, verifies it belongs to `lot_owner_id`, updates `given_name`, commits
7. Returns updated `LotOwnerOut` with `owner_emails` list containing the new name
8. Frontend mutation `onSuccess` updates local state: `emails` list re-renders with the new name; query cache for `["admin", "lot-owners", buildingId]` is invalidated

---

## Key Design Decisions

1. **Backward compat via computed alias** — Adding `owner_emails: list[LotOwnerEmailOut]` to the API response while keeping `emails: list[str]` as a computed field means no frontend component breaks silently. The implement agent must update `LotOwnerTable`, `LotOwnerForm`, and MSW handlers to use `owner_emails` for the name-aware interactions, but does not need to touch any non-building-owners code.

2. **ID-based delete replaces string-based delete** — The new `DELETE /owner-emails/{emailId}` uses the PK (`uuid`) instead of the email string. This is more robust (no URL-encoding edge cases for `+` signs in email addresses) and cleaner. The old `DELETE /emails/{email}` endpoint is kept to avoid breaking any scripts or integrations.

3. **No changes to auth service** — `auth_service.py` looks up `LotOwnerEmail.email` directly. Adding `given_name`/`surname` to `LotOwnerEmail` does not touch any auth query.

4. **Proxy management unchanged** — `LotProxy` already has `given_name`/`surname`; the `SetProxyRequest` schema and `set_lot_owner_proxy` service function are untouched. The proxy section of the edit modal is also unchanged.

5. **`LotOwner`-level name retained** — `LotOwner.given_name` / `LotOwner.surname` remain (populated by CSV import, displayed in the lot name column). The per-email name in `LotOwnerEmail` is supplementary. This avoids re-writing the importer or the lot name display logic.

---

## Security Considerations

- **Authentication**: All new endpoints are under `/api/admin/*` and are protected by the router-level `require_admin` dependency. No new auth logic needed.
- **Input validation**: `given_name` and `surname` are validated with `max_length=255` in Pydantic. `email` with `max_length=254`. All text fields should be sanitised with `bleach.clean` (consistent with how `_sanitise_description` is used elsewhere) before storage to prevent XSS if names are ever displayed as HTML.
- **Session/cookies**: No change.
- **Secrets**: No new secrets.
- **Rate limiting**: The new endpoints are admin-only CRUD operations; they use the same rate-limiting posture as existing admin endpoints (no dedicated rate limit needed beyond the router-level admin auth).
- **Data exposure**: `owner_emails` (names + emails) is returned only on admin-authenticated routes. The voter-facing auth endpoint (`POST /api/auth/verify`) does not return `LotOwnerEmail` records; it only checks email existence. No voter-facing data exposure change.

---

## Files to Change

| File | Change |
|------|--------|
| `backend/alembic/versions/<new>.py` | Add `given_name VARCHAR NULL` and `surname VARCHAR NULL` to `lot_owner_emails` |
| `backend/app/models/lot_owner_email.py` | Add `given_name` and `surname` mapped columns |
| `backend/app/schemas/admin.py` | Add `LotOwnerEmailOut`, `AddOwnerEmailRequest`, `UpdateOwnerEmailRequest`; extend `LotOwnerOut` with `owner_emails` + backward-compat `emails` computed field |
| `backend/app/services/admin_service.py` | Extend `list_lot_owners` and `get_lot_owner` to fetch name fields; add `add_owner_email_to_lot_owner`, `update_owner_email`, `remove_owner_email_by_id` |
| `backend/app/routers/admin.py` | Add `POST /lot-owners/{id}/owner-emails`, `PATCH /lot-owners/{id}/owner-emails/{email_id}`, `DELETE /lot-owners/{id}/owner-emails/{email_id}` |
| `backend/tests/test_admin_service.py` | Unit tests for new service functions |
| `backend/tests/test_admin_routes.py` | Integration tests for new endpoints |
| `frontend/src/types/index.ts` | Add `LotOwnerEmailEntry` interface; extend `LotOwner` with `owner_emails` |
| `frontend/src/api/admin.ts` | Add `AddOwnerEmailRequest`, `UpdateOwnerEmailRequest` types; add `addOwnerEmailToLotOwner`, `updateOwnerEmail`, `removeOwnerEmailById` functions |
| `frontend/tests/msw/handlers.ts` | Add MSW handlers for the three new owner-email endpoints |
| `frontend/src/components/admin/LotOwnerForm.tsx` | Extend `EditModal` to render `owner_emails` with name+email display and inline edit sub-form; keep proxy section unchanged |
| `frontend/src/components/admin/__tests__/LotOwnerForm.test.tsx` | Update existing tests; add tests for name+email display, inline edit, add-with-name, remove-by-id |

---

## Test Cases

### Unit / Integration (backend)

- **Happy path — add owner email with name**: `POST /lot-owners/{id}/owner-emails` with `{email, given_name, surname}` → 201, response `owner_emails` contains new entry with correct name fields
- **Add owner email without name**: `POST /lot-owners/{id}/owner-emails` with `{email}` only → 201, name fields are `null`
- **Add duplicate email to same lot**: → 409
- **Add to non-existent lot**: → 404
- **Update owner email name only**: `PATCH /lot-owners/{id}/owner-emails/{emailId}` with `{given_name: "Jane"}` → 200, only `given_name` changes
- **Update owner email address**: `PATCH` with `{email: "new@example.com"}` → 200
- **Update to duplicate email**: `PATCH` with email that already exists on this lot → 409
- **Update with no fields**: `PATCH` with empty body → 422
- **Update email record belonging to different lot**: → 404
- **Update non-existent email record**: → 404
- **Delete owner email by ID**: `DELETE /lot-owners/{id}/owner-emails/{emailId}` → 200, entry removed from `owner_emails`
- **Delete non-existent email record**: → 404
- **list_lot_owners returns owner_emails**: assert `owner_emails` list contains `id`, `email`, `given_name`, `surname` for each entry
- **Existing `POST /emails` and `DELETE /emails/{email}` still work**: regression tests unchanged

### Unit / Integration (frontend)

- `addOwnerEmailToLotOwner` sends correct request body and returns updated `LotOwner`
- `updateOwnerEmail` sends PATCH to correct URL with partial body
- `removeOwnerEmailById` sends DELETE to correct URL
- `LotOwnerForm` EditModal renders `owner_emails` list with name + email for each entry
- EditModal "Edit" inline form pre-fills correct values
- EditModal "Save" on inline edit calls `updateOwnerEmail`
- EditModal "Remove" button calls `removeOwnerEmailById`
- EditModal add-owner row validates email required; name optional; calls `addOwnerEmailToLotOwner`
- EditModal renders "— no name —" when `given_name` and `surname` are both null

---

## E2E Test Scenarios

### Existing journeys affected

The Admin persona journey (login → building/meeting management) passes through `BuildingDetailPage` and `LotOwnerForm`. Existing E2E specs for the admin journey must be updated (not replaced) to account for the new `owner_emails` shape in MSW mocks.

### New scenarios

**Scenario 1 — Happy path: add an owner with name and email**
1. Navigate to Building Detail page → open lot owner edit modal for a lot with no owner emails
2. Fill in "Add owner" sub-form: given name = "Jane", surname = "Smith", email = "jane@example.com"
3. Click "Add"
4. Owner card appears in the list showing "Jane Smith" and "jane@example.com"
5. API call `POST /lot-owners/{id}/owner-emails` fires with correct body

**Scenario 2 — Edit an existing owner's name**
1. Open lot owner edit modal for a lot with at least one owner email entry
2. Click "Edit" on an existing owner row → inline edit form appears pre-filled
3. Change given name → click "Save"
4. The row updates to show the new name; `PATCH /lot-owners/{id}/owner-emails/{emailId}` fired

**Scenario 3 — Remove an owner email by ID**
1. Open lot owner edit modal
2. Click "Remove" on an owner row
3. Row disappears; `DELETE /lot-owners/{id}/owner-emails/{emailId}` fired with correct UUID

**Scenario 4 — Duplicate email rejected**
1. Open lot owner edit modal for a lot that already has "jane@example.com"
2. Try to add "jane@example.com" again
3. Error message appears: "Email already exists for this lot owner"
4. No owner row added

**Scenario 5 — Multi-step: create lot, then add owners with names**
1. Click "Add Lot Owner" → fill lot number and entitlement → submit
2. The new lot appears in the table with no owner emails
3. Click "Edit" on the new lot → edit modal opens
4. Add owner "Alice Jones" with email "alice@example.com" via the "Add owner" sub-form
5. Add a second owner "Bob Jones" with email "bob@example.com"
6. Both owner rows are visible in the modal
7. Close modal → lot row in table shows both emails in the Email column (backward-compat `emails` field)

### Vertical slice decomposition

This feature touches backend and frontend independently:
- **Slice A (backend only)**: migration + model + schema + service + router changes + backend tests. Deliverable: the three new endpoints work and return `owner_emails` shape. Frontend still uses old `emails` field — no user-visible change yet.
- **Slice B (frontend only)**: update `types/index.ts`, `api/admin.ts`, MSW handlers, `LotOwnerForm`, and frontend tests. Deliverable: the edit modal renders name+email cards and calls the new endpoints. Depends on Slice A being merged.

---

## Schema Migration Required

Yes — two nullable columns (`given_name`, `surname`) added to `lot_owner_emails`.
