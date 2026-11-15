import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../tests/msw/server";
import BuildingForm from "../BuildingForm";

function renderComponent(onSuccess = vi.fn(), onCancel = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onSuccess,
    onCancel,
    ...render(
      <QueryClientProvider client={queryClient}>
        <BuildingForm onSuccess={onSuccess} onCancel={onCancel} />
      </QueryClientProvider>
    ),
  };
}

describe("BuildingForm", () => {
  it("renders the form heading, fields, and buttons", () => {
    renderComponent();
    expect(screen.getByRole("heading", { name: "Create Building" })).toBeInTheDocument();
    expect(screen.getByLabelText("OC Plan Number")).toBeInTheDocument();
    expect(screen.getByLabelText("Building Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Manager Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Building" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows error when OC Plan number is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole("button", { name: "Create Building" }));
    expect(screen.getByText("OC Plan number is required.")).toBeInTheDocument();
  });

  it("shows error when building name is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.type(screen.getByLabelText("OC Plan Number"), "PS-123");
    await user.click(screen.getByRole("button", { name: "Create Building" }));
    expect(screen.getByText("Building name is required.")).toBeInTheDocument();
  });

  it("shows error when manager email is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.type(screen.getByLabelText("OC Plan Number"), "PS-123");
    await user.type(screen.getByLabelText("Building Name"), "Test Tower");
    await user.click(screen.getByRole("button", { name: "Create Building" }));
    expect(screen.getByText("Manager email is required.")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderComponent();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onSuccess after successful creation", async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderComponent();
    await user.type(screen.getByLabelText("OC Plan Number"), "PS-123");
    await user.type(screen.getByLabelText("Building Name"), "New Tower");
    await user.type(screen.getByLabelText("Manager Email"), "mgr@example.com");
    await user.click(screen.getByRole("button", { name: "Create Building" }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("submits oc_plan_number when provided", async () => {
    let captured: { name?: string; manager_email?: string; oc_plan_number?: string | null } | null = null;
    server.use(
      http.post("http://localhost/api/admin/buildings", async ({ request }) => {
        captured = await request.json() as typeof captured;
        return HttpResponse.json({
          id: "b-new",
          name: captured?.name,
          manager_email: captured?.manager_email,
          oc_plan_number: captured?.oc_plan_number,
          is_archived: false,
          created_at: "2024-01-01T00:00:00Z",
        }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    const { onSuccess } = renderComponent();
    await user.type(screen.getByLabelText("OC Plan Number"), "OC1234");
    await user.type(screen.getByLabelText("Building Name"), "New Tower");
    await user.type(screen.getByLabelText("Manager Email"), "mgr@example.com");
    await user.click(screen.getByRole("button", { name: "Create Building" }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
    expect((captured as any)?.oc_plan_number).toBe("OC1234");
  });

  it("shows API error on failure", async () => {
    server.use(
      http.post("http://localhost/api/admin/buildings", () => {
        return HttpResponse.json({ detail: "Building already exists" }, { status: 409 });
      })
    );
    const user = userEvent.setup();
    renderComponent();
    await user.type(screen.getByLabelText("OC Plan Number"), "PS-123");
    await user.type(screen.getByLabelText("Building Name"), "Existing Tower");
    await user.type(screen.getByLabelText("Manager Email"), "mgr@example.com");
    await user.click(screen.getByRole("button", { name: "Create Building" }));
    await waitFor(() => {
      expect(screen.getByText(/409/)).toBeInTheDocument();
    });
  });

  // --- US-ACC-08: required field markers ---

  it("Building Name input has aria-required='true'", () => {
    renderComponent();
    expect(screen.getByLabelText("Building Name")).toHaveAttribute("aria-required", "true");
  });

  it("OC Plan Number input has aria-required='true'", () => {
    renderComponent();
    expect(screen.getByLabelText("OC Plan Number")).toHaveAttribute("aria-required", "true");
  });

  it("Manager Email input has aria-required='true'", () => {
    renderComponent();
    expect(screen.getByLabelText("Manager Email")).toHaveAttribute("aria-required", "true");
  });
});
