"""allow persons without email

Revision ID: pers0002nullemail
Revises: bld0004_oc_plan

Changes:
  - persons.email becomes nullable (id UUID remains the identity). The unique
    index is retained; Postgres treats NULLs as distinct so many email-less
    persons can coexist.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "pers0002nullemail"
down_revision = "bld0004_oc_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("persons", "email", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM lot_persons WHERE person_id IN (SELECT id FROM persons WHERE email IS NULL)")
    op.execute(
        "DELETE FROM persons WHERE email IS NULL "
        "AND id NOT IN (SELECT person_id FROM lot_proxies WHERE person_id IS NOT NULL)"
    )
    op.alter_column("persons", "email", existing_type=sa.String(), nullable=False)
