"""
Admin lot owners service — re-exports from admin_service (US-CQM-02).

This module is the public surface for lot-owner-related admin operations.
All logic lives in admin_service.py; this shim allows callers to import from
a domain-specific module without a codebase-wide rename.
"""
from app.services.admin_service import (  # noqa: F401
    add_email_to_lot_owner,
    add_lot_owner,
    get_lot_owner,
    import_financial_positions,
    import_financial_positions_from_csv,
    import_financial_positions_from_excel,
    import_lot_owners_from_csv,
    import_lot_owners_from_excel,
    import_proxies,
    import_proxies_from_csv,
    import_proxies_from_excel,
    list_lot_owners,
    remove_email_from_lot_owner,
    remove_lot_owner_proxy,
    set_lot_owner_proxy,
    update_lot_owner,
)
