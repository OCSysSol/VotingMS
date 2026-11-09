"""
SMS delivery service.

Dispatches SMS messages via one of four providers:
  - smtp2go:   POST https://api.smtp2go.com/v3/sms/send
  - twilio:    POST https://api.twilio.com/... (HTTP Basic Auth, form-encoded)
  - clicksend: POST https://rest.clicksend.com/v3/sms/send (HTTP Basic Auth, JSON)
  - webhook:   POST to a configurable URL (JSON, optional HMAC-SHA256 signature)

Raises SmsDeliveryError on any failure. Callers return 502 immediately — no retry.
"""
from __future__ import annotations

import hashlib
import hmac

import httpx

from app.logging_config import get_logger

logger = get_logger(__name__)


class SmsDeliveryError(Exception):
    """Raised when an SMS cannot be delivered via the configured provider."""


async def _send_smtp2go(
    api_key: str,
    sender: str,
    to: str,
    message: str,
) -> None:
    """Send via smtp2go SMS API."""
    payload = {
        "api_key": api_key,
        "destination": [to],
        "content": message,
        "sender": sender,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.smtp2go.com/v3/sms/send",
            json=payload,
        )
    if resp.status_code != 200:
        logger.error("sms_smtp2go_failed", status=resp.status_code)
        raise SmsDeliveryError(f"smtp2go returned {resp.status_code}")
    body = resp.json()
    if body.get("data", {}).get("succeeded", 0) < 1:
        logger.error("sms_smtp2go_no_success", body=str(body)[:200])
        raise SmsDeliveryError("smtp2go reported no messages succeeded")


async def _send_twilio(
    account_sid: str,
    auth_token: str,
    from_number: str,
    to: str,
    message: str,
) -> None:
    """Send via Twilio Messages API."""
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            data={"To": to, "From": from_number, "Body": message},
            auth=(account_sid, auth_token),
        )
    if resp.status_code not in (200, 201):
        logger.error("sms_twilio_failed", status=resp.status_code)
        raise SmsDeliveryError(f"Twilio returned {resp.status_code}")


async def _send_clicksend(
    username: str,
    api_key: str,
    from_number: str,
    to: str,
    message: str,
) -> None:
    """Send via ClickSend SMS API."""
    payload = {
        "messages": [
            {
                "source": "sdk",
                "body": message,
                "to": to,
                "from": from_number,
            }
        ]
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://rest.clicksend.com/v3/sms/send",
            json=payload,
            auth=(username, api_key),
        )
    if resp.status_code not in (200, 201):
        logger.error("sms_clicksend_failed", status=resp.status_code)
        raise SmsDeliveryError(f"ClickSend returned {resp.status_code}")


async def _send_webhook(
    webhook_url: str,
    to: str,
    message: str,
    secret: str | None = None,
) -> None:
    """POST JSON payload to a webhook URL with optional HMAC-SHA256 signature."""
    import json as _json

    payload = {"to": to, "message": message}
    body_bytes = _json.dumps(payload).encode("utf-8")

    headers: dict[str, str] = {"content-type": "application/json"}
    if secret:
        sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        headers["X-Signature"] = f"hmac-sha256={sig}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(webhook_url, content=body_bytes, headers=headers)
    if resp.status_code not in (200, 201, 202, 204):
        logger.error("sms_webhook_failed", status=resp.status_code)
        raise SmsDeliveryError(f"Webhook returned {resp.status_code}")


async def send(
    provider: str,
    to: str,
    message: str,
    *,
    # smtp2go
    smtp2go_api_key: str | None = None,
    smtp2go_sender: str | None = None,
    # twilio
    twilio_account_sid: str | None = None,
    twilio_auth_token: str | None = None,
    twilio_from_number: str | None = None,
    # clicksend
    clicksend_username: str | None = None,
    clicksend_api_key: str | None = None,
    clicksend_from_number: str | None = None,
    # webhook
    webhook_url: str | None = None,
    webhook_secret: str | None = None,
) -> None:
    """Dispatch an SMS via the configured provider.

    Raises SmsDeliveryError on any delivery failure.
    """
    try:
        if provider == "smtp2go":
            if not smtp2go_api_key or not smtp2go_sender:
                raise SmsDeliveryError("smtp2go_api_key and smtp2go_sender are required")
            await _send_smtp2go(smtp2go_api_key, smtp2go_sender, to, message)
        elif provider == "twilio":
            if not twilio_account_sid or not twilio_auth_token or not twilio_from_number:
                raise SmsDeliveryError(
                    "twilio_account_sid, twilio_auth_token, and twilio_from_number are required"
                )
            await _send_twilio(twilio_account_sid, twilio_auth_token, twilio_from_number, to, message)
        elif provider == "clicksend":
            if not clicksend_username or not clicksend_api_key or not clicksend_from_number:
                raise SmsDeliveryError(
                    "clicksend_username, clicksend_api_key, and clicksend_from_number are required"
                )
            await _send_clicksend(clicksend_username, clicksend_api_key, clicksend_from_number, to, message)
        elif provider == "webhook":
            if not webhook_url:
                raise SmsDeliveryError("webhook_url is required")
            await _send_webhook(webhook_url, to, message, secret=webhook_secret)
        else:
            raise SmsDeliveryError(f"Unknown SMS provider: {provider}")
    except SmsDeliveryError:
        raise
    except Exception as exc:
        logger.error("sms_send_unexpected_error", provider=provider, error=str(exc))
        raise SmsDeliveryError(f"Unexpected error sending SMS via {provider}") from exc
