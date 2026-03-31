"""
Tests for domain-specific admin service shim modules (US-CQM-02).

Each shim module re-exports functions from admin_service.py.
These tests verify the public API of each shim is correct.
"""


class TestAdminBuildingsService:
    def test_imports_are_available(self):
        from app.services.admin_buildings_service import (
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
        assert callable(archive_building)
        assert callable(count_buildings)
        assert callable(create_building)
        assert callable(delete_building)
        assert callable(get_building_or_404)
        assert callable(import_buildings_from_csv)
        assert callable(import_buildings_from_excel)
        assert callable(list_buildings)
        assert callable(update_building)

    def test_same_object_as_admin_service(self):
        """Shim exports are the same callable objects as in admin_service."""
        from app.services import admin_service
        from app.services.admin_buildings_service import create_building

        assert create_building is admin_service.create_building


class TestAdminMeetingsService:
    def test_imports_are_available(self):
        from app.services.admin_meetings_service import (
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
        assert callable(close_general_meeting)
        assert callable(count_general_meetings)
        assert callable(create_general_meeting)
        assert callable(delete_general_meeting)
        assert callable(get_general_meeting_detail)
        assert callable(list_general_meetings)
        assert callable(reset_general_meeting_ballots)
        assert callable(resend_report)
        assert callable(start_general_meeting)

    def test_same_object_as_admin_service(self):
        from app.services import admin_service
        from app.services.admin_meetings_service import create_general_meeting

        assert create_general_meeting is admin_service.create_general_meeting


class TestAdminMotionsService:
    def test_imports_are_available(self):
        from app.services.admin_motions_service import (
            add_motion_to_meeting,
            delete_motion,
            reorder_motions,
            toggle_motion_visibility,
            update_motion,
        )
        assert callable(add_motion_to_meeting)
        assert callable(delete_motion)
        assert callable(reorder_motions)
        assert callable(toggle_motion_visibility)
        assert callable(update_motion)

    def test_same_object_as_admin_service(self):
        from app.services import admin_service
        from app.services.admin_motions_service import add_motion_to_meeting

        assert add_motion_to_meeting is admin_service.add_motion_to_meeting


class TestAdminLotOwnersService:
    def test_imports_are_available(self):
        from app.services.admin_lot_owners_service import (
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
        assert callable(add_email_to_lot_owner)
        assert callable(add_lot_owner)
        assert callable(get_lot_owner)
        assert callable(import_financial_positions)
        assert callable(import_financial_positions_from_csv)
        assert callable(import_financial_positions_from_excel)
        assert callable(import_lot_owners_from_csv)
        assert callable(import_lot_owners_from_excel)
        assert callable(import_proxies)
        assert callable(import_proxies_from_csv)
        assert callable(import_proxies_from_excel)
        assert callable(list_lot_owners)
        assert callable(remove_email_from_lot_owner)
        assert callable(remove_lot_owner_proxy)
        assert callable(set_lot_owner_proxy)
        assert callable(update_lot_owner)

    def test_same_object_as_admin_service(self):
        from app.services import admin_service
        from app.services.admin_lot_owners_service import list_lot_owners

        assert list_lot_owners is admin_service.list_lot_owners
