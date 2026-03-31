"""
Admin motions service — re-exports from admin_service (US-CQM-02).

This module is the public surface for motion-related admin operations.
All logic lives in admin_service.py; this shim allows callers to import from
a domain-specific module without a codebase-wide rename.
"""
from app.services.admin_service import (  # noqa: F401
    add_motion_to_meeting,
    delete_motion,
    reorder_motions,
    toggle_motion_visibility,
    update_motion,
)
