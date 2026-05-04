"""add SMS fields to lot_owners and tenant_smtp_config

Revision ID: sms0001smsotp
Revises: uc0001unarchivecnt
Create Date: 2026-05-04 00:00:00.000000

Changes:
  - Add lot_owners.phone_number VARCHAR(20) NULL
  - Add 12 SMS config columns to tenant_smtp_config:
      sms_enabled BOOLEAN NOT NULL DEFAULT FALSE
      sms_provider VARCHAR(20) NULL
      sms_from_number VARCHAR(20) NULL
      sms_webhook_url VARCHAR(512) NULL
      sms_webhook_secret_enc VARCHAR(512) NULL
      sms_smtp2go_api_key_enc VARCHAR(512) NULL
      sms_twilio_account_sid VARCHAR(64) NULL
      sms_twilio_auth_token_enc VARCHAR(512) NULL
      sms_twilio_from_number VARCHAR(20) NULL
      sms_clicksend_username VARCHAR(254) NULL
      sms_clicksend_api_key_enc VARCHAR(512) NULL
      sms_clicksend_from_number VARCHAR(20) NULL
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "sms0001smsotp"
down_revision = "uc0001unarchivecnt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add phone_number to lot_owners
    op.add_column(
        "lot_owners",
        sa.Column("phone_number", sa.String(20), nullable=True),
    )

    # Add SMS configuration columns to tenant_smtp_config
    op.add_column(
        "tenant_smtp_config",
        sa.Column(
            "sms_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_provider", sa.String(20), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_from_number", sa.String(20), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_webhook_url", sa.String(512), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_webhook_secret_enc", sa.String(512), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_smtp2go_api_key_enc", sa.String(512), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_twilio_account_sid", sa.String(64), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_twilio_auth_token_enc", sa.String(512), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_twilio_from_number", sa.String(20), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_clicksend_username", sa.String(254), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_clicksend_api_key_enc", sa.String(512), nullable=True),
    )
    op.add_column(
        "tenant_smtp_config",
        sa.Column("sms_clicksend_from_number", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_smtp_config", "sms_clicksend_from_number")
    op.drop_column("tenant_smtp_config", "sms_clicksend_api_key_enc")
    op.drop_column("tenant_smtp_config", "sms_clicksend_username")
    op.drop_column("tenant_smtp_config", "sms_twilio_from_number")
    op.drop_column("tenant_smtp_config", "sms_twilio_auth_token_enc")
    op.drop_column("tenant_smtp_config", "sms_twilio_account_sid")
    op.drop_column("tenant_smtp_config", "sms_smtp2go_api_key_enc")
    op.drop_column("tenant_smtp_config", "sms_webhook_secret_enc")
    op.drop_column("tenant_smtp_config", "sms_webhook_url")
    op.drop_column("tenant_smtp_config", "sms_from_number")
    op.drop_column("tenant_smtp_config", "sms_provider")
    op.drop_column("tenant_smtp_config", "sms_enabled")
    op.drop_column("lot_owners", "phone_number")
