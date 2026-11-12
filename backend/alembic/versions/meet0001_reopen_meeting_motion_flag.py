"""Track motion closures applied by meeting close.

Revision ID: meet0001reopen
Revises: pers0002nullemail
Create Date: 2026-11-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "meet0001reopen"
down_revision: Union[str, Sequence[str], None] = "pers0002nullemail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "motions",
        sa.Column(
            "closed_by_meeting",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Before this flag existed, meeting close assigned the same closed_at value
    # to every motion that was still open. Exact timestamp matching identifies
    # those rows while preserving motions that were closed individually earlier.
    op.execute(
        sa.text(
            """
            UPDATE motions AS motion
            SET closed_by_meeting = TRUE
            FROM general_meetings AS meeting
            WHERE meeting.id = motion.general_meeting_id
              AND meeting.status = 'closed'
              AND meeting.closed_at IS NOT NULL
              AND motion.voting_closed_at = meeting.closed_at
            """
        )
    )


def downgrade() -> None:
    op.drop_column("motions", "closed_by_meeting")
