import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";

function TestTooltip({
  delayDuration = 0,
  open,
  onOpenChange,
}: {
  delayDuration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Tooltip delayDuration={delayDuration} open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger>
        <button type="button">Trigger</button>
      </TooltipTrigger>
      <TooltipContent>Tooltip text</TooltipContent>
    </Tooltip>
  );
}

describe("Tooltip", () => {
  it("does not render tooltip content by default", () => {
    render(<TestTooltip />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip on mouse enter (with delay=0)", async () => {
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} />);

    await user.hover(screen.getByRole("button", { name: /trigger/i }));

    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Tooltip text");
  });

  it("hides tooltip on mouse leave", async () => {
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} />);

    await user.hover(screen.getByRole("button", { name: /trigger/i }));
    await screen.findByRole("tooltip");

    await user.unhover(screen.getByRole("button", { name: /trigger/i }));

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("shows tooltip on keyboard focus", async () => {
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} />);

    await user.tab();

    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  });

  it("hides tooltip on blur", async () => {
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} />);

    await user.tab();
    await screen.findByRole("tooltip");

    await user.tab();

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("dismisses tooltip on Escape key", async () => {
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} />);

    await user.hover(screen.getByRole("button", { name: /trigger/i }));
    await screen.findByRole("tooltip");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("trigger child has aria-describedby linking to the tooltip id", async () => {
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} />);

    await user.hover(screen.getByRole("button", { name: /trigger/i }));

    const tooltip = await screen.findByRole("tooltip");
    const trigger = screen.getByRole("button", { name: /trigger/i });

    const tooltipId = tooltip.getAttribute("id");
    expect(tooltipId).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-describedby", tooltipId!);
  });

  it("renders in controlled open=true state", () => {
    render(<TestTooltip open={true} />);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("does not render when controlled open=false", () => {
    render(<TestTooltip open={false} />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("fires onOpenChange(true) on hover", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} onOpenChange={onOpenChange} />);

    await user.hover(screen.getByRole("button", { name: /trigger/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
  });

  it("fires onOpenChange(false) on mouse leave", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<TestTooltip delayDuration={0} onOpenChange={onOpenChange} />);

    await user.hover(screen.getByRole("button", { name: /trigger/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));

    await user.unhover(screen.getByRole("button", { name: /trigger/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("respects delayDuration from TooltipProvider", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger>
            <button type="button">Trigger</button>
          </TooltipTrigger>
          <TooltipContent>Delayed tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole("button", { name: /trigger/i }));

    // Before delay elapses, tooltip should not be visible
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
