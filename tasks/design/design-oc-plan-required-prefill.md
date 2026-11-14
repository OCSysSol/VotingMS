# Design: Required OC Plan Number and Meeting Prefill
**Status:** Implemented

**PRD reference:** `US-OC-CREATE-02`

## Overview

The `New OC Plan` modal currently places the descriptive Building Name first and treats OC Plan Number as optional. A meeting launched from an OC Plan detail page displays the combined OC Plan/building label in the preselected field. This change makes the legal OC Plan number the first and mandatory manual-create field, validates it in both frontend and API, and makes the meeting form's selected OC Plan field show only the plan number.

## Technical Design

### Database changes

None.

`buildings.oc_plan_number` remains nullable because existing and bulk-imported rows may not have one. New records submitted through `POST /api/admin/buildings` must provide it. A database `NOT NULL` migration would break legacy records and is not required by this story.

### Backend changes

#### Schema

In `backend/app/schemas/admin.py`:

- change `BuildingCreate.oc_plan_number` from optional to required `str`;
- keep `max_length=100`;
- keep the normalizing validator but reject `None` or whitespace-only values with `ValueError("oc_plan_number must not be empty")`.

This makes FastAPI return 422 for missing/blank plan numbers before the router/service runs.

`BuildingUpdate` remains optional so legacy plans can be edited without forcing a backfill.

#### Service and router

In `backend/app/services/admin_service.py`, change `create_building(..., oc_plan_number: str, ...)` and defensively normalize/reject blank input before constructing `Building`. The router can pass the validated field directly.

Bulk import remains unchanged: it can still match/import existing building-name-only data. If product policy later requires OC Plan numbers for newly created import rows, handle that as a separate, explicit import migration to avoid silently breaking existing CSVs.

### Frontend changes

#### `BuildingsPage.tsx` create modal

Reorder fields to:

1. `OC Plan Number` (required)
2. `Building Name` (required)
3. `Manager Email` (required)

The OC Plan input receives:

- `className="field__label field__label--required"`;
- `aria-required="true"` and `required`;
- `id="building-oc-plan-number"`;
- placeholder `e.g. PS345123A`.

Validation executes before Building Name:

```ts
if (!ocPlanNumber.trim()) {
  setFormError("OC Plan number is required.");
  return;
}
```

Submit sends `oc_plan_number: ocPlanNumber.trim()` as a required string. `BuildingCreateRequest.oc_plan_number` in `frontend/src/api/admin.ts` also becomes required. The visible button remains `Create OC Plan`.

Because focus-trap logic uses the first focusable element, the OC Plan input automatically becomes the initial focus. Update tests that currently assume Building Name is first.

The unused/legacy `BuildingForm.tsx`, if retained, should be kept consistent or removed only if source confirms it has no consumers. The actual `BuildingsPage.tsx` modal is the required implementation target.

#### Create General Meeting prefill

`BuildingDetailPage.tsx` continues to navigate with `?building=<building UUID>`; a UUID is required later for `GeneralMeetingCreateRequest.building_id`.

In `CreateGeneralMeetingForm.tsx`, change the combobox display rule from:

```ts
building.oc_plan_number
  ? `${building.oc_plan_number} — ${building.name}`
  : building.name
```

to:

```ts
building.oc_plan_number?.trim() || building.name
```

Apply the same `displayLabel` to dropdown options and the initially resolved selected value. This uses the existing `BuildingSearchCombobox` resolution query; no backend or URL-contract change is needed. Legacy plans without a number continue to fall back to Building Name.

### Key design decisions

- Keep `buildings.id` as the internal meeting FK and URL value. Displaying/accepting plan number does not change relational identity.
- Enforce mandatory plan number at both schema/API and UI layers; browser validation alone is insufficient.
- Keep the database column nullable for compatibility.
- Preserve bulk-import semantics because its source files and matching rules are a separate flow.

## Data Flow

1. Admin opens `New OC Plan`.
2. Focus lands on OC Plan Number.
3. Admin enters plan number, building name, and manager email.
4. UI validates plan number first and posts it as a required string.
5. Backend schema validates/normalises the value and creates the building row with its UUID.
6. Admin opens the new OC Plan detail page and clicks Create General Meeting.
7. Navigation includes the building UUID; the combobox resolves that record and displays only its OC Plan number.
8. On selection/submission, the form still posts the resolved building UUID.

