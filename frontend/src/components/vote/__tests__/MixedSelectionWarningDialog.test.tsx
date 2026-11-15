import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MixedSelectionWarningDialog } from "../MixedSelectionWarningDialog";
import type { MotionOut } from "../../../api/voter";

const motion: MotionOut = {
  id: "m1",
  title: "Approve the budget",
  description: null,
  display_order: 1,
  motion_number: null,
  motion_type: "general",
  is_visible: true,
  already_voted: false,
  submitted_choice: null,
  option_limit: null,
  options: [],
};

function renderDialog(partialMotions: MotionOut[] = [motion]) {
  return render(
    <MixedSelectionWarningDialog
      partialMotions={partialMotions}
      onContinue={() => {}}
      onGoBack={() => {}}
    />,
  );
}

describe("MixedSelectionWarningDialog", () => {
  it("renders the partial-vote warning title", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Some votes are already recorded" }),
    ).toBeInTheDocument();
  });

  it("explains that recorded votes are immutable and only apply to outstanding lots", () => {
    renderDialog();
    expect(
      screen.getByText(/recorded votes will not be changed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/applies only to the selected lots that have not yet voted/i),
    ).toBeInTheDocument();
  });

  it("lists motions with partial selected-lot coverage", () => {
    renderDialog();
    expect(
      screen.getByText("Motion 1: Approve the budget"),
    ).toBeInTheDocument();
  });

  it("renders both actions and continues", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <MixedSelectionWarningDialog
        partialMotions={[motion]}
        onContinue={onContinue}
        onGoBack={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("returns when Go back is clicked", async () => {
    const user = userEvent.setup();
    const onGoBack = vi.fn();
    render(
      <MixedSelectionWarningDialog
        partialMotions={[motion]}
        onContinue={() => {}}
        onGoBack={onGoBack}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Go back to lot selection" }));
    expect(onGoBack).toHaveBeenCalledOnce();
  });

  it("has dialog role, initial focus, and wraps Tab focus", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const goBackBtn = screen.getByRole("button", { name: "Go back to lot selection" });
    const continueBtn = screen.getByRole("button", { name: "Continue" });
    expect(goBackBtn).toHaveFocus();
    continueBtn.focus();
    await user.tab();
    expect(goBackBtn).toHaveFocus();
  });

  it("wraps Shift+Tab focus from first to last", async () => {
    const user = userEvent.setup();
    renderDialog();
    const goBackBtn = screen.getByRole("button", { name: "Go back to lot selection" });
    const continueBtn = screen.getByRole("button", { name: "Continue" });
    goBackBtn.focus();
    await user.tab({ shift: true });
    expect(continueBtn).toHaveFocus();
  });

  it("renders no affected-motion list when none are supplied", () => {
    renderDialog([]);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("Do you want to continue?")).toBeInTheDocument();
  });
});
