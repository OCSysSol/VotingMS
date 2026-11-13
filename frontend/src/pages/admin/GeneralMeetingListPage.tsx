import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listGeneralMeetings,
  getGeneralMeetingsCount,
  archiveGeneralMeeting,
  unarchiveGeneralMeeting,
} from "../../api/admin";
import type { GeneralMeetingListItem } from "../../api/admin";
import GeneralMeetingTable from "../../components/admin/GeneralMeetingTable";
import type { SortDir } from "../../components/admin/SortableColumnHeader";
import Pagination from "../../components/admin/Pagination";
import ConfirmDialog from "../../components/admin/ConfirmDialog";

const PAGE_SIZE = 20;

// Text columns default to asc, date columns default to desc
const DEFAULT_SORT_DIR: Record<string, SortDir> = {
  title: "asc",
  oc_plan_number: "asc",
  building_name: "asc",
  created_at: "desc",
};

export default function GeneralMeetingListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedStatus = searchParams.get("status") ?? "";
  const meetingSearch = searchParams.get("name") ?? "";
  const [meetingSearchInput, setMeetingSearchInput] = useState(meetingSearch);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<GeneralMeetingListItem | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // RR2-06: Read page from URL search params; default to 1
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  // Sort state from URL search params
  const sortBy = searchParams.get("sort_by") ?? "created_at";
  const sortDir = (searchParams.get("sort_dir") ?? "desc") as SortDir;

  function handleMeetingSearchChange(value: string) {
    setMeetingSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const trimmed = value.trim();
      if (trimmed) next.set("name", trimmed);
      else next.delete("name");
      next.delete("page");
      setSearchParams(next, { replace: true });
    }, 300);
  }

  useEffect(() => {
    setMeetingSearchInput(meetingSearch);
  }, [meetingSearch]);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  function handleShowArchivedChange(checked: boolean) {
    setShowArchived(checked);
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  async function handleConfirmArchive() {
    /* v8 ignore next 2 -- defensive guard; archiveTarget is non-null when ConfirmDialog is open */
    if (!archiveTarget) return;
    setIsPending(true);
    setActionError(null);
    try {
      await archiveGeneralMeeting(archiveTarget.id);
      void queryClient.invalidateQueries({ queryKey: ["admin", "general-meetings"] });
      setArchiveTarget(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to archive General Meeting");
    } finally {
      setIsPending(false);
    }
  }

  async function handleUnarchive(meeting: GeneralMeetingListItem) {
    setIsPending(true);
    setActionError(null);
    try {
      await unarchiveGeneralMeeting(meeting.id);
      void queryClient.invalidateQueries({ queryKey: ["admin", "general-meetings"] });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to unarchive General Meeting");
    } finally {
      setIsPending(false);
    }
  }

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["admin", "general-meetings", "count", selectedStatus, showArchived, meetingSearch],
    queryFn: () =>
      getGeneralMeetingsCount({
        status: selectedStatus || undefined,
        is_archived: showArchived ? true : false,
        name: meetingSearch || undefined,
      }),
  });

  const totalCount = countData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const { data: meetings = [], isLoading, error } = useQuery<GeneralMeetingListItem[]>({
    queryKey: ["admin", "general-meetings", "list", safePage, selectedStatus, showArchived, sortBy, sortDir, meetingSearch],
    queryFn: () =>
      listGeneralMeetings({
        limit: PAGE_SIZE,
        offset: (safePage - 1) * PAGE_SIZE,
        status: selectedStatus || undefined,
        is_archived: showArchived ? true : false,
        sort_by: sortBy,
        sort_dir: sortDir,
        name: meetingSearch || undefined,
      }),
  });

  // Prefetch next page
  useEffect(() => {
    const nextOffset = safePage * PAGE_SIZE;
    if (nextOffset < totalCount) {
      void queryClient.prefetchQuery({
        queryKey: ["admin", "general-meetings", "list", safePage + 1, selectedStatus, showArchived, sortBy, sortDir, meetingSearch],
        queryFn: () =>
          listGeneralMeetings({
            limit: PAGE_SIZE,
            offset: nextOffset,
            status: selectedStatus || undefined,
            is_archived: showArchived ? true : false,
            sort_by: sortBy,
            sort_dir: sortDir,
            name: meetingSearch || undefined,
          }),
      });
    }
  }, [safePage, selectedStatus, showArchived, totalCount, queryClient, sortBy, sortDir, meetingSearch]);

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("status", value);
    } else {
      next.delete("status");
    }
    // Reset page to 1 when filter changes
    next.delete("page");
    setSearchParams(next);
  }

  // RR2-06: Update URL search param on page change (use replace to avoid polluting history)
  function handlePageChange(newPage: number) {
    const next = new URLSearchParams(searchParams);
    if (newPage === 1) {
      next.delete("page");
    } else {
      next.set("page", String(newPage));
    }
    setSearchParams(next, { replace: true });
  }

  function handleSortChange(column: string) {
    const next = new URLSearchParams(searchParams);
    // Reset page to 1 on sort change
    next.delete("page");
    if (column === sortBy) {
      // Toggle direction
      const newDir: SortDir = sortDir === "asc" ? "desc" : "asc";
      next.set("sort_by", column);
      next.set("sort_dir", newDir);
    } else {
      // New column — use its default direction (all valid columns are in DEFAULT_SORT_DIR)
      /* v8 ignore next -- "asc" fallback is unreachable: all valid sort columns are in DEFAULT_SORT_DIR */
      const newDir: SortDir = DEFAULT_SORT_DIR[column] !== undefined ? DEFAULT_SORT_DIR[column] : "asc";
      next.set("sort_by", column);
      next.set("sort_dir", newDir);
    }
    setSearchParams(next, { replace: true });
  }

  if (error) return <p className="state-message state-message--error">Failed to load General Meetings.</p>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>General Meetings</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label className="toggle-switch">
            <input
              id="show-archived-toggle"
              className="toggle-switch__input"
              type="checkbox"
              checked={showArchived}
              onChange={(e) => handleShowArchivedChange(e.target.checked)}
            />
            <span className="toggle-switch__track" />
            Show archived meetings
          </label>
          <button className="btn btn--primary" onClick={() => navigate("/admin/general-meetings/new")}>
            Create General Meeting
          </button>
        </div>
      </div>
      {actionError && !archiveTarget && (
        <div style={{ marginBottom: 16 }}>
          <p className="state-message state-message--error" role="alert">
            {actionError}
          </p>
        </div>
      )}
      <div className="admin-card">
        <div className="admin-card__header">
          <div style={{ display: "flex", width: "100%", gap: 16, alignItems: "flex-end" }}>
            <div style={{ maxWidth: 180 }}>
              <label className="field__label" htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                className="field__select"
                value={selectedStatus}
                onChange={handleStatusChange}
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div style={{ maxWidth: 320, marginLeft: "auto" }}>
              <label className="field__label" htmlFor="meeting-search">Search</label>
              <input
                id="meeting-search"
                className="field__input"
                type="search"
                value={meetingSearchInput}
                onChange={(e) => handleMeetingSearchChange(e.target.value)}
                placeholder="Meeting, OC Plan, or building"
              />
            </div>
          </div>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
          isLoading={isLoading}
        />
        {/* RR2-07: Show loading overlay while fetching page change */}
        <div style={{ opacity: isLoading ? 0.5 : 1, transition: "opacity 0.15s", pointerEvents: isLoading ? "none" : "auto" }}>
          <GeneralMeetingTable
            meetings={meetings}
            isLoading={isLoading}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSortChange}
            onArchive={(meeting) => {
              setActionError(null);
              setArchiveTarget(meeting);
            }}
            onUnarchive={handleUnarchive}
          />
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
          isLoading={isLoading}
        />
      </div>

      <ConfirmDialog
        isOpen={archiveTarget !== null}
        onClose={() => {
          setArchiveTarget(null);
          setActionError(null);
        }}
        onConfirm={handleConfirmArchive}
        isPending={isPending}
        error={actionError}
        title="Archive General Meeting"
        titleId="archive-meeting-title"
        message={`Are you sure you want to archive "${archiveTarget?.title}"? Closed meetings must be retained for audit compliance and will be hidden from the active list.`}
        confirmLabel="Archive"
        confirmClassName="btn btn--danger"
      />
    </div>
  );
}
