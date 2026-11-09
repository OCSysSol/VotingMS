"""
Service layer for DB-backed SMTP and SMS configuration.

Provides get/update/status operations for the tenant_smtp_config singleton row.
Password/secret encryption/decryption is handled by app.crypto using SMTP_ENCRYPTION_KEY.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import decrypt_smtp_password, encrypt_smtp_password
from app.logging_config import get_logger
from app.models.tenant_smtp_config import TenantSmtpConfig
from app.schemas.config import SmsConfigOut, SmsConfigUpdate, SmtpConfigUpdate

logger = get_logger(__name__)


async def get_smtp_config(db: AsyncSession) -> TenantSmtpConfig:
    """Return the singleton SMTP config row (id=1).

    Creates an empty default row if the table has no row yet (defensive fallback
    — the Alembic migration is responsible for seeding on deploy).
    """
    result = await db.execute(select(TenantSmtpConfig).where(TenantSmtpConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = TenantSmtpConfig(
            id=1,
            smtp_host="",
            smtp_port=587,
            smtp_username="",
            smtp_password_enc=None,
            smtp_from_email="",
        )
        db.add(config)
        await db.flush()
        await db.commit()
        await db.refresh(config)
    return config


async def update_smtp_config(data: SmtpConfigUpdate, db: AsyncSession) -> TenantSmtpConfig:
    """Upsert the singleton SMTP config row.

    If smtp_password in data is None or empty string, the existing encrypted
    password is retained unchanged. Otherwise the new password is encrypted
    with SMTP_ENCRYPTION_KEY and stored.
    """
    result = await db.execute(select(TenantSmtpConfig).where(TenantSmtpConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = TenantSmtpConfig(id=1)
        db.add(config)

    config.smtp_host = data.smtp_host
    config.smtp_port = data.smtp_port
    config.smtp_username = data.smtp_username
    config.smtp_from_email = data.smtp_from_email

    if data.smtp_password:
        key = settings.smtp_encryption_key
        if not key:
            # RR5-05: Raise 500 when a new password is supplied but the encryption key
            # is absent — silently discarding the password would create a confusing state
            # where the admin thinks they set a password but SMTP still fails.
            raise HTTPException(
                status_code=500,
                detail="SMTP encryption key not configured on server",
            )
        config.smtp_password_enc = encrypt_smtp_password(data.smtp_password, key)

    await db.flush()
    await db.commit()
    await db.refresh(config)
    return config


def get_decrypted_password(config: TenantSmtpConfig) -> str:
    """Decrypt and return the SMTP password from a config row.

    Returns empty string if:
    - smtp_password_enc is NULL
    - SMTP_ENCRYPTION_KEY is not set
    - Decryption fails (logs a warning)
    """
    if not config.smtp_password_enc:
        return ""
    key = settings.smtp_encryption_key
    if not key:
        logger.warning(
            "smtp_decryption_skipped",
            message="SMTP_ENCRYPTION_KEY is not set — cannot decrypt stored password",
        )
        return ""
    try:
        return decrypt_smtp_password(config.smtp_password_enc, key)
    except Exception as exc:
        logger.warning(
            "smtp_decryption_failed",
            error=str(exc),
        )
        return ""


async def is_smtp_configured(db: AsyncSession) -> bool:
    """Return True only when all required SMTP fields are set in the DB.

    Required: smtp_host, smtp_username, smtp_from_email non-empty AND
    smtp_password_enc is not NULL.
    """
    config = await get_smtp_config(db)
    return bool(
        config.smtp_host
        and config.smtp_username
        and config.smtp_from_email
        and config.smtp_password_enc is not None
    )


# ---------------------------------------------------------------------------
# SMS configuration helpers
# ---------------------------------------------------------------------------


def _decrypt_secret(enc: str | None, key: str, field_name: str) -> str:
    """Decrypt an encrypted secret field; return empty string on any failure."""
    if not enc:
        return ""
    if not key:
        return ""
    try:
        return decrypt_smtp_password(enc, key)
    except Exception as exc:
        logger.warning("sms_decryption_failed", field=field_name, error=str(exc))
        return ""


def _encrypt_secret(value: str, key: str, field_name: str) -> str:
    """Encrypt a secret using the shared encryption key.

    Raises HTTPException(500) when the key is absent.
    """
    if not key:
        raise HTTPException(
            status_code=500,
            detail="SMTP encryption key not configured on server",
        )
    return encrypt_smtp_password(value, key)


def build_sms_config_out(config: TenantSmtpConfig) -> SmsConfigOut:
    """Build the SmsConfigOut response from a TenantSmtpConfig row.

    Secrets are replaced with boolean presence flags.
    """
    return SmsConfigOut(
        sms_enabled=config.sms_enabled,
        sms_provider=config.sms_provider,
        sms_from_number=config.sms_from_number,
        sms_webhook_url=config.sms_webhook_url,
        sms_webhook_secret_is_set=config.sms_webhook_secret_enc is not None,
        sms_smtp2go_api_key_is_set=config.sms_smtp2go_api_key_enc is not None,
        sms_twilio_account_sid=config.sms_twilio_account_sid,
        sms_twilio_auth_token_is_set=config.sms_twilio_auth_token_enc is not None,
        sms_twilio_from_number=config.sms_twilio_from_number,
        sms_clicksend_username=config.sms_clicksend_username,
        sms_clicksend_api_key_is_set=config.sms_clicksend_api_key_enc is not None,
        sms_clicksend_from_number=config.sms_clicksend_from_number,
    )


async def update_sms_config(data: SmsConfigUpdate, db: AsyncSession) -> TenantSmtpConfig:
    """Upsert SMS fields on the singleton config row.

    Encrypted fields are only updated when a non-empty value is supplied;
    omitting / passing None leaves the existing ciphertext unchanged.
    """
    result = await db.execute(select(TenantSmtpConfig).where(TenantSmtpConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = TenantSmtpConfig(id=1)
        db.add(config)

    config.sms_enabled = data.sms_enabled
    config.sms_provider = data.sms_provider
    config.sms_from_number = data.sms_from_number or None
    config.sms_webhook_url = data.sms_webhook_url or None
    config.sms_twilio_account_sid = data.sms_twilio_account_sid or None
    config.sms_twilio_from_number = data.sms_twilio_from_number or None
    config.sms_clicksend_username = data.sms_clicksend_username or None
    config.sms_clicksend_from_number = data.sms_clicksend_from_number or None

    key = settings.smtp_encryption_key

    # Update encrypted fields only when a non-empty value was supplied
    if data.sms_webhook_secret:
        config.sms_webhook_secret_enc = _encrypt_secret(data.sms_webhook_secret, key, "sms_webhook_secret")
    if data.sms_smtp2go_api_key:
        config.sms_smtp2go_api_key_enc = _encrypt_secret(data.sms_smtp2go_api_key, key, "sms_smtp2go_api_key")
    if data.sms_twilio_auth_token:
        config.sms_twilio_auth_token_enc = _encrypt_secret(data.sms_twilio_auth_token, key, "sms_twilio_auth_token")
    if data.sms_clicksend_api_key:
        config.sms_clicksend_api_key_enc = _encrypt_secret(data.sms_clicksend_api_key, key, "sms_clicksend_api_key")

    await db.flush()
    await db.commit()
    await db.refresh(config)
    return config


def get_sms_send_kwargs(config: TenantSmtpConfig) -> dict:
    """Decrypt all SMS secrets and return kwargs ready for sms_service.send()."""
    key = settings.smtp_encryption_key
    return {
        "provider": config.sms_provider or "",
        "smtp2go_api_key": _decrypt_secret(config.sms_smtp2go_api_key_enc, key, "sms_smtp2go_api_key"),
        "smtp2go_sender": config.sms_from_number or "",
        "twilio_account_sid": config.sms_twilio_account_sid or "",
        "twilio_auth_token": _decrypt_secret(config.sms_twilio_auth_token_enc, key, "sms_twilio_auth_token"),
        "twilio_from_number": config.sms_twilio_from_number or "",
        "clicksend_username": config.sms_clicksend_username or "",
        "clicksend_api_key": _decrypt_secret(config.sms_clicksend_api_key_enc, key, "sms_clicksend_api_key"),
        "clicksend_from_number": config.sms_clicksend_from_number or "",
        "webhook_url": config.sms_webhook_url or "",
        "webhook_secret": _decrypt_secret(config.sms_webhook_secret_enc, key, "sms_webhook_secret") or None,
    }
