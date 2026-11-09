# Data Retention & Lifecycle Policy

## 1. Overview & Purpose

This document outlines the authoritative data retention, deletion, archival, and anonymization policy for the AGM Voting App platform. It establishes the legal compliance and operational governance rules necessary to satisfy corporate governance mandates, privacy regulations, and audit requirements across all tenant jurisdictions.

This policy implements and enforces the requirements specified in **US-VIL-07** of [`tasks/prd/prd-review-recommendations.md`](../tasks/prd/prd-review-recommendations.md).

---

## 2. Statutory Retention Requirements

In accordance with strata title legislation, body corporate governance laws, and corporate recordkeeping standards:

1. **7-Year Minimum Statutory Retention:**
   - All **General Meeting records** (`general_meetings`), including titles, scheduled times, quorum rules, and meeting status transitions.
   - All **snapshotted unit entitlements and weights** (`general_meeting_lot_weights`), capturing the exact financial and entitlement position at meeting creation.
   - All **ballot submissions** (`ballot_submissions`), submission timestamps, submitter emails, and proxy designations.
   - All **recorded votes** (`votes`), motion choices (`for`, `against`, `abstained`, `selected`), and multi-choice option selections.
   - Must be retained in a fully queryable and defensible state for a minimum of **seven (7) years** from the official date of meeting closure (`closed_at`).

2. **Indefinite Retention:**
   - Building metadata (`buildings`) and general meeting structural metadata are preserved indefinitely to maintain the long-term governance history of the scheme.

---

## 3. Prohibition of Hard Deletion on Closed or Active Meetings

To prevent tampering and ensure legal non-repudiation:

- **Hard Deletion Guard:** No database record or API endpoint may perform a hard `DELETE` or cascade delete on any General Meeting that has:
  1. Reached `closed` status, or
  2. One or more recorded `BallotSubmission` or `Vote` records.
- **Ballot Reset Restrictions:**
  - The endpoint `POST /api/admin/general-meetings/{id}/reset-ballots` is strictly restricted to automated end-to-end testing environments.
  - In production deployments, this endpoint is permanently disabled via the environment guard (`ENABLE_BALLOT_RESET=false` or omitted), returning HTTP 403 Forbidden.
- **Building Deletion Safeguards:**
  - In accordance with US-VIL-07, invoking `DELETE /api/admin/buildings/{id}` on an archived building returns a compliance warning in the response payload if the building contains meetings closed less than 7 years ago. The caller remains legally accountable for statutory compliance.

---

## 4. Audit Logging & Non-Repudiation Guarantees

The platform enforces data integrity through the following non-repudiation mechanisms:

1. **Cryptographic Ballot Hashes (US-VIL-03):**
   - Each ballot submission generates a canonical SHA-256 hash derived deterministically from the meeting ID, lot owner ID, and sorted vote choices (`ballot_hash`).
   - Any post-submission modification of recorded choices causes verification checks (`verify_ballot_hash`) to fail.
2. **Immutable Proxy Audit Trail (US-VIL-06):**
   - Proxied votes permanently record the submitting proxy's email in `BallotSubmission.proxy_email`.
   - Historical `LotProxy` appointments at vote time are retained indefinitely for audit verification.
3. **UTC Offset Timestamps (US-VIL-08):**
   - All audit logs, meeting transition events, and ballot submission timestamps are stored in UTC with timezone offset preserved, providing unambiguous chronology across international and daylight-saving boundaries.

---

## 5. Post-Statutory Expiration: Archival & PII Anonymization

Following the expiration of the 7-year statutory retention period from a meeting's closure date:

### 5.1 Data Archival
- Historical meetings older than 7 years may be transitioned to a cold-storage read-only tier or archived database schema to optimize operational database indexing and query performance.

### 5.2 PII Anonymization Procedure
While vote tallies, unit entitlement weights, and motion outcomes remain permanently immutable for corporate history, Personally Identifiable Information (PII) of voters may be sanitized upon request or statutory schedule:

- **Specification of Anonymization Endpoint:**
  - `POST /api/admin/general-meetings/{id}/anonymise`
  - **Access Control:** Restricted strictly to super-administrator credentials and requires a two-factor confirmation token.
  - **Eligibility Verification:** Validates that `general_meeting.status == 'closed'` and `closed_at <= NOW() - INTERVAL '7 years'`. Returns HTTP 400 if the meeting is still within its statutory retention window.
  - **Execution:**
    1. Replaces `voter_email` and `proxy_email` in `BallotSubmission` with pseudo-anonymized hashes (e.g. `anon-voter-<uuid>@redacted.internal`).
    2. Anonymizes person contact fields (`first_name`, `last_name`, `email`, `phone`) in historical meeting snapshots where the individual no longer owns lots in the building.
    3. Preserves `lot_number`, snapshotted `unit_entitlement`, and `ballot_hash` to ensure mathematical tally verification remains 100% intact without disclosing voter identity.

---

## 6. Roles & Responsibilities

| Role | Responsibility |
|---|---|
| **System Operator / SRE** | Ensure automated backups and point-in-time recovery are retained in compliance with the 7-year lifecycle; verify encryption at rest. |
| **Building Manager / Admin** | Comply with statutory retention requirements before archiving or requesting building deletion. |
| **Auditor / Compliance Officer** | Inspect ballot cryptographic hashes and proxy audit logs during post-AGM reviews. |
