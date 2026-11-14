"""Tests for the shared meeting-results PDF renderer."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from io import BytesIO

from pypdf import PdfReader

from app.services.report_pdf_service import (
    format_voter_display,
    generate_meeting_results_pdf,
    report_pdf_filename,
)


class _EnumValue(str, Enum):
    VALUE = "enum-value"


def _voter(**kwargs) -> dict:
    voter = {
        "voter_email": "owner@example.com",
        "voter_name": None,
        "lot_number": "1",
        "entitlement": 100,
        "proxy_email": None,
        "submitted_by_admin": False,
        "submitted_at": datetime(2026, 1, 2, 3, 4, tzinfo=UTC),
    }
    voter.update(kwargs)
    return voter


def _binary_detail(*, voters: list[dict] | None = None) -> dict:
    voters = voters or [_voter()]
    return {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "building_name": "Harbour Tower",
        "oc_plan_number": "PS123456A",
        "title": "Annual General Meeting / 2026",
        "status": "closed",
        "meeting_at": datetime(2026, 1, 2, 3, 4, tzinfo=UTC),
        "voting_closes_at": datetime(2026, 1, 2, 4, 4, tzinfo=UTC),
        "total_eligible_voters": len(voters),
        "total_submitted": len(voters),
        "total_entitlement": sum(v["entitlement"] for v in voters),
        "motions": [
            {
                "id": uuid.uuid4(),
                "title": "Adopt <budget> & plan",
                "description": "Line one\nLine two & <script>",
                "display_order": 1,
                "motion_number": "M-1",
                "motion_type": "general",
                "is_multi_choice": False,
                "option_limit": None,
                "tally": {
                    "yes": {"voter_count": len(voters), "entitlement_sum": 100},
                    "no": {"voter_count": 0, "entitlement_sum": 0},
                    "abstained": {"voter_count": 0, "entitlement_sum": 0},
                    "absent": {"voter_count": 0, "entitlement_sum": 0},
                    "not_eligible": {"voter_count": 0, "entitlement_sum": 0},
                    "options": [],
                },
                "voter_lists": {
                    "yes": voters,
                    "no": [],
                    "abstained": [],
                    "absent": [],
                    "not_eligible": [],
                    "options": {},
                },
            }
        ],
    }


def _pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_binary_report_contains_metadata_tallies_and_floor_vote() -> None:
    detail = _binary_detail(
        voters=[
            _voter(
                voter_email="admin",
                submitted_by_admin=True,
                submitted_at=None,
            )
        ]
    )

    data = generate_meeting_results_pdf(detail)
    text = _pdf_text(data)

    assert data.startswith(b"%PDF-")
    assert "PS123456A" in text
    assert "Harbour Tower" in text
    assert "Annual General Meeting / 2026" in text
    assert "Motion M-1: Adopt <budget> & plan" in text
    assert "Floor vote" in text
    assert "Voter count" in text
    assert "Entitlement (UOE)" in text
    assert "No voter records" in text


def test_multi_choice_report_contains_each_option_and_voter_choice() -> None:
    voter = _voter(
        voter_name='Jane "JD" <Owner>',
        proxy_email="proxy@example.com",
        submitted_at=datetime(2026, 1, 2, 3, 4),
    )
    option_id = uuid.uuid4()
    detail = _binary_detail(voters=[voter])
    detail["motions"] = [
        {
            "id": uuid.uuid4(),
            "title": "Elect representatives",
            "description": None,
            "display_order": 2,
            "motion_number": None,
            "motion_type": "special",
            "is_multi_choice": True,
            "option_limit": 2,
            "tally": {
                "yes": {"voter_count": 0, "entitlement_sum": 0},
                "no": {"voter_count": 0, "entitlement_sum": 0},
                "abstained": {"voter_count": 0, "entitlement_sum": 0},
                "absent": {"voter_count": 0, "entitlement_sum": 0},
                "not_eligible": {"voter_count": 0, "entitlement_sum": 0},
                "options": [
                    {
                        "option_id": option_id,
                        "option_text": "Alice <Admin>",
                        "display_order": 1,
                        "for_voter_count": 1,
                        "for_entitlement_sum": 100,
                        "against_voter_count": 0,
                        "against_entitlement_sum": 0,
                        "abstained_voter_count": 0,
                        "abstained_entitlement_sum": 0,
                        "voter_count": 1,
                        "entitlement_sum": 100,
                        "outcome": "pass",
                    },
                    {
                        "option_id": uuid.uuid4(),
                        "option_text": "Bob",
                        "display_order": 2,
                        "for_voter_count": 0,
                        "for_entitlement_sum": 0,
                        "against_voter_count": 0,
                        "against_entitlement_sum": 0,
                        "abstained_voter_count": 0,
                        "abstained_entitlement_sum": 0,
                        "voter_count": 0,
                        "entitlement_sum": 0,
                        "outcome": None,
                    },
                ],
            },
            "voter_lists": {
                "yes": [],
                "no": [],
                "abstained": [_voter(lot_number="9")],
                "absent": [_voter(lot_number="10")],
                "not_eligible": [_voter(lot_number="11")],
                "options_for": {str(option_id): [voter]},
                "options_against": {},
                "options_abstained": {},
                "options": {},
            },
        }
    ]

    text = _pdf_text(generate_meeting_results_pdf(detail))

    assert "Special | Multi-choice" in text
    assert "Alice <Admin>" in text
    assert "Jane \"JD\" <Owner>" in text
    assert "owner@example.com" in text
    assert "proxy" in text
    assert "Motion-level abstained" in text
    assert "Not eligible" in text


def test_empty_and_none_values_render_without_internal_reprs() -> None:
    detail = _binary_detail()
    detail["meeting_at"] = "raw timestamp"
    detail["motions"] = [
        {
            "id": uuid.uuid4(),
            "title": "Empty multi-choice",
            "description": None,
            "display_order": 1,
            "motion_number": None,
            "motion_type": _EnumValue.VALUE,
            "is_multi_choice": True,
            "option_limit": None,
            "tally": {"options": None},
            "voter_lists": {},
        }
    ]

    text = _pdf_text(generate_meeting_results_pdf(detail))

    assert "No option records" in text
    assert "Enum-Value | Multi-choice" in text
    assert "None" not in text
    assert "MotionVoterLists" not in text


def test_no_motions_report_has_intentional_empty_state() -> None:
    detail = _binary_detail()
    detail["motions"] = []
    detail["total_eligible_voters"] = 0
    detail["total_submitted"] = 0

    text = _pdf_text(generate_meeting_results_pdf(detail))

    assert "No motions recorded" in text
    assert "0%" in text


def test_large_voter_list_paginates() -> None:
    voters = [
        _voter(
            lot_number=str(index),
            voter_email=f"owner{index}@example.com",
            entitlement=index,
        )
        for index in range(1, 121)
    ]
    detail = _binary_detail(voters=voters)

    data = generate_meeting_results_pdf(detail)

    assert len(PdfReader(BytesIO(data)).pages) > 1


def test_voter_display_variants() -> None:
    assert format_voter_display(_voter(submitted_by_admin=True)) == "Floor vote"
    assert (
        format_voter_display(_voter(voter_name="Jane Smith", proxy_email="proxy@example.com"))
        == "Jane Smith <owner@example.com> (proxy)"
    )
    assert format_voter_display(_voter(voter_name="Jane Smith")) == "Jane Smith <owner@example.com>"
    assert format_voter_display({"voter_email": None, "proxy_email": "proxy@example.com"}) == "Proxy voter (proxy)"
    assert format_voter_display({}) == "—"


def test_filename_is_safe_and_deterministic_with_fallback() -> None:
    meeting_id = uuid.uuid4()
    first = report_pdf_filename({"id": meeting_id, "title": "Annual / Meeting: 2026"})
    second = report_pdf_filename({"id": meeting_id, "title": "Annual / Meeting: 2026"})

    assert first == second
    assert first == f"results-annual-meeting-2026-{meeting_id}.pdf"
    fallback = report_pdf_filename({"title": "!!!"})
    assert fallback.startswith("results-general-meeting-")
    assert fallback.endswith(".pdf")
