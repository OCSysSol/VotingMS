import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../../../../tests/msw/server";
import * as adminApi from "../../../api/admin";
import GeneralMeetingListPage from "../GeneralMeetingListPage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage(initialSearch = "") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/general-meetings${initialSearch}`]}>
        <GeneralMeetingListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("GeneralMeetingListPage", () => {
  // --- Happy path ---

  it("shows loading state inline in table while page header remains visible", () => {
    renderPage();
    // Page structure renders immediately
    expect(screen.getByRole("heading", { name: "General Meetings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create General Meeting" })).toBeInTheDocument();
    // Loading message is inside the table body
    expect(screen.getByText("Loading General Meetings...")).toBeInTheDocument();
  });

  it("renders one search field first and left-aligned in the toolbar", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByRole("combobox", { name: "Building" })).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search" });
    const filterRow = search.closest(".admin-card__header")?.firstElementChild;
    expect(filterRow).toHaveStyle({ justifyContent: "flex-start" });
    expect(filterRow?.firstElementChild).toContainElement(search);
  });

  it("sends the shared meeting, OC Plan, and building search to list and count", async () => {
    let listSearch = "";
    let countSearch = "";
    server.use(
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        listSearch = new URL(request.url).searchParams.get("name") ?? "";
        return HttpResponse.json([]);
      }),
      http.get("http://localhost/api/admin/general-meetings/count", ({ request }) => {
        countSearch = new URL(request.url).searchParams.get("name") ?? "";
        return HttpResponse.json({ count: 0 });
      })
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "OC 456");
    await waitFor(() => {
      expect(listSearch).toBe("OC 456");
      expect(countSearch).toBe("OC 456");
    }, { timeout: 3000 });
  });

  it("loading overlay has pointer-events none while loading and auto after load", async () => {
    renderPage();
    // During loading the overlay div should block pointer events
    const loadingOverlay = screen.getByText("Loading General Meetings...").closest("div[style]")!;
    expect(loadingOverlay).toHaveStyle({ pointerEvents: "none" });

    // After load the overlay should allow pointer events
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    const loadedOverlay = screen.getByText("2024 AGM").closest("div[style]")!;
    expect(loadedOverlay).toHaveStyle({ pointerEvents: "auto" });
  });

  it("renders meeting table after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.getByText("2023 AGM")).toBeInTheDocument();
    expect(screen.getByText("2026 AGM")).toBeInTheDocument();
  });

  it("renders Create General Meeting button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create General Meeting" })).toBeInTheDocument();
    });
  });

  it("removes the meeting search from list and count when the filter is cleared", async () => {
    let listHasSearch = true;
    let countHasSearch = true;
    server.use(
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        listHasSearch = new URL(request.url).searchParams.has("name");
        return HttpResponse.json([]);
      }),
      http.get("http://localhost/api/admin/general-meetings/count", ({ request }) => {
        countHasSearch = new URL(request.url).searchParams.has("name");
        return HttpResponse.json({ count: 0 });
      })
    );
    const user = userEvent.setup();
    renderPage("?name=OC%20456");
    const search = screen.getByRole("searchbox", { name: "Search" });
    await waitFor(() => expect(search).toHaveValue("OC 456"));
    await user.clear(search);
    await waitFor(() => {
      expect(listHasSearch).toBe(false);
      expect(countHasSearch).toBe(false);
    }, { timeout: 3000 });
  });

  it("navigates to create page when button clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create General Meeting" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/general-meetings/new");
  });

  it("navigates to meeting detail on row click", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    await user.click(screen.getByText("2024 AGM"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/general-meetings/agm1");
  });

  it("shows Open, Pending and Closed status badges", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Open")).toBeInTheDocument();
      expect(screen.getByText("Closed")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () => {
        return HttpResponse.json({ detail: "Error" }, { status: 500 });
      })
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Failed to load General Meetings.")).toBeInTheDocument();
    });
  });

  // --- Status filter ---

  it("renders status filter dropdown with All statuses default", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText("Status")).toBeInTheDocument();
    });
    const select = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "All statuses" })).toBeInTheDocument();
  });

  it("renders all three status options in the dropdown", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText("Status")).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Closed" })).toBeInTheDocument();
  });

  it("filters to open meetings only when Open is selected (sends status to server)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText("Status"), "open");
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("2023 AGM")).not.toBeInTheDocument();
    expect(screen.queryByText("2026 AGM")).not.toBeInTheDocument();
  });

  it("filters to pending meetings only when Pending is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2026 AGM")).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText("Status"), "pending");
    await waitFor(() => {
      expect(screen.getByText("2026 AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("2024 AGM")).not.toBeInTheDocument();
    expect(screen.queryByText("2023 AGM")).not.toBeInTheDocument();
  });

  it("filters to closed meetings only when Closed is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2023 AGM")).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText("Status"), "closed");
    await waitFor(() => {
      expect(screen.getByText("2023 AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("2024 AGM")).not.toBeInTheDocument();
    expect(screen.queryByText("2026 AGM")).not.toBeInTheDocument();
  });

  it("selecting All statuses after filtering shows all meetings", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText("Status"), "open");
    await waitFor(() => {
      expect(screen.queryByText("2023 AGM")).not.toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText("Status"), "");
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.getByText("2023 AGM")).toBeInTheDocument();
    expect(screen.getByText("2026 AGM")).toBeInTheDocument();
  });

  it("reads status URL param on mount and pre-selects the status", async () => {
    renderPage("?status=closed");
    await waitFor(() => {
      expect(screen.getByText("2023 AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("2024 AGM")).not.toBeInTheDocument();
    expect(screen.queryByText("2026 AGM")).not.toBeInTheDocument();
    const select = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(select.value).toBe("closed");
  });

  it("reads pending status URL param on mount", async () => {
    renderPage("?status=pending");
    await waitFor(() => {
      expect(screen.getByText("2026 AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("2024 AGM")).not.toBeInTheDocument();
    expect(screen.queryByText("2023 AGM")).not.toBeInTheDocument();
    const select = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(select.value).toBe("pending");
  });

  it("reads open status URL param on mount", async () => {
    renderPage("?status=open");
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("2023 AGM")).not.toBeInTheDocument();
    expect(screen.queryByText("2026 AGM")).not.toBeInTheDocument();
    const select = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(select.value).toBe("open");
  });

  it("shows no meetings when status URL param does not match any status", async () => {
    renderPage("?status=nonexistent");
    await waitFor(() => {
      expect(screen.queryByText("2024 AGM")).not.toBeInTheDocument();
      expect(screen.queryByText("2023 AGM")).not.toBeInTheDocument();
      expect(screen.queryByText("2026 AGM")).not.toBeInTheDocument();
    });
  });

  // --- RR2-06: URL params for page ---

  it("navigates to page 2 via pagination and back to page 1 via Previous", async () => {
    const meetings = Array.from({ length: 21 }, (_, i) => ({
      id: `m${i + 1}`,
      building_id: "b1",
      building_name: "Alpha Tower",
      title: `Meeting ${i + 1}`,
      status: "open",
      meeting_at: "2024-06-01T10:00:00Z",
      voting_closes_at: "2024-06-01T12:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    }));
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 21 })
      ),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        return HttpResponse.json(meetings.slice(offset, offset + limit));
      })
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Meeting 1")).toBeInTheDocument();
    });
    // Navigate to page 2
    await user.click(screen.getAllByRole("button", { name: "Go to page 2" })[0]);
    await waitFor(() => {
      expect(screen.getByText("Meeting 21")).toBeInTheDocument();
    });
    // Navigate back to page 1 via Previous button
    await user.click(screen.getAllByRole("button", { name: "Previous page" })[0]);
    await waitFor(() => {
      expect(screen.getByText("Meeting 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Meeting 21")).not.toBeInTheDocument();
  });

  it("defaults to page 1 when page URL param is not a valid number", async () => {
    renderPage("?page=abc");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "General Meetings" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Failed to load General Meetings.")).not.toBeInTheDocument();
  });

  it("reads page=2 from URL and loads page 2", async () => {
    const meetings = Array.from({ length: 21 }, (_, i) => ({
      id: `m${i + 1}`,
      building_id: "b1",
      building_name: "Alpha Tower",
      title: `Meeting ${i + 1}`,
      status: "open",
      meeting_at: "2024-06-01T10:00:00Z",
      voting_closes_at: "2024-06-01T12:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    }));
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 21 })
      ),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        return HttpResponse.json(meetings.slice(offset, offset + limit));
      })
    );
    renderPage("?page=2");
    await waitFor(() => {
      expect(screen.getByText("Meeting 21")).toBeInTheDocument();
    });
    expect(screen.queryByText("Meeting 1")).not.toBeInTheDocument();
  });

  it("filter change resets page to 1 in URL", async () => {
    const meetings = Array.from({ length: 21 }, (_, i) => ({
      id: `m${i + 1}`,
      building_id: "b1",
      building_name: "Alpha Tower",
      title: `Meeting ${i + 1}`,
      status: "open",
      meeting_at: "2024-06-01T10:00:00Z",
      voting_closes_at: "2024-06-01T12:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    }));
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 21 })
      ),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        return HttpResponse.json(meetings.slice(offset, offset + limit));
      })
    );
    const user = userEvent.setup();
    renderPage("?page=2");
    await waitFor(() => {
      expect(screen.getByText("Meeting 21")).toBeInTheDocument();
    });
    // Changing filter should reset to page 1
    await user.selectOptions(screen.getByLabelText("Status"), "open");
    await waitFor(() => {
      expect(screen.getByText("Meeting 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Meeting 21")).not.toBeInTheDocument();
  });

  // --- Pagination and prefetch ---

  it("prefetches next page when total count exceeds one page", async () => {
    // 21 meetings so that totalCount > PAGE_SIZE (20) and prefetch triggers
    const meetings = Array.from({ length: 21 }, (_, i) => ({
      id: `m${i + 1}`,
      building_id: "b1",
      building_name: "Alpha Tower",
      title: `Meeting ${i + 1}`,
      status: "open",
      meeting_at: "2024-06-01T10:00:00Z",
      voting_closes_at: "2024-06-01T12:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    }));

    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", () => {
        return HttpResponse.json({ count: 21 });
      }),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        return HttpResponse.json(meetings.slice(offset, offset + limit));
      })
    );

    renderPage();

    // Page 1 loads — 20 meetings visible, Meeting 21 is on page 2 (prefetched)
    await waitFor(() => {
      expect(screen.getByText("Meeting 1")).toBeInTheDocument();
    });
    // Pagination shows 2 pages
    expect(screen.getAllByRole("button", { name: "Go to page 2" })[0]).toBeInTheDocument();
  });

  // --- Sort functionality ---

  it("renders sortable Title and Created At column headers", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Created At/ })).toBeInTheDocument();
  });

  it("Created At header shows ▼ indicator by default (desc sort)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    const createdBtn = screen.getByRole("button", { name: /Created At/ });
    expect(createdBtn.textContent).toContain("▼");
  });

  it("clicking Title header updates sort to title ascending", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Title/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Title/ }).closest("th")).toHaveAttribute("aria-sort", "ascending");
    });
  });

  it("clicking Title header again toggles to descending", async () => {
    const user = userEvent.setup();
    renderPage("?sort_by=title&sort_dir=asc");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Title/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Title/ }).closest("th")).toHaveAttribute("aria-sort", "descending");
    });
  });

  it("clicking Title desc toggles back to ascending (sortDir=desc branch)", async () => {
    const user = userEvent.setup();
    renderPage("?sort_by=title&sort_dir=desc");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
    });
    // Click same column while desc → toggles to asc
    await user.click(screen.getByRole("button", { name: /Title/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Title/ }).closest("th")).toHaveAttribute("aria-sort", "ascending");
    });
  });

  it("reads sort_by=title from URL and shows ascending indicator on Title", async () => {
    renderPage("?sort_by=title&sort_dir=asc");
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    const titleBtn = screen.getByRole("button", { name: /Title/ });
    expect(titleBtn.closest("th")).toHaveAttribute("aria-sort", "ascending");
  });

  it("sort change resets page to 1", async () => {
    const meetingsData = Array.from({ length: 21 }, (_, i) => ({
      id: `m${i + 1}`,
      building_id: "b1",
      building_name: "Alpha Tower",
      title: `Meeting ${i + 1}`,
      status: "open",
      meeting_at: "2024-06-01T10:00:00Z",
      voting_closes_at: "2024-06-01T12:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    }));
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 21 })
      ),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        return HttpResponse.json(meetingsData.slice(offset, offset + limit));
      })
    );
    const user = userEvent.setup();
    renderPage("?page=2");
    await waitFor(() => {
      expect(screen.getByText("Meeting 21")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Title/ }));
    await waitFor(() => {
      expect(screen.getByText("Meeting 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Meeting 21")).not.toBeInTheDocument();
  });

  it("shows error when server returns 422 for invalid sort param", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () => {
        return HttpResponse.json({ detail: "Invalid sort_by value" }, { status: 422 });
      })
    );
    renderPage("?sort_by=INVALID");
    await waitFor(() => {
      expect(screen.getByText("Failed to load General Meetings.")).toBeInTheDocument();
    });
  });

  it("Status column header does NOT have a sortable button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    // Status th should not contain a sort button
    expect(screen.queryByRole("button", { name: /^Status$/ })).not.toBeInTheDocument();
  });

  it("Building column header has a sortable button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Building/ })).toBeInTheDocument();
  });

  it("clicking Building column header activates ascending sort indicator on Building", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024 AGM")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Building/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Building/ }).closest("th"))
        .toHaveAttribute("aria-sort", "ascending");
    });
  });

  // --- RR2-03: filter toggle resets pagination to page 1 ---

  it("RR2-03: changing status filter resets page to 1", async () => {
    // 21 open meetings (2 pages), 1 closed meeting (1 page)
    const openMeetings = Array.from({ length: 21 }, (_, i) => ({
      id: `open${i + 1}`,
      building_id: "b1",
      building_name: "Alpha Tower",
      title: `Open Meeting ${i + 1}`,
      status: "open",
      meeting_at: "2024-06-01T10:00:00Z",
      voting_closes_at: "2024-06-01T12:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
    }));
    const closedMeeting = {
      id: "closed1",
      building_id: "b1",
      building_name: "Alpha Tower",
      title: "Closed Meeting 1",
      status: "closed",
      meeting_at: "2023-06-01T10:00:00Z",
      voting_closes_at: "2023-06-01T12:00:00Z",
      created_at: "2023-01-01T00:00:00Z",
    };

    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", ({ request }) => {
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        if (status === "open") return HttpResponse.json({ count: 21 });
        if (status === "closed") return HttpResponse.json({ count: 1 });
        return HttpResponse.json({ count: 22 });
      }),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        const all = status === "closed" ? [closedMeeting] : status === "open" ? openMeetings : [...openMeetings, closedMeeting];
        return HttpResponse.json(all.slice(offset, offset + limit));
      })
    );

    const user = userEvent.setup();
    renderPage();

    // Wait for page 1 to load
    await waitFor(() => {
      expect(screen.getByText("Open Meeting 1")).toBeInTheDocument();
    });

    // Navigate to page 2
    await user.click(screen.getAllByRole("button", { name: "Go to page 2" })[0]);
    await waitFor(() => {
      expect(screen.getByText("Open Meeting 21")).toBeInTheDocument();
    });

    // Change status filter — page should reset to 1
    await user.selectOptions(screen.getByLabelText("Status"), "closed");

    // Should be back on page 1 showing Closed Meeting 1
    await waitFor(() => {
      expect(screen.getByText("Closed Meeting 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Open Meeting 21")).not.toBeInTheDocument();
  });

  // --- Show archived meetings toggle and archiving actions ---

  it("hides archived meetings by default (server sends is_archived=false)", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", ({ request }) => {
        const url = new URL(request.url);
        const isArchived = url.searchParams.get("is_archived");
        if (isArchived === "false") return HttpResponse.json({ count: 1 });
        return HttpResponse.json({ count: 2 });
      }),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const isArchived = url.searchParams.get("is_archived");
        if (isArchived === "false") {
          return HttpResponse.json([
            {
              id: "active-1",
              building_id: "b1",
              building_name: "Alpha Tower",
              title: "Active AGM",
              status: "open",
              meeting_at: "2024-06-01T10:00:00Z",
              voting_closes_at: "2024-06-01T12:00:00Z",
              created_at: "2024-01-01T00:00:00Z",
              is_archived: false,
            },
          ]);
        }
        return HttpResponse.json([
          {
            id: "active-1",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Active AGM",
            status: "open",
            meeting_at: "2024-06-01T10:00:00Z",
            voting_closes_at: "2024-06-01T12:00:00Z",
            created_at: "2024-01-01T00:00:00Z",
            is_archived: false,
          },
          {
            id: "arch-1",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Old Archived AGM",
            status: "closed",
            meeting_at: "2022-06-01T10:00:00Z",
            voting_closes_at: "2022-06-01T12:00:00Z",
            created_at: "2022-01-01T00:00:00Z",
            is_archived: true,
          },
        ]);
      })
    );

    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Active AGM")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old Archived AGM")).not.toBeInTheDocument();
  });

  it("shows archived meetings when Show archived toggle is checked (server sends is_archived=true)", async () => {
    let capturedIsArchived: string | null = null;
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", ({ request }) => {
        const url = new URL(request.url);
        capturedIsArchived = url.searchParams.get("is_archived");
        return HttpResponse.json({ count: 1 });
      }),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        capturedIsArchived = url.searchParams.get("is_archived");
        if (capturedIsArchived === "true") {
          return HttpResponse.json([
            {
              id: "arch-1",
              building_id: "b1",
              building_name: "Alpha Tower",
              title: "Old Archived AGM",
              status: "closed",
              meeting_at: "2022-06-01T10:00:00Z",
              voting_closes_at: "2022-06-01T12:00:00Z",
              created_at: "2022-01-01T00:00:00Z",
              is_archived: true,
            },
          ]);
        }
        return HttpResponse.json([]);
      })
    );

    const user = userEvent.setup();
    renderPage();

    const toggle = screen.getByLabelText("Show archived meetings");
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();

    await waitFor(() => {
      expect(screen.getByText("Old Archived AGM")).toBeInTheDocument();
      expect(screen.getByText("Archived")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unarchive Old Archived AGM" })).toBeInTheDocument();
    });
    expect(capturedIsArchived).toBe("true");
  });

  it("clicking Archive on a closed meeting opens ConfirmDialog and cancelling closes it", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "closed-1",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Closed AGM 2023",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: false,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      )
    );

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Closed AGM 2023")).toBeInTheDocument();
    });

    const archiveBtn = screen.getByRole("button", { name: "Archive Closed AGM 2023" });
    await user.click(archiveBtn);

    // Confirm dialog should be open
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Archive General Meeting" })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to archive "Closed AGM 2023"\?/)).toBeInTheDocument();
    });

    // Click Cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Archive General Meeting" })).not.toBeInTheDocument();
    });
  });

  it("confirming archive calls archiveGeneralMeeting and refreshes list", async () => {
    let archiveCalledWith = "";
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "closed-to-archive",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Closed AGM to Archive",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: false,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      ),
      http.post("http://localhost/api/admin/general-meetings/:id/archive", ({ params }) => {
        archiveCalledWith = String(params.id);
        return HttpResponse.json({ id: params.id, is_archived: true });
      })
    );

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Closed AGM to Archive")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Archive Closed AGM to Archive" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Archive General Meeting" })).toBeInTheDocument();
    });

    // Click Confirm Archive
    const confirmBtn = screen.getByRole("dialog").querySelector(".btn--danger") as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(archiveCalledWith).toBe("closed-to-archive");
      expect(screen.queryByRole("heading", { name: "Archive General Meeting" })).not.toBeInTheDocument();
    });
  });

  it("shows error when archive fails", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "closed-fail",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Closed AGM Fail",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: false,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      ),
      http.post("http://localhost/api/admin/general-meetings/:id/archive", () =>
        HttpResponse.json({ detail: "Archiving failed due to conflict" }, { status: 409 })
      )
    );

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Closed AGM Fail")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Archive Closed AGM Fail" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Archive General Meeting" })).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("dialog").querySelector(".btn--danger") as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("clicking Unarchive calls unarchiveGeneralMeeting and invalidates query", async () => {
    let unarchiveCalledWith = "";
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "arch-to-unarch",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Archived Meeting 1",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: true,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      ),
      http.post("http://localhost/api/admin/general-meetings/:id/unarchive", ({ params }) => {
        unarchiveCalledWith = String(params.id);
        return HttpResponse.json({ id: params.id, is_archived: false });
      })
    );

    const user = userEvent.setup();
    renderPage();

    // Toggle show archived
    await user.click(screen.getByLabelText("Show archived meetings"));

    await waitFor(() => {
      expect(screen.getByText("Archived Meeting 1")).toBeInTheDocument();
    });

    const unarchiveBtn = screen.getByRole("button", { name: "Unarchive Archived Meeting 1" });
    await user.click(unarchiveBtn);

    await waitFor(() => {
      expect(unarchiveCalledWith).toBe("arch-to-unarch");
    });
  });

  it("handles unarchive error gracefully", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "arch-error",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Archived Error Meeting",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: true,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      ),
      http.post("http://localhost/api/admin/general-meetings/:id/unarchive", () =>
        HttpResponse.json({ detail: "Unarchive failed" }, { status: 409 })
      )
    );

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText("Show archived meetings"));
    await waitFor(() => {
      expect(screen.getByText("Archived Error Meeting")).toBeInTheDocument();
    });

    const unarchiveBtn = screen.getByRole("button", { name: "Unarchive Archived Error Meeting" });
    await user.click(unarchiveBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Unarchive failed");
    });
  });

  it("handles unarchive non-Error rejection gracefully", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "arch-non-err",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Archived Non-Error Meeting",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: true,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      )
    );

    vi.spyOn(adminApi, "unarchiveGeneralMeeting").mockRejectedValueOnce("unarchive string error");

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText("Show archived meetings"));
    await waitFor(() => {
      expect(screen.getByText("Archived Non-Error Meeting")).toBeInTheDocument();
    });

    const unarchiveBtn = screen.getByRole("button", { name: "Unarchive Archived Non-Error Meeting" });
    await user.click(unarchiveBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to unarchive General Meeting");
    });
  });

  it("handles archive non-Error rejection gracefully", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "closed-non-err",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Closed Non-Error Meeting",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: false,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      )
    );

    vi.spyOn(adminApi, "archiveGeneralMeeting").mockRejectedValueOnce("archive string error");

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Closed Non-Error Meeting")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Archive Closed Non-Error Meeting" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Archive General Meeting" })).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("dialog").querySelector(".btn--danger") as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("Failed to archive General Meeting")).toBeInTheDocument();
    });
  });

  it("ConfirmDialog Cancel button is disabled while archive request is pending", async () => {
    let resolveArchive: (value: unknown) => void;
    const archivePromise = new Promise((resolve) => {
      resolveArchive = resolve;
    });

    server.use(
      http.get("http://localhost/api/admin/general-meetings", () =>
        HttpResponse.json([
          {
            id: "closed-pending-check",
            building_id: "b1",
            building_name: "Alpha Tower",
            title: "Closed Pending Check",
            status: "closed",
            meeting_at: "2023-06-01T10:00:00Z",
            voting_closes_at: "2023-06-01T12:00:00Z",
            created_at: "2023-01-01T00:00:00Z",
            is_archived: false,
          },
        ])
      ),
      http.get("http://localhost/api/admin/general-meetings/count", () =>
        HttpResponse.json({ count: 1 })
      ),
      http.post("http://localhost/api/admin/general-meetings/:id/archive", async () => {
        await archivePromise;
        return HttpResponse.json({ id: "closed-pending-check", is_archived: true });
      })
    );

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Closed Pending Check")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Archive Closed Pending Check" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Archive General Meeting" })).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("dialog").querySelector(".btn--danger") as HTMLElement;
    await user.click(confirmBtn);

    // Cancel button is disabled during isPending
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toBeDisabled();

    // Now resolve
    await act(async () => {
      resolveArchive!({});
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Archive General Meeting" })).not.toBeInTheDocument();
    });
  });

  it("prefetches next page when showArchived is true and multiple pages exist", async () => {
    server.use(
      http.get("http://localhost/api/admin/general-meetings/count", ({ request }) => {
        const url = new URL(request.url);
        const isArchived = url.searchParams.get("is_archived");
        if (isArchived === "true") return HttpResponse.json({ count: 21 });
        return HttpResponse.json({ count: 1 });
      }),
      http.get("http://localhost/api/admin/general-meetings", ({ request }) => {
        const url = new URL(request.url);
        const isArchived = url.searchParams.get("is_archived");
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        if (isArchived === "true") {
          const items = Array.from({ length: 21 }, (_, i) => ({
            id: `arch-${i + 1}`,
            building_id: "b1",
            building_name: "Alpha Tower",
            title: `Archived AGM ${i + 1}`,
            status: "closed",
            meeting_at: "2022-06-01T10:00:00Z",
            voting_closes_at: "2022-06-01T12:00:00Z",
            created_at: "2022-01-01T00:00:00Z",
            is_archived: true,
          }));
          return HttpResponse.json(items.slice(offset, offset + 20));
        }
        return HttpResponse.json([]);
      })
    );

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText("Show archived meetings"));

    await waitFor(() => {
      expect(screen.getByText("Archived AGM 1")).toBeInTheDocument();
    });
  });
});
