"""elevate oc plan attribute and support non-unique building names

Revision ID: bld0004_oc_plan
Revises: 72fb772ed342
Create Date: 2026-11-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bld0004_oc_plan'
down_revision: Union[str, Sequence[str], None] = '72fb772ed342'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add oc_plan_number column to buildings
    op.add_column(
        'buildings',
        sa.Column('oc_plan_number', sa.String(length=100), nullable=True),
    )
    # 2. Create index on buildings(oc_plan_number)
    op.create_index(
        'ix_buildings_oc_plan_number',
        'buildings',
        ['oc_plan_number'],
        unique=False,
    )
    # 3. Drop unique constraint on buildings(name) if exists
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE buildings DROP CONSTRAINT IF EXISTS uq_buildings_name"))
    conn.execute(sa.text("ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_name_key"))


def downgrade() -> None:
    # 1. Re-add unique constraint on buildings(name)
    op.create_unique_constraint('uq_buildings_name', 'buildings', ['name'])
    # 2. Drop index
    op.drop_index('ix_buildings_oc_plan_number', table_name='buildings')
    # 3. Drop column
    op.drop_column('buildings', 'oc_plan_number')
