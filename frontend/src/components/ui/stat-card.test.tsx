import { describe, it, expect, vi } from "vitest";
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

  it("reveals the tooltip content on hover", async () => {
    const user = userEvent.setup();
    render(<StatCard title="Total Raised" value="100 XLM" tooltip="Sum of all donations" />);
    await user.hover(screen.getByText("Total Raised"));
    await waitFor(
      () => expect(screen.getByRole("tooltip")).toHaveTextContent("Sum of all donations"),
      { timeout: 1000 },
    );
  });
});
