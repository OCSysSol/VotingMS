"""add_meeting_archive_and_retention_indexes

Revision ID: 72fb772ed342
Revises: d3b931f49d21
Create Date: 2026-11-09 13:41:39.097451

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '72fb772ed342'
down_revision: Union[str, Sequence[str], None] = 'd3b931f49d21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'general_meetings',
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_index(
        'ix_votes_meeting_lot_owner',
        'votes',
        ['general_meeting_id', 'lot_owner_id'],
        if_not_exists=True,
    )
    op.create_index(
        'ix_general_meeting_lot_weights_lot_id',
        'general_meeting_lot_weights',
        ['lot_id'],
        if_not_exists=True,
    )
    op.create_index(
        'ix_ballot_submissions_lot_owner_id',
        'ballot_submissions',
        ['lot_owner_id'],
        if_not_exists=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ballot_submissions_lot_owner_id', table_name='ballot_submissions', if_exists=True)
    op.drop_index('ix_general_meeting_lot_weights_lot_id', table_name='general_meeting_lot_weights', if_exists=True)
    op.drop_index('ix_votes_meeting_lot_owner', table_name='votes', if_exists=True)
    op.drop_column('general_meetings', 'is_archived')
