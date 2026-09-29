import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select";

function TestSelect({
  defaultValue,
  onValueChange,
}: {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Select defaultValue={defaultValue} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("renders the trigger with placeholder when no value is selected", () => {
    render(<TestSelect />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Pick a fruit")).toBeInTheDocument();
  });

  it("shows the pre-selected value when defaultValue is provided", () => {
    render(<TestSelect defaultValue="banana" />);
    expect(screen.getByRole("combobox")).toHaveTextContent(/banana/i);
  });

  it("listbox is not visible before opening", () => {
    render(<TestSelect />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the listbox on trigger click", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /apple/i })).toBeInTheDocument();
  });

  it("selecting an option closes the listbox", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("option", { name: /banana/i }));

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("selecting an option updates the displayed value", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("option", { name: /cherry/i }));

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveTextContent(/cherry/i),
    );
  });

  it("fires onValueChange with the selected value", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<TestSelect onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("option", { name: /apple/i }));

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("apple"));
  });

  it("opens listbox with Enter key", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    screen.getByRole("combobox").focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("opens listbox with Space key", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    screen.getByRole("combobox").focus();
    await user.keyboard(" ");

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("opens listbox with ArrowDown key", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    screen.getByRole("combobox").focus();
    await user.keyboard("{ArrowDown}");

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("closes the listbox on Escape", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("trigger has aria-expanded=false when closed and true when open", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    await screen.findByRole("listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
