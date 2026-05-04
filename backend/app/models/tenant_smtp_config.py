"""
SQLAlchemy model for the singleton SMTP + SMS configuration row.

The table enforces a single row via a CHECK constraint (id = 1).
Encrypted fields (smtp_password_enc, sms_*_enc) store AES-256-GCM ciphertext;
they are never returned to clients.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TenantSmtpConfig(Base):
    __tablename__ = "tenant_smtp_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_tenant_smtp_config_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    smtp_host: Mapped[str] = mapped_column(String(253), nullable=False, default="")
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False, default=587)
    smtp_username: Mapped[str] = mapped_column(String(254), nullable=False, default="")
    smtp_password_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    smtp_from_email: Mapped[str] = mapped_column(String(254), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # SMS configuration fields
    sms_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sms_provider: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sms_from_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sms_webhook_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    sms_webhook_secret_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    sms_smtp2go_api_key_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    sms_twilio_account_sid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    sms_twilio_auth_token_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    sms_twilio_from_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sms_clicksend_username: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    sms_clicksend_api_key_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    sms_clicksend_from_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
