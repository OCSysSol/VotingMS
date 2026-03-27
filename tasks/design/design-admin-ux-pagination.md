# Design: Admin UX Accessibility and Pagination Fixes

## Overview

This design covers eight targeted improvements from the PRD review recommendations (stories US-ACC-02, US-ACC-06, US-ACC-07, US-ACC-08, RR2-01, RR2-02, RR2-05, RR2-06, RR2-07). No schema migrations are required — all changes are in application code and CSS.

---

## RR2-01: `is_archived` filter in `list_buildings` / `count_buildings`

**Bug:** `GET /api/admin/buildings?is_archived=false` was silently dropping the filter before querying. The `list_buildings` and `count_buildings` service functions accept `is_archived: bool | None` but had no `WHERE` clause for it.

**Fix:** Both `list_buildings()` and `count_buildings()` in `admin_service.py` now apply `q.where(Building.is_archived == is_archived)` when the parameter is not None. The router passes the query param through unchanged.

**No schema change.** The `is_archived` column already exists on `Building`.

---

## RR2-02: Motion number auto-assign 409 conflict

**Bug:** `add_motion_to_meeting()` auto-assigned `motion_number = str(next_display_order)`. If a motion had been manually assigned a number equal to the upcoming display_order (e.g. motion_number="1" manually, then auto-assign computes display_order=1), the unique constraint `uq_motions_general_meeting_motion_number` would fire a 409.

**Fix:** Auto-assign now computes:
```python
max(existing numeric motion_numbers cast to Integer) + 1
```
using a `SELECT MAX(CAST(motion_number AS INTEGER)) WHERE motion_number ~ '^\d+$'` query. This avoids collision with any manually-set numeric motion numbers. Falls back to `str(display_order)` when no existing motions have a purely numeric motion_number.

**No schema change.**

---

## US-ACC-02: Focus trap in modal dialogs

**Component:** `frontend/src/components/vote/SubmitDialog.tsx`

**Pattern:** Custom focus-trap hook inline in the component (no external library needed):
1. On mount: save `document.activeElement` as `previousFocus`, then focus the first focusable element inside the dialog.
2. On unmount: restore `previousFocus.focus()`.
3. `onKeyDown` handler:
   - `Escape` → call `onCancel()`
   - `Tab` from last focusable → wrap to first
   - `Shift+Tab` from first focusable → wrap to last

Focusable selector: `button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`

**No CSS change.** Dialog already has `role="dialog"` and `aria-modal="true"`.

---

## US-ACC-06: Admin nav drawer Escape key dismiss

**Component:** `frontend/src/pages/admin/AdminLayout.tsx`

**Pattern:**
- Add `useRef<HTMLButtonElement>` for the hamburger/menu open button.
- Add `useEffect` that attaches `document.addEventListener("keydown", handler)` when `isNavOpen` changes.
- Handler: if `e.key === "Escape" && isNavOpen` → `setIsNavOpen(false)` + `menuButtonRef.current?.focus()`.
- Clean up listener on unmount/re-run.

---

## US-ACC-07: Skip-to-main-content link

**Components:**
- `frontend/src/components/vote/VoterShell.tsx` — voter-facing pages
- `frontend/src/pages/admin/AdminLayout.tsx` — admin pages

**Pattern:**
```tsx
<a href="#main-content" className="skip-link">Skip to main content</a>
```
placed as the first focusable element before the header/nav. The `<main>` element receives `id="main-content"`.

**CSS added** to `frontend/src/styles/index.css`:
```css
.skip-link {
  position: absolute;
  left: -9999px;  /* hidden off-screen */
  top: 8px;
  z-index: 9999;
  /* ... */
}
.skip-link:focus {
  left: 8px;  /* visible on focus */
}
```

---

## US-ACC-08: Required field markers on forms

**Components:** `AuthForm.tsx`, `BuildingsPage.tsx` (New Building modal)

**Pattern:**
- Add `<span aria-hidden="true">*</span>` after label text for required fields.
- Add `aria-required="true"` and native `required` attribute on the `<input>` element.
- Screen readers read label text only (asterisk is `aria-hidden`), but the `aria-required` attribute communicates requirement programmatically.

---

## RR2-05: Pagination ARIA attributes

**Component:** `frontend/src/components/admin/Pagination.tsx`

**Changes:**
- Wrap in `<nav aria-label="Pagination">` instead of `<div>`.
- Add `aria-live="polite"` to the results count `<span>`.
- Add `aria-label="Go to page N"` to each numbered page button.
- `aria-current="page"` already existed on the active page button.
- Add `aria-disabled={page === 1 || isLoading}` to Previous/Next buttons.
- Accept optional `isLoading?: boolean` prop to disable controls during fetch.

---

## RR2-06: Pagination state in URL search params

**Components:** `BuildingsPage.tsx`, `GeneralMeetingListPage.tsx`

**Pattern:** Both pages now:
1. Read initial page from `searchParams.get("page")` parsed as integer (default 1).
2. `handlePageChange(newPage)` updates URL with `setSearchParams(next, { replace: true })`. Page 1 removes the `page` param to keep URLs clean.
3. Filter changes (building, status, show-archived toggle) delete the `page` param to reset to page 1.

**No API changes.** The existing `offset` computation uses the page value as before.

---

## RR2-07: Loading indicator on page change

**Components:** `BuildingsPage.tsx`, `GeneralMeetingListPage.tsx`, `Pagination.tsx`

**Pattern:**
- The `isLoading` flag from `useQuery` is passed to the `Pagination` component, which disables all buttons when loading (prevents double-click race).
- The table/list area is wrapped in a `<div style={{ opacity: isLoading ? 0.5 : 1, transition: "opacity 0.15s" }}>` to give a visible loading cue while preserving layout stability.

The existing `BuildingTable` / `GeneralMeetingTable` components already handle their own `isLoading` skeleton state for the initial load; the opacity fade is specifically for subsequent page-change fetches.

---

## No schema migrations required

All changes are in:
- `backend/app/services/admin_service.py` — RR2-01 (already done), RR2-02
- `frontend/src/components/admin/Pagination.tsx` — RR2-05, RR2-07
- `frontend/src/components/vote/SubmitDialog.tsx` — US-ACC-02
- `frontend/src/components/vote/AuthForm.tsx` — US-ACC-08
- `frontend/src/components/vote/VoterShell.tsx` — US-ACC-07
- `frontend/src/pages/admin/AdminLayout.tsx` — US-ACC-06, US-ACC-07
- `frontend/src/pages/admin/BuildingsPage.tsx` — RR2-06, RR2-07, US-ACC-08
- `frontend/src/pages/admin/GeneralMeetingListPage.tsx` — RR2-06, RR2-07
- `frontend/src/styles/index.css` — skip-link CSS (US-ACC-07)
