import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

function TestTabs({
  defaultValue = "tab1",
  onValueChange,
}: {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Tabs defaultValue={defaultValue} onValueChange={onValueChange}>
      <TabsList aria-label="Demo tabs">
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Panel 1</TabsContent>
      <TabsContent value="tab2">Panel 2</TabsContent>
      <TabsContent value="tab3">Panel 3</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders the default selected tab panel", () => {
    render(<TestTabs defaultValue="tab2" />);
    expect(screen.getByRole("tabpanel")).not.toHaveAttribute("hidden");
    expect(screen.getByText("Panel 2")).toBeInTheDocument();
  });

  it("non-selected panels are hidden", () => {
    render(<TestTabs defaultValue="tab1" />);
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    const hidden = panels.filter((p) => p.hasAttribute("hidden"));
    expect(hidden).toHaveLength(2);
  });

  it("clicking a tab makes its panel visible", async () => {
    const user = userEvent.setup();
    render(<TestTabs />);

    await user.click(screen.getByRole("tab", { name: /Tab 2/i }));

    const panel2 = screen.getByRole("tabpanel", { name: /Tab 2/i, hidden: false });
    expect(panel2).not.toHaveAttribute("hidden");
    expect(panel2).toHaveTextContent("Panel 2");
  });

  it("active tab has aria-selected=true, others have aria-selected=false", () => {
    render(<TestTabs defaultValue="tab1" />);

    const [tab1, tab2, tab3] = screen.getAllByRole("tab");
    expect(tab1).toHaveAttribute("aria-selected", "true");
    expect(tab2).toHaveAttribute("aria-selected", "false");
    expect(tab3).toHaveAttribute("aria-selected", "false");
  });

  it("aria-selected updates when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(<TestTabs />);

    await user.click(screen.getByRole("tab", { name: /Tab 3/i }));

    const [tab1, tab2, tab3] = screen.getAllByRole("tab");
    expect(tab1).toHaveAttribute("aria-selected", "false");
    expect(tab2).toHaveAttribute("aria-selected", "false");
    expect(tab3).toHaveAttribute("aria-selected", "true");
  });

  it("selected tab is in tab order (tabIndex=0), others are removed (tabIndex=-1)", () => {
    render(<TestTabs defaultValue="tab1" />);

    const [tab1, tab2, tab3] = screen.getAllByRole("tab");
    expect(tab1).toHaveAttribute("tabindex", "0");
    expect(tab2).toHaveAttribute("tabindex", "-1");
    expect(tab3).toHaveAttribute("tabindex", "-1");
  });

  it("tab aria-controls points to the corresponding tabpanel id", () => {
    render(<TestTabs />);

    const tabs = screen.getAllByRole("tab");
    const panels = screen.getAllByRole("tabpanel", { hidden: true });

    tabs.forEach((tab, i) => {
      const controlsId = tab.getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      expect(panels[i]).toHaveAttribute("id", controlsId!);
    });
  });

  it("tabpanel aria-labelledby points to the corresponding tab id", () => {
    render(<TestTabs />);

    const tabs = screen.getAllByRole("tab");
    const panels = screen.getAllByRole("tabpanel", { hidden: true });

    panels.forEach((panel, i) => {
      const labelId = panel.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(tabs[i]).toHaveAttribute("id", labelId!);
    });
  });

  it("ArrowRight moves focus to the next tab", async () => {
    const user = userEvent.setup();
    render(<TestTabs defaultValue="tab1" />);

    screen.getByRole("tab", { name: /Tab 1/i }).focus();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Tab 2/i }));
  });

  it("ArrowLeft moves focus to the previous tab", async () => {
    const user = userEvent.setup();
    render(<TestTabs defaultValue="tab2" />);

    screen.getByRole("tab", { name: /Tab 2/i }).focus();
    await user.keyboard("{ArrowLeft}");

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Tab 1/i }));
  });

  it("ArrowRight wraps from last tab to first", async () => {
    const user = userEvent.setup();
    render(<TestTabs defaultValue="tab3" />);

    screen.getByRole("tab", { name: /Tab 3/i }).focus();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Tab 1/i }));
  });

  it("ArrowLeft wraps from first tab to last", async () => {
    const user = userEvent.setup();
    render(<TestTabs defaultValue="tab1" />);

    screen.getByRole("tab", { name: /Tab 1/i }).focus();
    await user.keyboard("{ArrowLeft}");

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Tab 3/i }));
  });

  it("Home moves focus to the first tab", async () => {
    const user = userEvent.setup();
    render(<TestTabs defaultValue="tab3" />);

    screen.getByRole("tab", { name: /Tab 3/i }).focus();
    await user.keyboard("{Home}");

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Tab 1/i }));
  });

  it("End moves focus to the last tab", async () => {
    const user = userEvent.setup();
    render(<TestTabs defaultValue="tab1" />);

    screen.getByRole("tab", { name: /Tab 1/i }).focus();
    await user.keyboard("{End}");

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Tab 3/i }));
  });

  it("fires onValueChange with the new value when a tab is clicked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<TestTabs onValueChange={onValueChange} />);

    await user.click(screen.getByRole("tab", { name: /Tab 2/i }));

    expect(onValueChange).toHaveBeenCalledWith("tab2");
  });

  it("tablist has role=tablist", () => {
    render(<TestTabs />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
