"""Build the detailed meeting-results PDF shared by email and downloads."""
from __future__ import annotations

import html
import re
import uuid
from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo

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


_MELBOURNE_TZ = ZoneInfo("Australia/Melbourne")


def _format_datetime(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        rendered = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return rendered.astimezone(_MELBOURNE_TZ).strftime("%d %b %Y, %H:%M %Z")
    return _text(value) or "—"


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
            stories.append(Spacer(1, 4))
        story.extend(stories)
    else:
        _append_empty_state(story, "No option records", styles)

    summary_rows = [
        [
            label,
            (tally.get(key) or {}).get("voter_count", 0),
            (tally.get(key) or {}).get("entitlement_sum", 0),
        ]
        for key, label in (
            ("abstained", "Abstained"),
            ("absent", "Absent"),
            ("not_eligible", "Not eligible"),
        )
    ]
    story.append(_p("Motion-level summary", styles["heading"]))
    story.append(
        _data_table(
            ["Category", "Voter count", "Entitlement (UOE)"],
            summary_rows,
            [55 * mm, 40 * mm, 75 * mm],
            styles,
        )
    )


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
