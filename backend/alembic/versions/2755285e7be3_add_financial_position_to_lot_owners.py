"""add financial_position to lot_owners

Revision ID: 2755285e7be3
Revises: b3f4a8e91c20
Create Date: 2026-03-12 00:47:57.791081

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2755285e7be3'
down_revision: Union[str, Sequence[str], None] = 'b3f4a8e91c20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    financial_position_enum = sa.Enum('normal', 'in_arrear', name='financialposition')
    financial_position_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('lot_owners', sa.Column('financial_position', financial_position_enum, server_default='normal', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lot_owners', 'financial_position')
    sa.Enum(name='financialposition').drop(op.get_bind(), checkfirst=True)
