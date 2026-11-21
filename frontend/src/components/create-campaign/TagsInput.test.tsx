import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { TagsInput } from "./TagsInput";
import { useCampaignTags, type CampaignTagsState } from "./useCampaignTags";

function FormWrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm();
  return <FormProvider {...methods}>{children}</FormProvider>;
}

function InteractiveTagsInputWrapper({
  initialTags = [],
  initialInput = "",
  initialError = "",
  disabled = false,
}: {
  initialTags?: string[];
  initialInput?: string;
  initialError?: string;
  disabled?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState(initialInput);
  const [tagError, setTagError] = useState(initialError);

  const commitTag = vi.fn((raw: string) => {
    const trimmed = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput("");
    setTagError("");
  });

  const removeTag = vi.fn((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
    setTagError("");
  });

  const reset = vi.fn(() => {
    setTags([]);
    setTagInput("");
  });

  const state: CampaignTagsState = {
    tags,
    setTags,
    tagInput,
    setTagInput,
    tagError,
    setTagError,
    commitTag,
    removeTag,
    reset,
  };

  return (
    <FormWrapper>
      <TagsInput state={state} disabled={disabled} />
    </FormWrapper>
  );
}

function HarnessWithRealHook({ disabled = false }: { disabled?: boolean }) {
  const state = useCampaignTags();
  return (
    <FormWrapper>
      <TagsInput state={state} disabled={disabled} />
    </FormWrapper>
  );
}

describe("TagsInput", () => {
  it("renders empty state with placeholder and hint", () => {
    render(<InteractiveTagsInputWrapper />);

    expect(screen.getByPlaceholderText("Type a tag and press Enter or comma…")).toBeInTheDocument();
    expect(screen.getByText(/Press/)).toBeInTheDocument();
    expect(screen.getByText(/10 remaining/)).toBeInTheDocument();
  });

  it("pressing Enter commits the typed tag", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    await user.type(input, "water");
    await user.keyboard("{Enter}");

    expect(screen.getByText("water")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByText(/9 remaining/)).toBeInTheDocument();
  });

  it("pressing comma commits the typed tag", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    await user.type(input, "clean,");

    expect(screen.getByText("clean")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("clicking the 'Remove tag <name>' button removes the chip", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    await user.type(input, "medical{Enter}");
    expect(screen.getByText("medical")).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: "Remove tag medical" });
    await user.click(removeBtn);

    expect(screen.queryByText("medical")).not.toBeInTheDocument();
    expect(screen.getByText(/10 remaining/)).toBeInTheDocument();
  });

  it("renders the error text when tagError is set", () => {
    render(<InteractiveTagsInputWrapper initialError="Maximum 10 tags allowed." />);

    const errorMsg = screen.getByRole("alert");
    expect(errorMsg).toHaveTextContent("Maximum 10 tags allowed.");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "campaign-tags-error");
  });

  it("clears tagError when user types into the input", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    // Trigger duplicate error
    await user.type(input, "relief{Enter}");
    await user.type(input, "relief{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Tag already added.");

    // Typing in input clears error
    await user.type(input, "a");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pressing Backspace in empty input removes the last tag", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    await user.type(input, "first{Enter}");
    await user.type(input, "second{Enter}");
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();

    await user.keyboard("{Backspace}");
    expect(screen.queryByText("second")).not.toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
  });

  it("pressing Backspace when input is not empty does not remove existing tags", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    await user.type(input, "first{Enter}");
    await user.type(input, "abc");
    await user.keyboard("{Backspace}");

    expect(input).toHaveValue("ab");
    expect(screen.getByText("first")).toBeInTheDocument();
  });

  it("commits pending tag on input blur", async () => {
    const user = userEvent.setup();
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    await user.type(input, "uncommitted");
    fireEvent.blur(input);

    expect(screen.getByText("uncommitted")).toBeInTheDocument();
  });

  it("clicking the tags container div focuses the input", () => {
    render(<HarnessWithRealHook />);

    const input = screen.getByRole("textbox");
    const container = input.parentElement!;
    fireEvent.click(container);

    expect(document.activeElement).toBe(input);
  });

  it("disables input and remove buttons when disabled prop is true", () => {
    render(<InteractiveTagsInputWrapper initialTags={["health", "wellness"]} disabled={true} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("disables input and removes placeholder when 10 tags are present", () => {
    const tenTags = Array.from({ length: 10 }, (_, i) => `tag-${i + 1}`);
    render(<InteractiveTagsInputWrapper initialTags={tenTags} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "");
  });
});
