"""Build the detailed meeting-results PDF shared by email and downloads."""
from __future__ import annotations

import html
import re
import uuid
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


_CATEGORY_LABELS = (
    ("yes", "For"),
    ("no", "Against"),
    ("abstained", "Abstained"),
    ("absent", "Absent"),
    ("not_eligible", "Not eligible"),
)


def _text(value: Any) -> str:
    """Return display-safe plain text without leaking None or enum reprs."""
    if value is None:
        return ""
    if hasattr(value, "value"):
        value = value.value
    return str(value).strip()


def _xml(value: Any) -> str:
    """Escape user-controlled text before handing it to ReportLab Paragraph."""
    return html.escape(_text(value), quote=False).replace("\n", "<br/>")


def _format_datetime(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        rendered = value
        if rendered.tzinfo is None:
            rendered = rendered.replace(tzinfo=UTC)
        return rendered.astimezone(UTC).strftime("%d %b %Y, %H:%M UTC")
    return _text(value) or "—"


def format_voter_display(voter: dict[str, Any]) -> str:
    """Return the canonical human-readable voter/source label."""
    if voter.get("submitted_by_admin"):
        return "Floor vote"

    voter_name = _text(voter.get("voter_name"))
    voter_email = _text(voter.get("voter_email"))
    if voter_name and voter_email:
        display = f"{voter_name} <{voter_email}>"
    else:
        display = voter_name or voter_email
    if voter.get("proxy_email"):
        display = f"{display or 'Proxy voter'} (proxy)"
    return display or "—"


def report_pdf_filename(detail: dict[str, Any]) -> str:
    """Return a safe, deterministic attachment filename for a meeting."""
    title = _text(detail.get("title")).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", title).strip("-")[:60] or "general-meeting"
    meeting_id = _text(detail.get("id")) or str(uuid.uuid4())
    return f"results-{slug}-{meeting_id}.pdf"


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            spaceAfter=10,
            alignment=TA_LEFT,
            textColor=colors.HexColor("#0C1B2E"),
        ),
        "body": ParagraphStyle(
            "ReportBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
        ),
        "small": ParagraphStyle(
            "ReportSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
        ),
        "cell": ParagraphStyle(
            "ReportCell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.2,
            leading=9,
        ),
        "header_cell": ParagraphStyle(
            "ReportHeaderCell",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9,
            textColor=colors.white,
        ),
        "motion": ParagraphStyle(
            "ReportMotion",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            spaceBefore=10,
            spaceAfter=6,
            textColor=colors.HexColor("#0C1B2E"),
        ),
        "heading": ParagraphStyle(
            "ReportHeading",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            spaceBefore=8,
            spaceAfter=4,
            textColor=colors.HexColor("#0C1B2E"),
        ),
    }


def _p(value: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_xml(value), style)


