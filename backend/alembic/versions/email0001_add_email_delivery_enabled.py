"""Add the effective outbound-email delivery switch.

Revision ID: email0001delivery
Revises: meet0001reopen
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "email0001delivery"
down_revision: Union[str, Sequence[str], None] = "meet0001reopen"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_smtp_config",
        sa.Column(
            "email_delivery_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("tenant_smtp_config", "email_delivery_enabled")
