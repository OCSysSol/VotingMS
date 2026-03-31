"""
Admin buildings service — re-exports from admin_service (US-CQM-02).

This module is the public surface for building-related admin operations.
All logic lives in admin_service.py; this shim allows callers to import from
a domain-specific module without a codebase-wide rename.
"""
from app.services.admin_service import (  # noqa: F401
    archive_building,
    count_buildings,
    create_building,
    delete_building,
    get_building_or_404,
    import_buildings_from_csv,
    import_buildings_from_excel,
    list_buildings,
    update_building,
)
