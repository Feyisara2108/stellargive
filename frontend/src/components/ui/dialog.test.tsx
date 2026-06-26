import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";

expect.extend(toHaveNoViolations);

function TestDialog({
  defaultOpen = false,
  onOpenChange,
}: {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogTrigger>Open Dialog</DialogTrigger>
      <DialogContent aria-describedby="dialog-desc">
        <DialogTitle>Test Dialog</DialogTitle>
        <DialogDescription id="dialog-desc">Dialog description</DialogDescription>
        <button>Action button</button>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("does not render dialog content when closed", () => {
    render(<TestDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Test Dialog")).toBeVisible();
  });

  it("closes via the built-in close button", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on ESC key", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes when the overlay is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));
    await screen.findByRole("dialog");

    // Radix DismissableLayer listens for pointerdown outside the content.
    // fireEvent bypasses CSS pointer-events restrictions present in jsdom.
    fireEvent.pointerDown(document.body, { bubbles: true, cancelable: true });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("calls onOpenChange with false when closed", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<TestDialog onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));
    await screen.findByRole("dialog");
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("has role=dialog and aria-labelledby linking to the title", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));

    // findByRole("dialog") already asserts role=dialog is present.
    const dialog = await screen.findByRole("dialog");
    // Radix sets aria-labelledby to the DialogTitle's generated id.
    expect(dialog).toHaveAttribute("aria-labelledby");
    const labelId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelId)).toHaveTextContent("Test Dialog");
  });

  it("traps focus inside the dialog while open", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));
    await screen.findByRole("dialog");

    // Tab through all focusable elements; focus must stay inside the dialog
    const actionBtn = screen.getByRole("button", { name: /action button/i });
    const closeBtn = screen.getByRole("button", { name: /close/i });

    await user.tab();
    expect(document.activeElement).toBeOneOf([actionBtn, closeBtn]);

    await user.tab();
    expect(document.activeElement).toBeOneOf([actionBtn, closeBtn]);
  });

  it("returns focus to the trigger after close", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    const trigger = screen.getByRole("button", { name: /open dialog/i });
    await user.click(trigger);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(document.activeElement).toBe(trigger);
  });

  it("renders with no accessibility violations when open", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: /open dialog/i }));

    const dialog = await screen.findByRole("dialog");
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });
});
