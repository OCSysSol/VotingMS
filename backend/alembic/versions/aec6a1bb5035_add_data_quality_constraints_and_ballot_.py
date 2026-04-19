"""add data quality constraints and ballot hash

Revision ID: aec6a1bb5035
Revises: b5c6d7e8f9a0
Create Date: 2026-04-01 09:04:36.413708

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aec6a1bb5035'
down_revision: Union[str, Sequence[str], None] = 'b5c6d7e8f9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    RR3-37: Add data quality CHECK constraints to LotOwner and Motion.
    US-VIL-03: Add ballot_hash column to BallotSubmission for cryptographic audit.
    """
    # RR3-37: LotOwner — unit_entitlement must be > 0 (not just >= 0)
    op.drop_constraint(
        'ck_lot_owners_entitlement_nonneg', 'lot_owners', type_='check'
    )
    op.create_check_constraint(
        'ck_lot_owners_entitlement_positive',
        'lot_owners',
        'unit_entitlement > 0',
    )

    # RR3-37: LotOwner — lot_number must be non-empty
    op.create_check_constraint(
        'ck_lot_owners_lot_number_nonempty',
        'lot_owners',
        "lot_number <> ''",
    )

    # RR3-37: Motion — display_order must be > 0
    op.create_check_constraint(
        'ck_motions_display_order_positive',
        'motions',
        'display_order > 0',
    )

    # US-VIL-03: Add ballot_hash column (VARCHAR 64, nullable — backfilled on next submit)
    op.add_column(
        'ballot_submissions',
        sa.Column('ballot_hash', sa.String(64), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove ballot_hash
    op.drop_column('ballot_submissions', 'ballot_hash')

    # Remove RR3-37 constraints
    op.drop_constraint('ck_motions_display_order_positive', 'motions', type_='check')
    op.drop_constraint('ck_lot_owners_lot_number_nonempty', 'lot_owners', type_='check')
    op.drop_constraint('ck_lot_owners_entitlement_positive', 'lot_owners', type_='check')

    # Restore original entitlement constraint
    op.create_check_constraint(
        'ck_lot_owners_entitlement_nonneg',
        'lot_owners',
        'unit_entitlement >= 0',
    )
