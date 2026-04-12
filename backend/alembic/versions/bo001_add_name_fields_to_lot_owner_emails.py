"""add given_name and surname to lot_owner_emails

Revision ID: bo001owneremails
Revises: rr6001perf2
Create Date: 2026-04-11 00:00:00.000000

Changes:
  - Add given_name VARCHAR NULL to lot_owner_emails
  - Add surname VARCHAR NULL to lot_owner_emails

Both columns are nullable. Fully backward-compatible — existing rows get NULL.
No indexes needed (columns are not used in WHERE/JOIN/ORDER BY).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "bo001owneremails"
down_revision = "rr6001perf2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lot_owner_emails",
        sa.Column("given_name", sa.String(), nullable=True),
    )
    op.add_column(
        "lot_owner_emails",
        sa.Column("surname", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lot_owner_emails", "surname")
    op.drop_column("lot_owner_emails", "given_name")