def _summary_table(rows: list[tuple[str, Any]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [[_p(label, styles["small"]), _p(value, styles["cell"])] for label, value in rows]
    table = Table(data, colWidths=[42 * mm, 128 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F5F0E8")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D5CCB8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _data_table(
    headers: list[str],
    rows: list[list[Any]],
    col_widths: list[float],
    styles: dict[str, ParagraphStyle],
) -> Table:
    data = [[_p(header, styles["header_cell"]) for header in headers]]
    data.extend([[_p(value, styles["cell"]) for value in row] for row in rows])
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0C1B2E")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D5CCB8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF7F1")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _voter_rows(voters: list[dict[str, Any]], option: str = "", choice: str = "") -> list[list[Any]]:
    rows: list[list[Any]] = []
    for voter in voters:
        row: list[Any] = [
            _text(voter.get("lot_number")) or "—",
            format_voter_display(voter),
            _text(voter.get("entitlement")),
            _format_datetime(voter.get("submitted_at")),
        ]
        if option or choice:
            row[2:2] = [option or "—", choice or "—"]
        rows.append(row)
    return rows


def _append_empty_state(
    story: list[Any],
    message: str,
    styles: dict[str, ParagraphStyle],
) -> None:
    story.append(_p(message, styles["small"]))


def _append_binary_motion(
    story: list[Any],
    motion: dict[str, Any],
    styles: dict[str, ParagraphStyle],
) -> None:
    tally = motion.get("tally") or {}
    tally_rows = [
        [
            label,
            (tally.get(key) or {}).get("voter_count", 0),
            (tally.get(key) or {}).get("entitlement_sum", 0),
        ]
        for key, label in _CATEGORY_LABELS
    ]
    story.append(_p("Tally", styles["heading"]))
    story.append(
        _data_table(
            ["Category", "Voter count", "Entitlement (UOE)"],
            tally_rows,
            [55 * mm, 40 * mm, 75 * mm],
            styles,
        )
    )

    voter_lists = motion.get("voter_lists") or {}
    for key, label in _CATEGORY_LABELS:
        voters = voter_lists.get(key) or []
        story.append(_p(label, styles["heading"]))
        if voters:
            story.append(
                _data_table(
                    ["Lot", "Voter / source", "UOE", "Submitted"],
                    _voter_rows(voters),
                    [22 * mm, 91 * mm, 20 * mm, 37 * mm],
                    styles,
                )
            )
        else:
            _append_empty_state(story, "No voter records", styles)


def _append_multi_choice_motion(
    story: list[Any],
    motion: dict[str, Any],
    styles: dict[str, ParagraphStyle],
) -> None:
    tally = motion.get("tally") or {}
    option_tallies = tally.get("options") or []
    story.append(_p("Option tallies", styles["heading"]))
    if option_tallies:
        stories: list[Any] = []
        for option in option_tallies:
            option_voter_rows: list[list[Any]] = []
            voter_lists = motion.get("voter_lists") or {}
            option_id = _text(option.get("option_id"))
            for choice_key, label in (
                ("options_for", "For"),
                ("options_against", "Against"),
                ("options_abstained", "Abstained"),
            ):
                for voter in (voter_lists.get(choice_key) or {}).get(option_id, []):
                    option_voter_rows.extend(
                        _voter_rows([voter], option.get("option_text"), label)
                    )

            stories.append(_p(option.get("option_text"), styles["heading"]))
            stories.append(
                _data_table(
                    ["For", "For UOE", "Against", "Against UOE", "Abstained", "Abstained UOE", "Outcome"],
                    [[
                        option.get("for_voter_count", option.get("voter_count", 0)),
                        option.get("for_entitlement_sum", option.get("entitlement_sum", 0)),
                        option.get("against_voter_count", 0),
                        option.get("against_entitlement_sum", 0),
                        option.get("abstained_voter_count", 0),
                        option.get("abstained_entitlement_sum", 0),
                        option.get("outcome") or "—",
                    ]],
                    [18 * mm, 22 * mm, 20 * mm, 24 * mm, 23 * mm, 28 * mm, 35 * mm],
                    styles,
                )
            )
            if option_voter_rows:
                stories.append(
                    _data_table(
                        ["Lot", "Option", "Choice", "Voter / source", "UOE", "Submitted"],
                        option_voter_rows,
                        [16 * mm, 35 * mm, 19 * mm, 58 * mm, 14 * mm, 28 * mm],
                        styles,
                    )
                )
            else:
                stories.append(_p("No voter records", styles["small"]))
            stories.append(Spacer(1, 4))
        story.extend(stories)
    else:
        _append_empty_state(story, "No option records", styles)

    voter_lists = motion.get("voter_lists") or {}
    for key, label in (("abstained", "Motion-level abstained"), ("absent", "Absent"), ("not_eligible", "Not eligible")):
        voters = voter_lists.get(key) or []
        story.append(_p(label, styles["heading"]))
        if voters:
            story.append(
                _data_table(
                    ["Lot", "Voter / source", "UOE", "Submitted"],
                    _voter_rows(voters),
                    [22 * mm, 91 * mm, 20 * mm, 37 * mm],
                    styles,
                )
            )
        else:
            _append_empty_state(story, "No voter records", styles)


def generate_meeting_results_pdf(detail: dict[str, Any]) -> bytes:
    """Render a complete results report from an existing meeting-detail mapping."""
    buffer = BytesIO()
    styles = _styles()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Meeting Results Report",
        author="AGM Voting",
    )
    story: list[Any] = [
        _p("Meeting Results Report", styles["title"]),
        _summary_table(
            [
                ("OC Plan", detail.get("oc_plan_number") or "—"),
                ("Building", detail.get("building_name") or "—"),
                ("Meeting", detail.get("title") or "—"),
                ("Status", detail.get("status") or "—"),
                ("Meeting time", _format_datetime(detail.get("meeting_at"))),
                ("Voting closes", _format_datetime(detail.get("voting_closes_at"))),
                ("Generated", _format_datetime(datetime.now(UTC))),
            ],
            styles,
        ),
        Spacer(1, 10),
        _summary_table(
            [
                ("Eligible lots", detail.get("total_eligible_voters", 0)),
                ("Submitted ballots", detail.get("total_submitted", 0)),
                (
                    "Participation",
                    (
                        f"{round((detail.get('total_submitted', 0) / detail.get('total_eligible_voters', 1)) * 100, 1)}%"
                        if detail.get("total_eligible_voters", 0)
                        else "0%"
                    ),
                ),
                ("Total entitlement", detail.get("total_entitlement", 0)),
            ],
            styles,
        ),
        Spacer(1, 12),
        _p("Voting Details", styles["motion"]),
    ]

    motions = detail.get("motions") or []
    if not motions:
        _append_empty_state(story, "No motions recorded", styles)

    for motion in motions:
        label = _text(motion.get("motion_number")) or _text(motion.get("display_order")) or "—"
        motion_type = _text(motion.get("motion_type")).title() or "General"
        heading_bits = [f"Motion {label}: {_text(motion.get('title')) or 'Untitled motion'}"]
        if motion.get("is_multi_choice"):
            heading_bits.append(f"{motion_type} | Multi-choice")
        else:
            heading_bits.append(f"{motion_type} resolution")

        story.append(_p(" | ".join(heading_bits), styles["motion"]))
        if motion.get("description"):
            story.append(_p(motion.get("description"), styles["body"]))
        if motion.get("is_multi_choice"):
            _append_multi_choice_motion(story, motion, styles)
        else:
            _append_binary_motion(story, motion, styles)
        story.append(Spacer(1, 8))

    document.build(story)
    return buffer.getvalue()
