# Technical Design: Add Motions After Meeting Creation

## Overview

This feature adds a backend endpoint and a frontend inline form so admins can add new motions to an existing General Meeting while it is `pending` or `open`. Adding to a `closed` meeting is blocked with 409.

**PRD:** `tasks/prd/prd-add-motions-post-create.md` (US-AM01, US-AM02)

**Schema migration needed: NO** — all required columns already exist on the `motions` table.

---

## Database Changes

None. The `motions` table already has:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK, auto-generated |
| `general_meeting_id` | UUID FK | References `general_meetings.id`, CASCADE DELETE |
| `title` | String | NOT NULL |
| `description` | Text | nullable |
| `order_index` | Integer | NOT NULL; unique per meeting via `uq_motions_general_meeting_order` |
| `motion_type` | Enum(MotionType) | `general` or `special`; default `general` |
| `is_visible` | Boolean | NOT NULL; DB default `true`; service must explicitly set `false` |

The unique constraint `uq_motions_general_meeting_order` on `(general_meeting_id, order_index)` already exists and is safe as long as the service always uses `MAX(order_index) + 1`.

---

## Backend Changes

### 1. New schema: `MotionAddRequest` in `backend/app/schemas/admin.py`

Add a new Pydantic model for the request body. The existing `MotionCreate` schema requires `order_index` to be supplied by the caller — the new schema omits it because `order_index` is auto-assigned:

```python
class MotionAddRequest(BaseModel):
    title: str
    description: str | None = None
    motion_type: MotionType = MotionType.general

    @field_validator("title")
    @classmethod
    def title_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be empty")
        return v
```

The existing `MotionOut` schema is the response type and requires no changes:

```python
class MotionOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    order_index: int
    motion_type: MotionType
    is_visible: bool = True
    model_config = {"from_attributes": True}
```

### 2. New service function: `add_motion_to_meeting` in `backend/app/services/admin_service.py`

Location: in the `# General Meetings` section, alongside `create_general_meeting`, `close_general_meeting`, etc.

```python
async def add_motion_to_meeting(
    general_meeting_id: uuid.UUID,
    data: MotionAddRequest,
    db: AsyncSession,
) -> dict:
```

Logic:

1. Load the `GeneralMeeting` by `general_meeting_id`. If not found, raise `HTTPException(404, "General Meeting not found")`.
2. Check `get_effective_status(meeting)`. If `closed`, raise `HTTPException(409, "Cannot add a motion to a closed meeting")`.
3. Query `SELECT MAX(order_index) FROM motions WHERE general_meeting_id = ?`. If result is `None` (no motions exist), use `next_order_index = 0`; otherwise `next_order_index = max_order_index + 1`.
4. Create `Motion(general_meeting_id=general_meeting_id, title=data.title.strip(), description=data.description, order_index=next_order_index, motion_type=data.motion_type, is_visible=False)`.
5. `db.add(motion)` → `await db.commit()` → `await db.refresh(motion)`.
6. Return a dict matching `MotionOut` shape:
   ```python
   {
       "id": motion.id,
       "title": motion.title,
       "description": motion.description,
       "order_index": motion.order_index,
       "motion_type": motion.motion_type.value if hasattr(motion.motion_type, "value") else motion.motion_type,
       "is_visible": motion.is_visible,
   }
   ```

### 3. New router endpoint in `backend/app/routers/admin.py`

Location: in the `# Motions` section, after the existing `toggle_motion_visibility_endpoint` and before `# General Meetings`.

Import additions to `admin.py`:
- Add `MotionAddRequest` and `MotionOut` to the `from app.schemas.admin import ...` block.

Endpoint:

```python
@router.post(
    "/general-meetings/{general_meeting_id}/motions",
    response_model=MotionOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_motion_to_meeting_endpoint(
    general_meeting_id: uuid.UUID,
    data: MotionAddRequest,
    db: AsyncSession = Depends(get_db),
) -> MotionOut:
    """Add a new motion to an existing General Meeting.

    Returns 201 with the created motion.
    Returns 404 if the meeting does not exist.
    Returns 409 if the meeting is closed.
    """
    result = await admin_service.add_motion_to_meeting(general_meeting_id, data, db)
    return MotionOut(**result)
```

### 4. Tests

**File:** `backend/tests/test_admin_add_motion.py` (new file)

Test categories:

