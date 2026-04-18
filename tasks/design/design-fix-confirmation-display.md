# Design: Fix Confirmation Display

**Status:** Implemented

Two bug fixes for the voter confirmation page and the admin meeting results view.

---

## Overview

### Fix 1 — Ballot confirmation page: multi-choice option ordering

On the voter's ballot confirmation page (`/vote/:meetingId/confirmation`), the `option_choices` list inside each `BallotVoteItem` for a multi-choice motion is returned in an undefined order determined by DB row iteration. Voters see their chosen options in a different sequence from the order shown during voting and in the admin results view. The sort key used everywhere else is `MotionOption.display_order`.

### Fix 2 — Admin meeting results view: show voter name + email

In the admin results page (`AGMReportView`), the voter list drill-down tables (binary and multi-choice) show only `voter_email`. The building owner list page shows names in the format `"Given Surname <email@example.com>"` — retrieved from `LotOwnerEmail.given_name` and `LotOwnerEmail.surname`. The admin results view should match this format so admins can identify voters by name.

---

## Technical Design

### Fix 1 — Backend: sort `option_choices` by `display_order`

**Root cause:** In `get_my_ballot()` (`backend/app/services/voting_service.py`), `selected_option_ids` are batch-loaded without an ORDER BY:

```python
opts_result = await db.execute(
    select(MotionOption).where(MotionOption.id.in_(selected_option_ids))
)
options_by_id = {opt.id: opt for opt in opts_result.scalars().all()}
```

The `option_choices` list on `BallotVoteItem` is built by iterating over vote rows in `votes_result` order (ordered by `Motion.display_order, Vote.created_at`), not by `MotionOption.display_order`. Multiple `Vote` rows for the same multi-choice motion are appended to `existing_item.option_choices` in arrival order.

**Fix:** After constructing the `BallotVoteItem` for a multi-choice motion (i.e., after all vote rows for that motion have been processed), sort its `option_choices` list by `MotionOption.display_order`. The `options_by_id` dict already holds the `MotionOption` objects including `display_order`, so no additional query is needed.

The sort is applied at the point where each `LotBallotSummary` is assembled — after the per-lot vote loop — by iterating `lot_votes_by_motion.values()` and sorting each item's `option_choices`:

```python
# Sort option_choices by display_order for multi-choice items
for item in lot_votes_by_motion.values():
    item.option_choices.sort(
        key=lambda oc: options_by_id[oc.option_id].display_order
        if oc.option_id in options_by_id else 0
    )
```

This matches the sort order used by:
- `list_motions` in `voting.py` (`.order_by(MotionOption.display_order)`)
- `get_general_meeting_detail` in `admin_service.py` (`.order_by(MotionOption.display_order)`)

No schema migration required. No frontend change required for Fix 1.

### Fix 2 — Backend: add `voter_name` to voter list entries

**Root cause:** `_lots()` in `get_general_meeting_detail()` builds entries containing `voter_email` but no name. The batch query at line ~1694 loads only `lot_owner_id, email` from `LotOwnerEmail`, discarding `given_name` and `surname`.

**Fix (backend):**

1. Extend the batch email query to also select `given_name` and `surname`:

```python
batch_emails_result = await db.execute(
    select(
        LotOwnerEmail.lot_owner_id,
        LotOwnerEmail.email,
        LotOwnerEmail.given_name,
        LotOwnerEmail.surname,
    ).where(
        LotOwnerEmail.lot_owner_id.in_(list(lot_entitlement.keys()))
    )
)
```

2. Store a per-lot `voter_name` in `lot_info` — defined as the name from the `LotOwnerEmail` record that matches `voter_email`. Because one lot may have multiple email addresses, look up the matching row. Build a `lot_owner_email_to_name` dict mapping `(lot_owner_id, email) -> display_name` where `display_name = "Given Surname"` (concatenated, stripped) or `None` if both fields are absent.

3. In `_lots()`, look up the display name from `lot_owner_email_to_name` using `(lid, voter_email)` and add it as `voter_name` to the result dict:

```python
result_list.append({
    "voter_email": voter_email,
    "voter_name": lot_owner_email_to_name.get((lid, voter_email)),
    "lot_number": info["lot_number"],
    ...
})
```

4. The same lookup is needed for the absent-lot path (which uses `absent_sub.voter_email`). For absent lots, `voter_name` is included using the same dict lookup.

The fallback path (when `lot_entitlement` is empty and `fallback_owners` is used) must also be extended to load `given_name` and `surname` in the fallback email query.

**Fix (frontend):**

1. Add `voter_name?: string | null` to the `VoterEntry` interface in `frontend/src/api/admin.ts`.

2. In `AGMReportView.tsx`, update both `BinaryVoterList` and the expanded drill-down inside `MultiChoiceOptionRows` to show name + email in the same format used by `LotOwnerTable.tsx`:

```
Given Surname <email@example.com>   (when name is present)
email@example.com                   (when name is absent)
```

Concretely, replace:
```tsx
{voter.voter_email ?? "—"}
```
with:
```tsx
{voter.voter_name
  ? `${voter.voter_name} <${voter.voter_email ?? ""}>`
  : (voter.voter_email ?? "—")}
```

The `proxy_email` indicator `(proxy)` shown beside the email should remain, placed after the combined display string.

