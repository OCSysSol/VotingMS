import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MotionEditor from "../MotionEditor";
import type { MotionFormEntry } from "../MotionEditor";

const initialMotions: MotionFormEntry[] = [
  { title: "Motion 1", description: "Desc 1", motion_number: "", motion_type: "general" },
  { title: "Motion 2", description: "", motion_number: "SR-1", motion_type: "special" },
];

describe("MotionEditor", () => {
  // --- Happy path ---

  it("renders existing motions", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    expect(screen.getByDisplayValue("Motion 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Desc 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Motion 2")).toBeInTheDocument();
  });

  it("shows Add Motion button", () => {
    render(<MotionEditor motions={[]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "+ Add Motion" })).toBeInTheDocument();
  });

  it("calls onChange with new motion when Add Motion clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "+ Add Motion" }));
    expect(onChange).toHaveBeenCalledWith([
      ...initialMotions,
      { title: "", description: "", motion_number: "", motion_type: "general", is_multi_choice: false, option_limit: "1", options: [{ text: "" }, { text: "" }] },
    ]);
  });

  it("calls onChange without the removed motion when Remove clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([initialMotions[1]]);
  });

  it("calls onChange with updated title when title input changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    const titleInputs = screen.getAllByLabelText("Title");
    await user.type(titleInputs[0], "X");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].title).toBe("Motion 1X");
  });

  it("calls onChange with updated description when textarea changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    const descTextareas = screen.getAllByLabelText("Description");
    await user.type(descTextareas[0], "X");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].description).toBe("Desc 1X");
  });

  it("renders motion index headers", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    expect(screen.getByText("Motion 1")).toBeInTheDocument();
    expect(screen.getByText("Motion 2")).toBeInTheDocument();
  });

  it("renders Motion Type dropdown with correct default value", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    const selects = screen.getAllByLabelText("Motion Type") as HTMLSelectElement[];
    expect(selects[0].value).toBe("general");
    expect(selects[1].value).toBe("special");
  });

  it("calls onChange with updated motion_type when dropdown changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    const selects = screen.getAllByLabelText("Motion Type");
    await user.selectOptions(selects[0], "special");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].motion_type).toBe("special");
  });

  it("renders motion number input with correct initial value", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    const inputs = screen.getAllByLabelText("Motion number (optional)") as HTMLInputElement[];
    expect(inputs[0].value).toBe("");
    expect(inputs[1].value).toBe("SR-1");
  });

  it("calls onChange with updated motion_number when motion number input changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    const inputs = screen.getAllByLabelText("Motion number (optional)");
    await user.type(inputs[0], "1");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].motion_number).toBe("1");
  });

  // --- Motion Type select only has General and Special ---

  it("Motion Type dropdown only has General and Special options", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    const selects = screen.getAllByLabelText("Motion Type") as HTMLSelectElement[];
    const options = Array.from(selects[0].options).map((o) => o.value);
    expect(options).toEqual(["general", "special"]);
    expect(options).not.toContain("multi_choice");
  });

  // --- Multi-choice checkbox ---

  it("renders Multi-choice question format checkbox unchecked by default", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(false);
  });

  it("calls onChange with is_multi_choice true when checkbox is checked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MotionEditor motions={initialMotions} onChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].is_multi_choice).toBe(true);
  });

  it("calls onChange with is_multi_choice false when checkbox is unchecked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const motionWithMultiChoice: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[motionWithMultiChoice]} onChange={onChange} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await user.click(checkbox);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].is_multi_choice).toBe(false);
  });

  it("shows option limit and options fields when is_multi_choice is true", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "2",
      options: [{ text: "Alice" }, { text: "Bob" }, { text: "Carol" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);
    expect(screen.getByLabelText("Max selections per voter")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Carol")).toBeInTheDocument();
  });

  it("does not show option fields when is_multi_choice is false", () => {
    render(<MotionEditor motions={initialMotions} onChange={() => {}} />);
    expect(screen.queryByLabelText("Max selections per voter")).not.toBeInTheDocument();
  });

  it("calls onChange when option text is updated", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={onChange} />);
    const opt1Input = screen.getByDisplayValue("Alice");
    await user.type(opt1Input, "X");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].options[0].text).toBe("AliceX");
  });

  it("calls onChange when option limit is updated", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={onChange} />);
    const limitInput = screen.getByLabelText("Max selections per voter") as HTMLInputElement;
    // Type a single character to trigger onChange (appends to "1" → "12" but we just check the call happened)
    await user.type(limitInput, "2");
    expect(onChange).toHaveBeenCalled();
    // The field value after appending "2" to "1" is "12"
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].option_limit).toBe("12");
  });

  it("adds a new option when + Add option clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "+ Add option" }));
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].options).toHaveLength(3);
    expect(lastCall[0].options[2].text).toBe("");
  });

  it("removes an option when remove button clicked (only when > 2 options)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }, { text: "Carol" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={onChange} />);
    // Remove the first option
    const removeButtons = screen.getAllByRole("button", { name: /Remove motion 1 option/ });
    await user.click(removeButtons[0]);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].options).toHaveLength(2);
    expect(lastCall[0].options[0].text).toBe("Bob");
  });

  it("does not show remove button when exactly 2 options", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /Remove motion 1 option/ })).not.toBeInTheDocument();
  });

  it("shows option_limit value from motion when not null", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: null,
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "3",  // non-null
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);
    const limitInput = screen.getByLabelText("Max selections per voter") as HTMLInputElement;
    expect(limitInput.value).toBe("3");  // uses the value, not the ?? "1" fallback
  });

  it("shows motion_number when set (non-null branch of ??)", () => {
    const motionWithNumber: MotionFormEntry = {
      title: "Motion",
      description: "",
      motion_number: "SR-1",
      motion_type: "general",
    };
    render(<MotionEditor motions={[motionWithNumber]} onChange={() => {}} />);
    const input = screen.getByLabelText("Motion number (optional)") as HTMLInputElement;
    expect(input.value).toBe("SR-1");  // non-null value, not the "" fallback
  });

  it("shows options from motion when options is non-null", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: null,
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],  // non-null options array
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();  // uses real options
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
  });

  it("renders is_multi_choice checkbox as checked when is_multi_choice is true", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: null,
      motion_type: "special",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("can combine special resolution type with multi-choice question format", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const specialMotion: MotionFormEntry = {
      title: "Special Election",
      description: "",
      motion_number: "",
      motion_type: "special",
      is_multi_choice: false,
    };
    render(<MotionEditor motions={[specialMotion]} onChange={onChange} />);
    // Check that motion_type select shows "special"
    const select = screen.getByLabelText("Motion Type") as HTMLSelectElement;
    expect(select.value).toBe("special");
    // Check checkbox is unchecked
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    // Enable multi-choice
    await user.click(checkbox);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].motion_type).toBe("special");
    expect(lastCall[0].is_multi_choice).toBe(true);
  });

  // --- Option textarea and character counter ---

  it("renders multi-choice options as textareas with field__input--textarea", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [{ text: "Alice" }, { text: "Bob" }],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);
    const textarea = screen.getByLabelText("Motion 1 option 1");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveClass("field__input--textarea");
    expect(textarea).toHaveAttribute("rows", "2");
  });

  it("renders live character counters with neutral, warning, and error classes for option text", () => {
    const mcMotion: MotionFormEntry = {
      title: "Election",
      description: "",
      motion_number: "",
      motion_type: "general",
      is_multi_choice: true,
      option_limit: "1",
      options: [
        { text: "A".repeat(500) },   // neutral (< 900)
        { text: "B".repeat(950) },   // warning (900..1000)
        { text: "C".repeat(1005) },  // error (> 1000)
      ],
    };
    render(<MotionEditor motions={[mcMotion]} onChange={() => {}} />);

    const counter1 = screen.getByTestId("motion-1-option-1-counter");
    expect(counter1).toHaveTextContent("500/1000");
    expect(counter1).toHaveClass("field__counter");
    expect(counter1).not.toHaveClass("field__counter--warning");
    expect(counter1).not.toHaveClass("field__counter--error");

    const counter2 = screen.getByTestId("motion-1-option-2-counter");
    expect(counter2).toHaveTextContent("950/1000");
    expect(counter2).toHaveClass("field__counter--warning");
    expect(counter2).not.toHaveClass("field__counter--error");

    const counter3 = screen.getByTestId("motion-1-option-3-counter");
    expect(counter3).toHaveTextContent("1005/1000");
    expect(counter3).toHaveClass("field__counter--error");
  });

  it("renders live character counters and aria attributes for Title, Motion number, and Description", () => {
    const motion: MotionFormEntry = {
      title: "T".repeat(200),
      motion_number: "123",
      description: "D".repeat(1000),
      motion_type: "general",
    };
    render(<MotionEditor motions={[motion]} onChange={() => {}} />);

    // Neutral states
    const titleCounter = screen.getByTestId("motion-1-title-counter");
    expect(titleCounter).toHaveTextContent("200/500");
    expect(titleCounter).toHaveClass("field__counter");
    expect(titleCounter).not.toHaveClass("field__counter--warning");
    expect(titleCounter).not.toHaveClass("field__counter--error");

    const numCounter = screen.getByTestId("motion-1-number-counter");
    expect(numCounter).toHaveTextContent("3/50");
    expect(numCounter).toHaveClass("field__counter");
    expect(numCounter).not.toHaveClass("field__counter--warning");
    expect(numCounter).not.toHaveClass("field__counter--error");

    const descCounter = screen.getByTestId("motion-1-desc-counter");
    expect(descCounter).toHaveTextContent("1000/5000");
    expect(descCounter).toHaveClass("field__counter");
    expect(descCounter).not.toHaveClass("field__counter--warning");
    expect(descCounter).not.toHaveClass("field__counter--error");

    const titleInput = screen.getByLabelText("Title");
    expect(titleInput).toHaveAttribute("aria-invalid", "false");
    expect(titleInput).toHaveAttribute("aria-describedby", "motion-title-counter-0");

    const numInput = screen.getByLabelText("Motion number (optional)");
    expect(numInput).toHaveAttribute("aria-invalid", "false");
    expect(numInput).toHaveAttribute("aria-describedby", "motion-number-counter-0");

    const descInput = screen.getByLabelText("Description");
    expect(descInput).toHaveAttribute("aria-invalid", "false");
    expect(descInput).toHaveAttribute("aria-describedby", "motion-desc-counter-0");
  });

  it("displays warning styling at >= 90% and error styling when exceeding limit for Title, Number, and Description", () => {
    const warningMotion: MotionFormEntry = {
      title: "T".repeat(450),
      motion_number: "N".repeat(45),
      description: "D".repeat(4500),
      motion_type: "general",
    };
    const { rerender } = render(<MotionEditor motions={[warningMotion]} onChange={() => {}} />);

    expect(screen.getByTestId("motion-1-title-counter")).toHaveClass("field__counter--warning");
    expect(screen.getByTestId("motion-1-number-counter")).toHaveClass("field__counter--warning");
    expect(screen.getByTestId("motion-1-desc-counter")).toHaveClass("field__counter--warning");

    const errorMotion: MotionFormEntry = {
      title: "T".repeat(501),
      motion_number: "N".repeat(51),
      description: "D".repeat(5001),
      motion_type: "general",
    };
    rerender(<MotionEditor motions={[errorMotion]} onChange={() => {}} />);

    const titleCounter = screen.getByTestId("motion-1-title-counter");
    expect(titleCounter).toHaveTextContent("501/500");
    expect(titleCounter).toHaveClass("field__counter--error");
    const titleInput = screen.getByLabelText("Title");
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(titleInput).toHaveClass("field__input--error");

    const numCounter = screen.getByTestId("motion-1-number-counter");
    expect(numCounter).toHaveTextContent("51/50");
    expect(numCounter).toHaveClass("field__counter--error");
    const numInput = screen.getByLabelText("Motion number (optional)");
    expect(numInput).toHaveAttribute("aria-invalid", "true");
    expect(numInput).toHaveClass("field__input--error");

    const descCounter = screen.getByTestId("motion-1-desc-counter");
    expect(descCounter).toHaveTextContent("5001/5000");
    expect(descCounter).toHaveClass("field__counter--error");
    const descInput = screen.getByLabelText("Description");
    expect(descInput).toHaveAttribute("aria-invalid", "true");
    expect(descInput).toHaveClass("field__input--error");
  });

  it("handles updating, adding, and removing options in multi-motion list without options predefined", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const motions: MotionFormEntry[] = [
      { title: "Motion 1", description: "", motion_number: "", motion_type: "general" },
      { title: "Motion 2", description: "", motion_number: "", motion_type: "general", is_multi_choice: true },
    ];
    const { rerender } = render(<MotionEditor motions={motions} onChange={onChange} />);

    // Add option on motion 2 (which had undefined options)
    await user.click(screen.getByRole("button", { name: "+ Add option" }));
    expect(onChange).toHaveBeenCalled();

    // Re-render with 3 options on motion 2
    const motionsWith3Opts: MotionFormEntry[] = [
      { title: "Motion 1", description: "", motion_number: "", motion_type: "general" },
      { title: "Motion 2", description: "", motion_number: "", motion_type: "general", is_multi_choice: true, options: [{ text: "Opt 1" }, { text: "Opt 2" }, { text: "Opt 3" }] },
    ];
    rerender(<MotionEditor motions={motionsWith3Opts} onChange={onChange} />);

    // Type in option 1 of motion 2
    await user.type(screen.getByDisplayValue("Opt 1"), "A");
    expect(onChange).toHaveBeenCalled();

    // Remove option 3 of motion 2
    const removeBtns = screen.getAllByRole("button", { name: /Remove motion 2 option/ });
    await user.click(removeBtns[2]);
    expect(onChange).toHaveBeenCalled();

    // Test updateOption when options is undefined
    const motionsUndefinedOpts: MotionFormEntry[] = [
      { title: "Motion 1", description: "", motion_number: "", motion_type: "general" },
      { title: "Motion 2", description: "", motion_number: "", motion_type: "general", is_multi_choice: true, options: undefined },
    ];
    rerender(<MotionEditor motions={motionsUndefinedOpts} onChange={onChange} />);
    const inputs = screen.getAllByPlaceholderText(/Option [0-9]+/);
    await user.type(inputs[0], "Z");
    expect(onChange).toHaveBeenCalled();
  });
});
