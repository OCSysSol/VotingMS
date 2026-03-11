"""merge financial_position and motion_type migrations

Revision ID: 1e1b0a488622
Revises: 2755285e7be3, 7d0b4b08919a
Create Date: 2026-03-12 09:17:30.316766

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e1b0a488622'
down_revision: Union[str, Sequence[str], None] = ('2755285e7be3', '7d0b4b08919a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
