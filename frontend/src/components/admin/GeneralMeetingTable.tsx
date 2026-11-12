import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GeneralMeetingListItem } from "../../api/admin";
import StatusBadge from "./StatusBadge";
import Pagination from "./Pagination";
import SortableColumnHeader from "./SortableColumnHeader";
import type { SortDir } from "./SortableColumnHeader";
import { formatLocalDateTime } from "../../utils/dateTime";

const PAGE_SIZE = 20;

interface GeneralMeetingTableProps {
  meetings: GeneralMeetingListItem[];
  isLoading?: boolean;
  sortBy?: string;
  sortDir?: SortDir;
  onSort?: (col: string) => void;
  onArchive?: (meeting: GeneralMeetingListItem) => void;
  onUnarchive?: (meeting: GeneralMeetingListItem) => void;
}

export default function GeneralMeetingTable({
  meetings,
  isLoading,
  sortBy,
  sortDir,
  onSort,
  onArchive,
  onUnarchive,
}: GeneralMeetingTableProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const currentSort = sortBy && sortDir ? { column: sortBy, dir: sortDir } : null;

  const totalPages = Math.max(1, Math.ceil(meetings.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = meetings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const paginationControls = totalPages > 1 ? (
    <Pagination
      page={safePage}
      totalPages={totalPages}
      totalItems={meetings.length}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
    />
  ) : null;

  return (
    <div>
      {paginationControls}
      <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>OC Plan</th>
            {onSort ? (
              <SortableColumnHeader
                label="Building Name"
                column="building_name"
                currentSort={currentSort}
                onSort={onSort}
              />
            ) : (
              <th>Building Name</th>
            )}
            {onSort ? (
              <SortableColumnHeader
                label="Title"
                column="title"
                currentSort={currentSort}
                onSort={onSort}
              />
            ) : (
              <th>Title</th>
            )}
            {onSort ? (
              <SortableColumnHeader
                label="Status"
                column="status"
                currentSort={currentSort}
                onSort={onSort}
              />
            ) : (
              <th>Status</th>
            )}
            {onSort ? (
              <SortableColumnHeader
                label="Meeting At"
                column="meeting_at"
                currentSort={currentSort}
                onSort={onSort}
              />
            ) : (
              <th>Meeting At</th>
            )}
            {onSort ? (
              <SortableColumnHeader
                label="Voting Closes At"
                column="voting_closes_at"
                currentSort={currentSort}
                onSort={onSort}
              />
            ) : (
              <th>Voting Closes At</th>
            )}
            {onSort ? (
              <SortableColumnHeader
                label="Created At"
                column="created_at"
                currentSort={currentSort}
                onSort={onSort}
              />
            ) : (
              <th>Created At</th>
            )}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && !meetings.length ? (
            <tr>
              <td colSpan={8} className="state-message">Loading General Meetings...</td>
            </tr>
          ) : meetings.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px 14px" }}>
                No General Meetings found.
              </td>
            </tr>
          ) : (
            visible.map((meeting) => (
              <tr
                key={meeting.id}
                style={{
                  cursor: "pointer",
                  ...(meeting.is_archived ? { opacity: 0.6 } : undefined),
                }}
                onClick={() => navigate(`/admin/general-meetings/${meeting.id}`)}
              >
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>{meeting.oc_plan_number || "—"}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>{meeting.building_name}</td>
                <td style={{ fontWeight: 600 }}>{meeting.title}</td>
                <td>
                  <StatusBadge status={meeting.status} />
                  {meeting.is_archived && (
                    <span
                      className="status-badge status-badge--closed"
                      style={{ marginLeft: 6, background: "var(--surface-muted, #f1f5f9)", color: "var(--text-muted, #475569)" }}
                    >
                      Archived
                    </span>
                  )}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  {formatLocalDateTime(meeting.meeting_at)}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  {formatLocalDateTime(meeting.voting_closes_at)}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  {formatLocalDateTime(meeting.created_at)}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {meeting.is_archived ? (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => onUnarchive?.(meeting)}
                      aria-label={`Unarchive ${meeting.title}`}
                    >
                      Unarchive
                    </button>
                  ) : meeting.status === "closed" ? (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => onArchive?.(meeting)}
                      aria-label={`Archive ${meeting.title}`}
                    >
                      Archive
                    </button>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
      {paginationControls}
    </div>
  );
}
