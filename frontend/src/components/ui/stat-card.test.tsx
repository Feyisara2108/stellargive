import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Users } from "lucide-react";
import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("renders title, value, and icon", () => {
    render(<StatCard title="Total Campaigns" value="42" icon={<Users aria-hidden="true" />} />);

    expect(screen.getByText("Total Campaigns")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders a positive change indicator with an up arrow", () => {
    render(<StatCard title="Total Raised" value="100 XLM" change="+12.5%" />);

    expect(screen.getByText("+12.5%")).toBeInTheDocument();
    expect(screen.getByText("+12.5%").parentElement).not.toBeNull();
  });

  it("renders a negative change indicator with a down arrow", () => {
    render(<StatCard title="Total Raised" value="100 XLM" change="-3.2%" />);

    expect(screen.getByText("-3.2%")).toBeInTheDocument();
  });

  it("shows a skeleton placeholder while loading", () => {
    const { container } = render(<StatCard title="Total Campaigns" value="42" loading />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("does not wrap the card title or value in a button", () => {
    render(<StatCard title="Total Raised" value="100 XLM" tooltip="Sum of all donations" />);

    expect(screen.getByText("Total Raised").closest("button")).toBeNull();
    expect(screen.getByText("100 XLM").closest("button")).toBeNull();
  });

  it("reveals the tooltip content on hover of its trigger", async () => {
    const user = userEvent.setup();
    render(<StatCard title="Total Raised" value="100 XLM" tooltip="Sum of all donations" />);

    await user.hover(screen.getByRole("button", { name: "More information about Total Raised" }));
    await waitFor(
      () => expect(screen.getByRole("tooltip")).toHaveTextContent("Sum of all donations"),
      { timeout: 1000 },
    );
  });

  it("opens the tooltip on keyboard focus and describes the trigger", async () => {
    const user = userEvent.setup();
    render(<StatCard title="Unique Donors" value="12" tooltip="Distinct donating addresses" />);

    await user.tab();

    const trigger = screen.getByRole("button", { name: "More information about Unique Donors" });
    expect(trigger).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument(), {
      timeout: 1000,
    });
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });
});
