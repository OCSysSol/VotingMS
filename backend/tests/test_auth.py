"""
Tests for authentication rate limiting and verification lockout:
  - POST /api/auth/verify failed attempt rate limiting (5 failed attempts per (email, building_id) in 5 min)
  - 429 Too Many Requests returned when exceeded
  - Reset of failed attempt counter on successful verification
  - Bypass in testing_mode
  - Isolation between different accounts / buildings
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AuthOtp,
    Building,
    GeneralMeeting,
    GeneralMeetingStatus,
)
from app.models.lot import Lot
from app.models.lot_person import lot_persons
from app.models.person import Person
from app.rate_limiter import otp_verify_limiter


def meeting_dt() -> datetime:
    return datetime.now(UTC) - timedelta(hours=1)


def closing_dt() -> datetime:
    return datetime.now(UTC) + timedelta(days=2)


@pytest_asyncio.fixture(loop_scope="session")
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_test_data(db_session: AsyncSession):
    """Building with one open GeneralMeeting, one lot, one person with email, and an active OTP."""
    b = Building(name=f"Verify Bldg {uuid.uuid4().hex[:6]}", manager_email="mgr@test.com")
    db_session.add(b)
    await db_session.flush()

    lo = Lot(building_id=b.id, lot_number="V-101", unit_entitlement=100)
    db_session.add(lo)
    await db_session.flush()

    voter_email = f"voter_{uuid.uuid4().hex[:6]}@test.com"
    p = Person(email=voter_email)
    db_session.add(p)
    await db_session.flush()
    await db_session.execute(lot_persons.insert().values(lot_id=lo.id, person_id=p.id))

    agm = GeneralMeeting(
        building_id=b.id,
        title="Verify Test Meeting",
        status=GeneralMeetingStatus.open,
        meeting_at=meeting_dt(),
        voting_closes_at=closing_dt(),
    )
    db_session.add(agm)
    await db_session.flush()

    valid_code = "ABCDEFGH"
    otp = AuthOtp(
        email=voter_email,
        meeting_id=agm.id,
        code=valid_code,
        expires_at=datetime.now(UTC) + timedelta(minutes=10),
    )
    db_session.add(otp)
    await db_session.flush()

    # Clear rate limiter key before each test
    rate_key = f"{voter_email}:{b.id}"
    otp_verify_limiter.reset(rate_key)

    return {
        "building": b,
        "lot": lo,
        "voter_email": voter_email,
        "agm": agm,
        "valid_code": valid_code,
        "rate_key": rate_key,
    }


@pytest.mark.asyncio
class TestOtpVerifyRateLimiting:
    async def test_verify_rate_limiting_triggers_after_5_failures(
        self, client: AsyncClient, auth_test_data: dict
    ):
        """5 failed verify attempts lead to 429 Too Many Requests on the 6th attempt."""
        voter_email = auth_test_data["voter_email"]
        agm = auth_test_data["agm"]

        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.testing_mode = False

            # First 5 attempts fail with wrong code (401)
            for _ in range(5):
                res = await client.post(
                    "/api/auth/verify",
                    json={
                        "email": voter_email,
                        "code": "WRONG123",
                        "general_meeting_id": str(agm.id),
                    },
                )
                assert res.status_code == 401
                assert "Invalid or expired" in res.json()["detail"]

            # 6th attempt is blocked by rate limiter (429)
            res_6 = await client.post(
                "/api/auth/verify",
                json={
                    "email": voter_email,
                    "code": "WRONG123",
                    "general_meeting_id": str(agm.id),
                },
            )
            assert res_6.status_code == 429
            assert "Too many failed verification attempts" in res_6.json()["detail"]

    async def test_verify_rate_limiting_resets_on_success(
        self, client: AsyncClient, auth_test_data: dict
    ):
        """Successful verification resets the failed attempt counter."""
        voter_email = auth_test_data["voter_email"]
        agm = auth_test_data["agm"]
        valid_code = auth_test_data["valid_code"]

        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.testing_mode = False

            # 4 failed attempts
            for _ in range(4):
                res = await client.post(
                    "/api/auth/verify",
                    json={
                        "email": voter_email,
                        "code": "WRONG123",
                        "general_meeting_id": str(agm.id),
                    },
                )
                assert res.status_code == 401

            # 5th attempt succeeds with valid code
            res_success = await client.post(
                "/api/auth/verify",
                json={
                    "email": voter_email,
                    "code": valid_code,
                    "general_meeting_id": str(agm.id),
                },
            )
            assert res_success.status_code == 200

            # After reset, failed attempt count starts fresh — first attempt gives 401, not 429
            res_after = await client.post(
                "/api/auth/verify",
                json={
                    "email": voter_email,
                    "code": "WRONG123",
                    "general_meeting_id": str(agm.id),
                },
            )
            assert res_after.status_code == 401

    async def test_verify_rate_limiting_bypassed_in_testing_mode(
        self, client: AsyncClient, auth_test_data: dict
    ):
        """When testing_mode is True, rate limiting is bypassed."""
        voter_email = auth_test_data["voter_email"]
        agm = auth_test_data["agm"]

        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.testing_mode = True

            # Even with 6 consecutive failures, returns 401 and never 429
            for _ in range(6):
                res = await client.post(
                    "/api/auth/verify",
                    json={
                        "email": voter_email,
                        "code": "WRONG123",
                        "general_meeting_id": str(agm.id),
                    },
                )
                assert res.status_code == 401

    async def test_verify_rate_limiting_records_failure_on_no_otp_found(
        self, client: AsyncClient, auth_test_data: dict
    ):
        """Rate limit records failures when no OTP row exists for the email."""
        unknown_email = f"unknown_{uuid.uuid4().hex[:6]}@test.com"
        agm = auth_test_data["agm"]

        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.testing_mode = False

            for _ in range(5):
                res = await client.post(
                    "/api/auth/verify",
                    json={
                        "email": unknown_email,
                        "code": "NOOTP123",
                        "general_meeting_id": str(agm.id),
                    },
                )
                assert res.status_code == 401

            # 6th attempt hits 429
            res_locked = await client.post(
                "/api/auth/verify",
                json={
                    "email": unknown_email,
                    "code": "NOOTP123",
                    "general_meeting_id": str(agm.id),
                },
            )
            assert res_locked.status_code == 429

    async def test_verify_rate_limiting_isolated_between_accounts(
        self, client: AsyncClient, auth_test_data: dict
    ):
        """Locking out one account does not affect a different email."""
        voter_email = auth_test_data["voter_email"]
        other_email = f"other_{uuid.uuid4().hex[:6]}@test.com"
        agm = auth_test_data["agm"]

        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.testing_mode = False

            # Lock out voter_email
            for _ in range(5):
                await client.post(
                    "/api/auth/verify",
                    json={
                        "email": voter_email,
                        "code": "WRONG123",
                        "general_meeting_id": str(agm.id),
                    },
                )

            # other_email is not locked out
            res_other = await client.post(
                "/api/auth/verify",
                json={
                    "email": other_email,
                    "code": "WRONG123",
                    "general_meeting_id": str(agm.id),
                },
            )
            assert res_other.status_code == 401

    async def test_verify_rate_limiting_records_failure_when_no_lots_found(
        self, client: AsyncClient, db_session: AsyncSession, auth_test_data: dict
    ):
        """Rate limit records failure when OTP is valid but email is not linked to any lots in building."""
        orphan_email = f"orphan_{uuid.uuid4().hex[:6]}@test.com"
        agm = auth_test_data["agm"]
        code = "ORPHAN01"

        otp = AuthOtp(
            email=orphan_email,
            meeting_id=agm.id,
            code=code,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        db_session.add(otp)
        await db_session.flush()

        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.testing_mode = False

            res = await client.post(
                "/api/auth/verify",
                json={
                    "email": orphan_email,
                    "code": code,
                    "general_meeting_id": str(agm.id),
                },
            )
            assert res.status_code == 401
            assert "Email address not found" in res.json()["detail"]

            rate_key = f"{orphan_email}:{auth_test_data['building'].id}"
            assert otp_verify_limiter.is_rate_limited(rate_key) is False
            for _ in range(4):
                otp_verify_limiter.record(rate_key)
            assert otp_verify_limiter.is_rate_limited(rate_key) is True
