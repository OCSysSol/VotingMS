import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../../../../tests/msw/server";
import CreateGeneralMeetingForm from "../CreateGeneralMeetingForm";

vi.mock("../../../utils/parseMotionsExcel");
import { parseMotionsExcel } from "../../../utils/parseMotionsExcel";
const mockParse = vi.mocked(parseMotionsExcel);

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderComponent(initialEntry = "/admin/general-meetings/new") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CreateGeneralMeetingForm />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Select a building via the combobox (waits for the option to appear after API response) */
async function selectBuilding(buildingName: string) {
  const combobox = screen.getByRole("combobox", { name: "Building" });
  fireEvent.click(combobox);
  await waitFor(() => {
    expect(screen.getByRole("listbox", { name: "Buildings" })).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByRole("option", { name: buildingName })).toBeInTheDocument();
  });
  fireEvent.mouseDown(screen.getByRole("option", { name: buildingName }));
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  // Wait for buildings to load in combobox
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Building" }));
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Alpha Tower" })).toBeInTheDocument();
  });
  fireEvent.mouseDown(screen.getByRole("option", { name: "Alpha Tower" }));
  await user.type(screen.getByLabelText("Title", { selector: "#agm-title" }), "Test AGM");
  await user.type(screen.getByLabelText("Meeting Date / Time"), "2025-06-01T10:00");
  await user.type(screen.getByLabelText("Voting Closes At"), "2025-06-01T12:00");
}

