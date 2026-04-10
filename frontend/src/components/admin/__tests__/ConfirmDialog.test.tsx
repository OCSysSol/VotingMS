import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../ConfirmDialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const props: React.ComponentProps<typeof ConfirmDialog> = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isPending: false,
    error: null,
    title: "Confirm Action",
    titleId: "confirm-title",
    message: "Are you sure?",
    confirmLabel: "Confirm",
    ...overrides,
  };
  return { ...render(<ConfirmDialog {...props} />), props };
}

describe("ConfirmDialog", () => {
  // --- Happy path ---

  it("renders dialog with title, message, and buttons when isOpen=true", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onClose when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when Confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  // --- Not rendered when closed ---

  it("renders nothing when isOpen=false", () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // --- Error state ---

  it("shows error message with role=alert when error is provided", () => {
    renderDialog({ error: "Something went wrong" });
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Something went wrong");
  });

  it("does not render error paragraph when error is null", () => {
    renderDialog({ error: null });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // --- Icon ---

  it("renders icon when provided", () => {
    renderDialog({ icon: "⚠" });
    expect(screen.getByText("⚠")).toBeInTheDocument();
  });

  it("does not render icon container when icon is not provided", () => {
    const { container } = renderDialog({ icon: undefined });
    expect(container.querySelector(".dialog__icon")).not.toBeInTheDocument();
  });

  // --- Custom labels and class ---

  it("uses custom confirmLabel", () => {
    renderDialog({ confirmLabel: "Delete" });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("uses custom cancelLabel", () => {
    renderDialog({ cancelLabel: "Go back" });
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });

  it("applies custom confirmClassName to confirm button", () => {
    renderDialog({ confirmClassName: "btn btn--primary" });
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass("btn--primary");
  });

  // --- Pending state ---

  it("disables both buttons when isPending=true", () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  // --- Focus trap ---

  it("focuses first focusable element when dialog opens", async () => {
    renderDialog();
    // After render, first focusable element (Cancel) should have focus
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toHaveFocus();
  });

  it("does not attempt to focus when isOpen transitions from true to false (no focusable)", () => {
    // When dialog is closed, useEffect bails out early — no errors thrown
    const { rerender, props } = renderDialog({ isOpen: true });
    act(() => {
      rerender(
        <ConfirmDialog
          {...props}
          isOpen={false}
        />
      );
    });
    // No dialog in the DOM and no errors
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("wraps Tab focus from last button to first button", async () => {
    const user = userEvent.setup();
    renderDialog();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    confirmBtn.focus();
    await user.tab();
    expect(cancelBtn).toHaveFocus();
  });

  it("wraps Shift+Tab focus from first button to last button", async () => {
    const user = userEvent.setup();
    renderDialog();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    cancelBtn.focus();
    await user.tab({ shift: true });
    expect(confirmBtn).toHaveFocus();
  });

  it("Tab from non-last button does not wrap focus", async () => {
    // When Cancel is NOT the last focusable and focus is not at the last element,
    // pressing Tab should not call preventDefault — normal browser Tab occurs.
    // This tests the else branch: document.activeElement !== last → do nothing.
    const user = userEvent.setup();
    renderDialog();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    // Focus the first button (Cancel) and press Tab — should move to Confirm normally
    cancelBtn.focus();
    await user.tab();
    // Browser moves focus forward to Confirm since Cancel is not the last button
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  it("Shift+Tab from non-first button does not wrap focus", async () => {
    // When Confirm is NOT the first focusable and focus is not at the first element,
    // Shift+Tab should not call preventDefault — normal browser Shift+Tab occurs.
    const user = userEvent.setup();
    renderDialog();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    // Focus the last button and press Shift+Tab — should move to Cancel (normal browser behavior)
    confirmBtn.focus();
    await user.tab({ shift: true });
    expect(cancelBtn).toHaveFocus();
  });

  it("non-Tab key does not trigger focus trap logic", async () => {
    const user = userEvent.setup();
    renderDialog();
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    cancelBtn.focus();
    // Pressing Escape should not throw or change focus in an unexpected way
    await user.keyboard("{Escape}");
    // Dialog still present (Escape is not handled by ConfirmDialog)
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Tab key when no focusable elements present does not throw", () => {
    // When all buttons are disabled, querySelectorAll returns an empty NodeList.
    // The handleKeyDown early-return guard (focusable.length === 0) must not throw.
    renderDialog({ isPending: true });
    const dialog = screen.getByRole("dialog");
    // Fire a Tab key event on the dialog overlay directly
    act(() => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });
    // No error thrown; dialog still present
    expect(dialog).toBeInTheDocument();
  });

  // --- Accessibility ---

  it("has role=dialog with aria-modal=true", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("dialog is labelled by title element via aria-labelledby", () => {
    renderDialog({ titleId: "my-title-id" });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "my-title-id");
    expect(screen.getByText("Confirm Action")).toHaveAttribute("id", "my-title-id");
  });
});