```
# --- Happy path ---
# add motion to open meeting → 201, is_visible=False, correct order_index
# add motion to pending meeting → 201
# motion_type defaults to general
# order_index is max+1 when meeting already has motions
# order_index is 0 when meeting has no motions

# --- Input validation ---
# missing title → 422
# blank title → 422
# unknown motion_type → 422
# extra fields in body → ignored (Pydantic default)

# --- State / precondition errors ---
# closed meeting → 409
# meeting not found → 404

# --- Edge cases ---
# add multiple motions sequentially → order_indexes are 0,1,2 with no constraint violation
# description is null when not provided
```

---

## Frontend Changes

### 1. New API function in `frontend/src/api/admin.ts`

Add a new request interface and API function. The existing `MotionOut` interface already exists in this file and is the return type.

New interface:

```typescript
export interface AddMotionRequest {
  title: string;
  description: string | null;
  motion_type: MotionType;
}
```

New function (add after `toggleMotionVisibility`):

```typescript
export async function addMotionToMeeting(
  meetingId: string,
  data: AddMotionRequest,
): Promise<MotionOut> {
  return apiFetch<MotionOut>(`/api/admin/general-meetings/${meetingId}/motions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
```

### 2. Changes to `frontend/src/pages/admin/GeneralMeetingDetailPage.tsx`

**Import change:** Add `addMotionToMeeting` and `AddMotionRequest` to the import from `../../api/admin`.

**New state variables** (alongside existing `visibilityErrors`, `pendingVisibilityMotionId`):

```typescript
const [showAddMotionForm, setShowAddMotionForm] = useState(false);
const [addMotionError, setAddMotionError] = useState<string | null>(null);
```

**New mutation:**

```typescript
const addMotionMutation = useMutation({
  mutationFn: (data: AddMotionRequest) => addMotionToMeeting(meetingId!, data),
  onSuccess: () => {
    setShowAddMotionForm(false);
    setAddMotionError(null);
    void queryClient.invalidateQueries({ queryKey: ["admin", "general-meetings", meetingId] });
  },
  onError: (error: Error) => {
    setAddMotionError(error.message || "Failed to add motion");
  },
});
```

**Inline form component** (rendered inside `GeneralMeetingDetailPage`, below the `<h2>Motion Visibility</h2>` heading):

The "Add Motion" button is only rendered when `meeting.status !== "closed"`:

```tsx
{meeting.status !== "closed" && (
  <button
    type="button"
    className="btn btn--primary"
    onClick={() => { setShowAddMotionForm(true); setAddMotionError(null); }}
  >
    Add Motion
  </button>
)}
```

When `showAddMotionForm` is `true`, an inline form is shown. The form contains:

- `<input type="text" ... aria-label="Title" />` (required)
- `<textarea aria-label="Description" />` (optional)
- `<select aria-label="Motion Type">` with `<option value="general">General</option>` and `<option value="special">Special</option>`
- `<button type="submit" disabled={addMotionMutation.isPending}>Save Motion</button>`
- `<button type="button" onClick={() => setShowAddMotionForm(false)}>Cancel</button>`

On form submit:
1. If title is blank, show local validation error without calling the API.
2. Otherwise call `addMotionMutation.mutate({ title, description: description || null, motion_type })`.

If `addMotionError` is set, show it in a `role="alert"` span.

**Section structure after change:**

```
<h2>Motion Visibility</h2>
<div>
  {meeting.status !== "closed" && <button>Add Motion</button>}
  {showAddMotionForm && <form>…</form>}
  {addMotionError && <span role="alert">{addMotionError}</span>}
  {meeting.motions.length === 0 ? <p>No motions.</p> : <table>…</table>}
</div>
```

### 3. Test changes to `frontend/src/pages/admin/__tests__/GeneralMeetingDetailPage.test.tsx`

Add a new describe block `"Add Motion form"` with the following tests:

```
# --- Happy path ---
# "Add Motion" button is visible for open meeting
# "Add Motion" button is visible for pending meeting
# clicking Add Motion shows the inline form
# submitting the form with valid data calls the API and closes the form
# after successful submission, the meeting detail query is invalidated

# --- Input validation ---
# submitting with blank title shows validation error without calling API

# --- State / precondition errors ---
# "Add Motion" button is NOT shown for closed meeting
# API error is shown inline when submission fails

