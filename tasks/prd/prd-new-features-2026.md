# PRD: New Features 2026

## Introduction

This PRD tracks new features planned for 2026. These features extend the AGM Voting App to improve the experience for co-owners, proxy voters, and admins.

---

## Goals

- Allow all lot co-owners to see the submitted ballot on the confirmation page, regardless of which email submitted it.
- Expose submitter and proxy identity on the ballot receipt for audit clarity.

---

## User Stories

### US-MOV-01: All Lot Co-Owners See Submitted Ballot ✅ Implemented

**Description:** As a lot co-owner with a different email than the person who submitted the ballot, I want to see the submitted ballot on the confirmation page so that I can verify what was voted on behalf of my lot.

**Acceptance Criteria:**

- [x] `GET /api/general-meeting/{id}/my-ballot` resolves all `lot_owner_id` values for the authenticated voter's email (direct + proxy) in this building
- [x] Ballot submissions are returned for any of those lots, regardless of which email submitted them
- [x] `LotBallotSummary` includes `submitter_email` (the email that submitted) and `proxy_email` (set if proxy submitted)
- [x] Vote rows are fetched by `lot_owner_id` only — not filtered by `voter_email` — so co-owner B sees votes cast by co-owner A
- [x] Confirmation page renders "This ballot was submitted by {submitter_email}" for each lot
- [x] When `proxy_email` is set, renders "Submitted via proxy by {proxy_email}" instead
- [x] Voter with no associated lots gets 404
- [x] All tests pass at 100% coverage
- [x] Typecheck/lint passes

---

## Non-Goals

- Changing who can submit a ballot (submission still restricted to the authenticated voter's own lots and proxy lots).
- Exposing submitter identity in the admin tally view.

---

## Technical Considerations

- `BallotSubmission.voter_email` = the email that actually submitted (may differ from the authenticated viewer's email for co-owners).
- `BallotSubmission.proxy_email` = set only when a proxy submitted (equals the proxy's email).
- The vote query in `get_my_ballot` must not filter by `voter_email` — it must filter only by `lot_owner_id` to return votes cast by any email for that lot.

---

## Success Metrics

- Co-owner B can see Lot A's ballot after co-owner A submits.
- Proxy-submitted ballots show "Submitted via proxy by {proxy_email}" on confirmation page.
