"""
Admin meetings service — re-exports from admin_service (US-CQM-02).

This module is the public surface for general-meeting-related admin operations.
All logic lives in admin_service.py; this shim allows callers to import from
a domain-specific module without a codebase-wide rename.
"""
from app.services.admin_service import (  # noqa: F401
    close_general_meeting,
    count_general_meetings,
    create_general_meeting,
    delete_general_meeting,
    get_general_meeting_detail,
    list_general_meetings,
    reset_general_meeting_ballots,
    resend_report,
    start_general_meeting,
)