# --- Edge cases ---
# Cancel button hides the form without calling the API
# Save button is disabled while mutation is pending
```

New MSW handler needed in `tests/msw/handlers.ts` (or equivalent):

```typescript
http.post("/api/admin/general-meetings/:meetingId/motions", () => {
  return HttpResponse.json({
    id: "motion-new",
    title: "New Motion",
    description: null,
    order_index: 3,
    motion_type: "general",
    is_visible: false,
  }, { status: 201 });
})
```

---

## Key Design Decisions

### `is_visible = false` on creation

The `Motion` model has `default=True` and `server_default=sa.text("true")`. The service function must explicitly pass `is_visible=False` when constructing the `Motion` object. This is a deliberate override — new motions added post-creation should not be visible until the admin explicitly publishes them via the existing visibility toggle.

### `order_index` auto-assignment

Use `SELECT MAX(order_index) FROM motions WHERE general_meeting_id = ?`:
- If `NULL` (no motions), assign `0`.
- Otherwise assign `max + 1`.

This guarantees the `uq_motions_general_meeting_order` unique constraint on `(general_meeting_id, order_index)` is never violated. No locking is needed for the expected load (admin-only, single concurrent admin).

### Closed-meeting guard uses `get_effective_status`

The existing codebase uses `get_effective_status(meeting)` rather than `meeting.status` directly throughout motion visibility and meeting management code. This function accounts for time-based auto-close (when `voting_closes_at` has passed). The new service function must follow the same pattern.

### `MotionAddRequest` vs `MotionCreate`

The existing `MotionCreate` schema requires the caller to supply `order_index`. It is used only in `GeneralMeetingCreate` (batch creation at meeting setup time) and must not be changed. A separate `MotionAddRequest` schema is introduced that omits `order_index`, keeping concerns separate.

### No `MotionOut.is_visible` default override

`MotionOut` already has `is_visible: bool = True` as a field default. The service returns `is_visible: False` explicitly in the dict, so the response will always reflect `False` for newly created motions regardless of the schema default.

---

## Data Flow: Happy Path

1. Admin is on `/admin/general-meetings/{meetingId}` viewing an open or pending meeting.
2. Admin clicks "Add Motion" button.
3. Inline form appears with empty fields and Motion Type = General.
4. Admin enters a title (e.g. "Motion 4"), optional description, selects Special.
5. Admin clicks "Save Motion".
6. `addMotionMutation.mutate({ title: "Motion 4", description: null, motion_type: "special" })` is called.
7. Frontend POSTs to `POST /api/admin/general-meetings/{meetingId}/motions`.
8. Router calls `admin_service.add_motion_to_meeting(general_meeting_id, data, db)`.
9. Service:
   a. Loads meeting — found, status is open.
   b. `get_effective_status` → `open`, not closed.
   c. Queries `MAX(order_index)` for the meeting → result is `2` (3 existing motions at indices 0,1,2).
   d. Creates `Motion(…, order_index=3, is_visible=False)`.
   e. Commits and returns dict.
10. Router returns `MotionOut` with `order_index=3, is_visible=false` and HTTP 201.
11. `addMotionMutation.onSuccess` fires: form is hidden, `queryClient.invalidateQueries` triggers a refetch of the meeting detail.
12. Meeting detail refetches; the table now shows 4 motions, the new one at position 4 with a "Hidden" badge.

---

## E2E Test Scenarios

Key Playwright scenarios to cover (add to existing voter/admin E2E spec or create `e2e/admin-add-motion.spec.ts`):

| Scenario | Steps | Expected outcome |
|---|---|---|
| Add motion to open meeting | Auth as admin → open meeting detail → click "Add Motion" → fill form → Save | Motion appears in table, Hidden badge, no page reload required |
| Add motion to pending meeting | Auth as admin → pending meeting detail → click "Add Motion" → fill form → Save | Motion appears in table, Hidden badge |
| Form cancel | Click "Add Motion" → click "Cancel" | Form disappears, no new motion in table |
| Blank title validation | Click "Add Motion" → leave Title empty → click "Save Motion" | Inline validation error shown, no API call made, form remains open |
| Motion type defaults to General | Submit form without changing Motion Type select | New motion has `motion_type = general` |
| Visibility toggle after adding | Add motion → toggle its visibility switch to Visible | Motion is now visible (Visible badge) |
| No "Add Motion" on closed meeting | Navigate to a closed meeting detail | "Add Motion" button is absent |
| Order index increments correctly | Add three motions sequentially | order_indexes are max_existing+1, max_existing+2, max_existing+3 respectively |