## Security Considerations

- **Authentication:** Existing router-level `require_admin` protects create and lookup endpoints.
- **Input validation:** Trim and reject blank plan numbers; retain length cap of 100; frontend uses the established text input and escaped React rendering.
- **Session/cookies:** No change.
- **Secrets:** None.
- **Rate limiting:** Existing admin import/create protections remain; no additional endpoint is introduced.
- **Data exposure:** Plan numbers are already returned on admin/public building models; no new sensitive field is exposed.

## Files to Change

| File | Change |
|---|---|
| `backend/app/schemas/admin.py` | Require and validate `BuildingCreate.oc_plan_number` |
| `backend/app/services/admin_service.py` | Defensive required validation in `create_building` |
| `backend/app/routers/admin.py` | Pass validated required plan number |
| `frontend/src/api/admin.ts` | Make create-request `oc_plan_number` required |
| `frontend/src/pages/admin/BuildingsPage.tsx` | Swap fields, required marker/validation, trimmed payload |
| `frontend/src/components/admin/CreateGeneralMeetingForm.tsx` | Display only OC Plan number in selected value/options |
| `frontend/src/pages/admin/__tests__/BuildingsPage.test.tsx` | Field order, required error, no API call, focus order |
| `frontend/src/components/admin/__tests__/CreateAGMForm.test.tsx` | URL preselection displays only plan number; fallback test |
| `backend/tests/test_admin_buildings_api.py` | Missing/blank plan number returns 422; valid creation persists |
| `frontend/tests/msw/handlers.ts` | Keep create response/request fixtures aligned with required plan number |
| `e2e_tests/admin/admin-buildings.spec.ts` | New OC Plan field order and mandatory validation |
| `e2e_tests/admin/admin-start-meeting.spec.ts` | Plan-only meeting prefill journey |

## Test Cases

### Unit / Integration

- `POST /api/admin/buildings` with a valid plan number returns 201 and persists it.
- Missing `oc_plan_number` returns 422 with no row created.
- `null` and whitespace-only plan number return 422 with no row created.
- Plan number is trimmed before persistence.
- Existing `PATCH` can still edit/clear a legacy building.
- Modal DOM order is OC Plan Number, Building Name, Manager Email.
- Initial modal focus is OC Plan Number.
- Submitting an empty plan number displays `OC Plan number is required.` and does not call `createBuilding`.
- Valid submit calls `createBuilding` with a non-null trimmed plan number.
- `?building=b1` resolves to `OC-1001` (not `OC-1001 — Alpha Tower`).
- A legacy building with blank plan resolves to its building name.
- Selecting an option still sends the UUID as `building_id`.

### E2E

- Create OC Plan with no plan number -> inline required error -> fill required fields and create -> detail displays plan number.
- Create General Meeting from plan detail -> preselected OC Plan field shows plan number only -> create meeting succeeds.
- Error path: blank legacy plan falls back to Building Name without breaking meeting creation.

## E2E Test Scenarios

### Happy path

Open OC Plans -> New OC Plan -> verify OC Plan Number is first -> create plan `PS123456A` for a building -> open plan detail -> Create General Meeting -> verify OC Plan input shows `PS123456A` -> complete and create the meeting.

### Error / edge cases

- Submit the modal with OC Plan Number blank; focus/error makes the omission clear and no API create occurs.
- Whitespace-only values are rejected.
- A legacy plan with no number still resolves by Building Name.

### State-based

- Existing records with null plan numbers remain readable and editable.
- Creating a subsequent meeting from a plan with a number consistently uses the plan number rather than the shared building name.

### Multi-step sequence

Create new OC Plan -> create meeting from its detail -> verify internal UUID relationship and user-visible plan-number prefill -> return to OC Plans and confirm both records.

### Existing journeys affected

- Admin OC Plan creation and detail journeys.
- Admin Create General Meeting journey.
- Existing `admin-buildings` and `admin-start-meeting` E2E specs must be updated rather than duplicated.

## Vertical Slice Decomposition

Backend validation and frontend form/prefill changes are coupled by the `BuildingCreate` contract but can be implemented as two local slices. Backend tests should land before frontend submission tests to avoid mocking a contract that the server rejects.

## Schema Migration Required

No.