3. Update the CSV export in `handleExportCSV()` to use the same `voter_name + <email>` format in the `emailCell` string so exported data is consistent with what is displayed.

No schema migration required. The `LotOwnerEmail` table already has `given_name` and `surname` columns.

---

## Security Considerations

No security implications. Both fixes only affect read-path display logic. The `voter_name` field is derived from `LotOwnerEmail.given_name`/`surname` which are already stored and returned in other admin responses (e.g., `LotOwnerOut`). No new endpoints, no new input surfaces, no privilege escalation.

---

## Files to Change

| File | Change |
|---|---|
| `backend/app/services/voting_service.py` | Fix 1: after the per-lot vote loop, sort `option_choices` on each `BallotVoteItem` in `lot_votes_by_motion` by `MotionOption.display_order` using `options_by_id`. |
| `backend/app/services/admin_service.py` | Fix 2: extend batch email query to select `given_name, surname`; build `lot_owner_email_to_name` dict; add `voter_name` field to `_lots()` output; apply same change to absent-lot path and fallback path. |
| `frontend/src/api/admin.ts` | Fix 2: add `voter_name?: string | null` to `VoterEntry` interface. |
| `frontend/src/components/admin/AGMReportView.tsx` | Fix 2: update `BinaryVoterList` and `MultiChoiceOptionRows` expanded tables to display `"Given Surname <email>"` format; update CSV export to match. |

---

## Test Cases

### Fix 1 — Unit tests (`backend/tests/`)

- `test_get_my_ballot_multi_choice_options_ordered_by_display_order`: create a multi-choice motion with 3 options in a specific display_order, submit votes in reverse option order, call `get_my_ballot`, assert `option_choices` in the response are sorted by `display_order` ascending.
- `test_get_my_ballot_multi_choice_abstain_no_option_choices`: abstained multi-choice vote returns empty `option_choices` — sort is a no-op, no crash.

### Fix 1 — Frontend tests (`frontend/`)

- No frontend change for Fix 1, so no frontend test changes needed.
- The existing `ConfirmationPage` tests should be updated to include a multi-choice motion fixture with options in non-`display_order` sequence and assert the rendered option list matches `display_order`.

### Fix 2 — Unit tests (`backend/tests/`)

- `test_get_general_meeting_detail_voter_list_includes_name`: create a lot owner with `given_name`/`surname` on their `LotOwnerEmail`, submit a ballot, call `get_general_meeting_detail`, assert voter list entries contain `voter_name = "Given Surname"`.
- `test_get_general_meeting_detail_voter_list_name_absent_when_no_name`: create a lot owner with no `given_name`/`surname`, assert `voter_name` is `None` (not an error).
- `test_get_general_meeting_detail_absent_voter_name`: closed meeting, absent lot with named email, assert `voter_name` is populated in the absent voter list.

### Fix 2 — Frontend tests (`frontend/`)

- `AGMReportView` tests: update mock `VoterEntry` data to include `voter_name`; assert that when `voter_name` is present, the cell renders `"Given Surname <email>"`.
- `AGMReportView` tests: when `voter_name` is absent/null, cell renders just `email`.
- `AGMReportView` CSV export test: assert exported row contains `voter_name <email>` format when name is present.

---

## Schema Migration Required

**No** — no new columns or tables. Both fixes are query-layer and display-layer changes only.

---

## E2E Test Scenarios

### Fix 1 — Confirmation page option ordering

**Happy path:**
1. Admin creates a multi-choice motion with options in a known order (Option A = display_order 1, Option B = display_order 2, Option C = display_order 3).
2. Voter authenticates, votes (selecting options in reverse order: C then A).
3. Voter submits ballot and lands on confirmation page.
4. Assertion: `option_choices` on the confirmation page are listed in display_order sequence (A, C appear in ascending display_order, not in selection order).

**Existing E2E specs affected:** The voter journey spec (`WF*` / voting flow spec) covers the confirmation page. The multi-choice voting scenario within that spec must be updated to assert option ordering.

### Fix 2 — Admin results: name + email display

**Happy path:**
1. Admin creates a building with a lot owner whose `LotOwnerEmail` has `given_name = "Jane"`, `surname = "Smith"`.
2. Voter (jane.smith@example.com) votes.
3. Admin opens the meeting results page and expands the voter drill-down for a motion.
4. Assertion: the voter row shows `"Jane Smith <jane.smith@example.com>"`.

**No-name path:**
1. Lot owner has no `given_name`/`surname`.
2. Voter votes; admin views results.
3. Assertion: voter row shows only `"voter@example.com"` (no angle brackets, no empty prefix).

**Existing E2E specs affected:** The admin journey spec covering meeting results / voter drill-down must be updated. Any E2E spec that asserts the content of voter list cells in `AGMReportView` must be updated to expect the new format.

### Multi-step sequence

1. Import a lot owner with a name via the lot owner import flow.
2. Open a meeting and cast votes for that lot owner.
3. Close the meeting.
4. Navigate to the results page and expand voter details.
5. Assert the voter's name appears in the correct format in both the binary and multi-choice drill-down sections.

This sequence validates the full data path: import → snapshot → vote → results display.

---

## Vertical Slice Decomposition

Fix 1 (backend-only) and Fix 2 (backend + frontend) are independent and can be implemented in parallel on separate branches if needed. They share no state and touch disjoint code paths. However, given the small scope of both fixes, a single branch is appropriate.