describe("CreateGeneralMeetingForm", () => {
  it("renders all form fields", async () => {
    renderComponent();
    expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title", { selector: "#agm-title" })).toBeInTheDocument();
    expect(screen.getByLabelText("Meeting Date / Time")).toBeInTheDocument();
    expect(screen.getByLabelText("Voting Closes At")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create General Meeting" })).toBeInTheDocument();
  });

  it("loads buildings into combobox dropdown", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("combobox", { name: "Building" }));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Alpha Tower" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Beta Court" })).toBeInTheDocument();
    });
  });

  it("does not show archived buildings in the combobox dropdown", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("combobox", { name: "Building" }));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Alpha Tower" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("option", { name: "Gamma House" })).not.toBeInTheDocument();
  });

  it("shows selected building name in combobox input after selection", async () => {
    renderComponent();
    await selectBuilding("Alpha Tower");
    const input = screen.getByRole("combobox", { name: "Building" }) as HTMLInputElement;
    expect(input.value).toBe("Alpha Tower");
  });

  it("preselects the building from the URL query parameter", async () => {
    renderComponent("/admin/general-meetings/new?building=b1");
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Building" })).toHaveValue("Alpha Tower");
    });
  });

  it("shows error when building not selected", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.type(screen.getByLabelText("Title", { selector: "#agm-title" }), "Test AGM");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Please select a building.")).toBeInTheDocument();
  });

  it("shows error when title is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
    });
    await selectBuilding("Alpha Tower");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
  });

  it("shows error when meeting time is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
    });
    await selectBuilding("Alpha Tower");
    await user.type(screen.getByLabelText("Title", { selector: "#agm-title" }), "Test AGM");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Meeting date/time is required.")).toBeInTheDocument();
  });

  it("shows error when voting close time is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
    });
    await selectBuilding("Alpha Tower");
    await user.type(screen.getByLabelText("Title", { selector: "#agm-title" }), "Test AGM");
    await user.type(screen.getByLabelText("Meeting Date / Time"), "2025-06-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Voting close date/time is required.")).toBeInTheDocument();
  });

  it("shows error when voting close is before meeting time", async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
    });
    await selectBuilding("Alpha Tower");
    await user.type(screen.getByLabelText("Title", { selector: "#agm-title" }), "Test AGM");
    await user.type(screen.getByLabelText("Meeting Date / Time"), "2025-06-01T12:00");
    await user.type(screen.getByLabelText("Voting Closes At"), "2025-06-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Voting close time must be after meeting time.")).toBeInTheDocument();
  });

  it("shows error when no motions are present", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);
    // Remove the default motion
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("At least one motion is required.")).toBeInTheDocument();
  });

  it("shows error when motion title is empty", async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Building" })).toBeInTheDocument();
    });
    await selectBuilding("Alpha Tower");
    await user.type(screen.getByLabelText("Title", { selector: "#agm-title" }), "Test AGM");
    await user.type(screen.getByLabelText("Meeting Date / Time"), "2025-06-01T10:00");
    await user.type(screen.getByLabelText("Voting Closes At"), "2025-06-01T12:00");
    // Default motion has empty title — don't fill it
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Motion 1 title is required.")).toBeInTheDocument();
  });

  it("submits form and navigates to General Meeting detail on success", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "First Motion");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/general-meetings/agm-new");
    });
  });

  it("renders the Download template link in the form", () => {
    renderComponent();
    const link = screen.getByRole("link", { name: "Download template" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/agm_motions_template.csv");
  });

  it("renders the Upload motions (CSV or Excel) input in the form", () => {
    renderComponent();
    expect(screen.getByLabelText("Upload motions (CSV or Excel)")).toBeInTheDocument();
  });

  it("pre-populates motions after successful Excel parse", async () => {
    const motions = [
      { title: "Imported Motion 1", description: "", motion_number: "", motion_type: "general" as const },
      { title: "Imported Motion 2", description: "", motion_number: "", motion_type: "special" as const },
    ];
    mockParse.mockResolvedValue({ motions });

    const user = userEvent.setup();
    renderComponent();

    const file = new File([""], "motions.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText("Upload motions (CSV or Excel)"), file);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Imported Motion 1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Imported Motion 2")).toBeInTheDocument();
    });
  });

  it("renders Motion Type dropdown with default value 'general'", async () => {
    renderComponent();
    const selects = await screen.findAllByLabelText("Motion Type") as HTMLSelectElement[];
    expect(selects[0].value).toBe("general");
  });

  it("shows 409 conflict error from server", async () => {
    server.use(
      http.post("http://localhost/api/admin/general-meetings", () => {
        return HttpResponse.json(
          { detail: "An open General Meeting already exists for this building" },
          { status: 409 }
        );
      })
    );
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "First Motion");
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    await waitFor(() => {
      expect(screen.getByText(/409/)).toBeInTheDocument();
    });
  });

  // --- US-ACC-08: Required field legend and aria-required ---

  it("shows '* Required field' legend", () => {
    renderComponent();
    expect(screen.getByText(/Required field/)).toBeInTheDocument();
  });

  it("AGM Title input has aria-required=true", () => {
    renderComponent();
    expect(screen.getByLabelText("Title", { selector: "#agm-title" })).toHaveAttribute("aria-required", "true");
  });

  it("Meeting Date / Time input has aria-required=true", () => {
    renderComponent();
    expect(screen.getByLabelText("Meeting Date / Time")).toHaveAttribute("aria-required", "true");
  });

  it("Voting Closes At input has aria-required=true", () => {
    renderComponent();
    expect(screen.getByLabelText("Voting Closes At")).toHaveAttribute("aria-required", "true");
  });

  // --- Multi-choice motion validation ---

  it("shows error when multi-choice motion has fewer than 2 options", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    // Enable multi-choice via checkbox
    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);

    // Fill motion title
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    // Just attempt to submit with empty options
    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText(/multi-choice requires at least 2 options/i)).toBeInTheDocument();
  });

  it("shows error when multi-choice option limit exceeds option count", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    // Enable multi-choice via checkbox
    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    // Fill both options
    const optionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(optionInputs[0], "Alice");
    await user.type(optionInputs[1], "Bob");

    // Set option limit to 3 (> 2 options)
    const limitInput = screen.getByLabelText(/Max selections per voter/);
    await user.clear(limitInput);
    await user.type(limitInput, "3");

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText(/option limit cannot exceed option count/i)).toBeInTheDocument();
  });

  it("shows error when multi-choice motion has option limit less than 1", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    // Enable multi-choice via checkbox
    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    // Fill both options
    const optionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(optionInputs[0], "Alice");
    await user.type(optionInputs[1], "Bob");

    // Set option limit to 0 (invalid)
    const limitInput = screen.getByLabelText(/Max selections per voter/);
    await user.clear(limitInput);
    await user.type(limitInput, "0");

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText(/option limit must be at least 1/i)).toBeInTheDocument();
  });

  it("submits form with multi-choice motion and navigates on success", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    // Enable multi-choice via checkbox
    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    // Fill both options
    const optionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(optionInputs[0], "Alice");
    await user.type(optionInputs[1], "Bob");

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/general-meetings/agm-new");
    });
  });

  it("shows error when multi-choice option text exceeds 1,000 characters", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    const optionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    fireEvent.change(optionInputs[0], { target: { value: "A".repeat(1001) } });
    await user.type(optionInputs[1], "Bob");

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText(/Motion 1, Option 1 exceeds the 1,000 character limit/i)).toBeInTheDocument();
  });

  it("shows error when multi-choice option text is whitespace-only", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    const optionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(optionInputs[0], "Alice");
    await user.type(optionInputs[1], "Bob");
    await user.click(screen.getByRole("button", { name: "+ Add option" }));

    const updatedOptionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(updatedOptionInputs[2], "   ");

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText(/Motion 1, Option 3: option text must not be empty/i)).toBeInTheDocument();
  });

  it("shows error when motion title exceeds 500 characters", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    const titleInput = screen.getByLabelText("Title", { selector: "#motion-title-0" });
    fireEvent.change(titleInput, { target: { value: "T".repeat(501) } });

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Motion 1: Title exceeds the 500 character limit (501/500 characters).")).toBeInTheDocument();
  });

  it("shows error when motion number exceeds 50 characters", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Valid Title");
    const numInput = screen.getByLabelText("Motion number (optional)", { selector: "#motion-number-0" });
    fireEvent.change(numInput, { target: { value: "N".repeat(51) } });

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Motion 1: Motion number exceeds the 50 character limit (51/50 characters).")).toBeInTheDocument();
  });

  it("shows error when motion description exceeds 5,000 characters", async () => {
    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Valid Title");
    const descInput = screen.getByLabelText("Description", { selector: "#motion-desc-0" });
    fireEvent.change(descInput, { target: { value: "D".repeat(5001) } });

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    expect(screen.getByText("Motion 1: Description exceeds the 5,000 character limit (5,001/5000 characters).")).toBeInTheDocument();
  });

  it("surfaces formatted 422 error from server when option validation fails", async () => {
    server.use(
      http.post("http://localhost/api/admin/general-meetings", () => {
        return HttpResponse.json(
          { detail: [{ loc: ["body", "motions", 0, "options", 0, "text"], msg: "Value error, option text must not exceed 1000 characters" }] },
          { status: 422 }
        );
      })
    );

    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    const multiChoiceCheckboxes = screen.getAllByRole("checkbox");
    await user.click(multiChoiceCheckboxes[0]);
    await user.type(screen.getByLabelText("Title", { selector: "#motion-title-0" }), "Election");

    const optionInputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(optionInputs[0], "Alice");
    await user.type(optionInputs[1], "Bob");

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    await waitFor(() => {
      expect(screen.getByText("Motion 1, Option 1: Option text - option text must not exceed 1000 characters")).toBeInTheDocument();
    });
  });

  it("submits successfully when imported motions have null motion_number and no options", async () => {
    const motions = [
      { title: "Imported Motion 1", description: "", motion_number: null, motion_type: "general" as const },
    ];
    mockParse.mockResolvedValue({ motions });

    const user = userEvent.setup();
    renderComponent();
    await fillAndSubmit(user);

    const file = new File([""], "motions.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText("Upload motions (CSV or Excel)"), file);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Imported Motion 1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create General Meeting" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/general-meetings/agm-new");
    });
  });
});
