import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PostUpdateForm } from "./PostUpdateForm";

const CAMPAIGN_ID = "campaign-123";
const onSuccess = vi.fn();
const addUpdateMutation = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  addUpdateMutation.mockResolvedValue(undefined);
});

function renderForm(props: Partial<React.ComponentProps<typeof PostUpdateForm>> = {}) {
  return render(
    <PostUpdateForm
      campaignId={CAMPAIGN_ID}
      onSuccess={onSuccess}
      addUpdateMutation={addUpdateMutation}
      {...props}
    />,
  );
}

describe("PostUpdateForm — validation", () => {
  it("disables submit button when content is empty", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Post Update/i })).toBeDisabled();
  });

  it("disables submit button when content is only whitespace", () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: /Post Update/i })).toBeDisabled();
  });

  it("enables submit button when content is non-empty", () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "New update" },
    });
    expect(screen.getByRole("button", { name: /Post Update/i })).not.toBeDisabled();
  });

  it("truncates contents to the max length and keeps submit enabled", () => {
    renderForm();
    const longContent = "a".repeat(281);
    const textarea = screen.getByPlaceholderText(/Tell your backers/i);
    fireEvent.change(textarea, {
      target: { value: longContent },
    });
    expect(textarea).toHaveValue("a".repeat(280));
    expect(screen.getByText("0 characters remaining")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Post Update/i })).not.toBeDisabled();
  });

  it("shows remaining characters count", () => {
    renderForm();
    expect(screen.getByText("280 characters remaining")).toBeInTheDocument();
  });

  it("updates remaining characters as user types", () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "Hello" },
    });
    expect(screen.getByText("275 characters remaining")).toBeInTheDocument();
  });
});

describe("PostUpdateForm — submission", () => {
  it("calls addUpdateMutation with campaignId and trimmed content", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "  New update  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post Update/i }));

    await waitFor(() => {
      expect(addUpdateMutation).toHaveBeenCalledWith(CAMPAIGN_ID, "New update");
    });
  });

  it("calls onSuccess after successful submission", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "Update content" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post Update/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("clears the textarea after successful submission", async () => {
    renderForm();
    const textarea = screen.getByPlaceholderText(/Tell your backers/i);
    fireEvent.change(textarea, { target: { value: "Update content" } });
    fireEvent.click(screen.getByRole("button", { name: /Post Update/i }));

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("submits when content is truncated at the character limit", async () => {
    renderForm();
    const longContent = "a".repeat(281);
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: longContent },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post Update/i }));

    await waitFor(() => {
      expect(addUpdateMutation).toHaveBeenCalledWith(CAMPAIGN_ID, "a".repeat(280));
    });
  });
});

describe("PostUpdateForm — pending state", () => {
  it("disables textarea and button while submitting", async () => {
    let resolveMutation: () => void;
    addUpdateMutation.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "Update content" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post Update/i }));

    await waitFor(() => {
      expect(screen.getByText("Submitting to Soroban...")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/Tell your backers/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Submitting to Soroban/i })).toBeDisabled();

    resolveMutation!();
  });
});

describe("PostUpdateForm — error handling", () => {
  it("displays error message when mutation fails", async () => {
    addUpdateMutation.mockRejectedValue(new Error("Transaction failed"));
    renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Tell your backers/i), {
      target: { value: "Update content" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post Update/i }));

    await waitFor(() => {
      expect(screen.getByText("Transaction failed")).toBeInTheDocument();
    });
  });
});

describe("PostUpdateForm — update limit (#1093)", () => {
  it("shows how many of the 10 updates are used", () => {
    renderForm({ updateCount: 3 });
    expect(screen.getByTestId("update-count")).toHaveTextContent("3 of 10 updates used");
    expect(screen.getByPlaceholderText(/Tell your backers/i)).not.toBeDisabled();
  });

  it("disables posting with an explanation once 10 updates exist", () => {
    renderForm({ updateCount: 10 });
    expect(screen.getByTestId("update-count")).toHaveTextContent("10 of 10 updates used");
    expect(screen.getByText(/reached the limit of 10 updates/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tell your backers/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Post Update/i })).toBeDisabled();
  });

  it("does not submit at the limit even with a restored draft", () => {
    localStorage.setItem(`stellargive_update_draft_${CAMPAIGN_ID}`, "Draft text");
    renderForm({ updateCount: 10 });
    fireEvent.submit(screen.getByRole("button", { name: /Post Update/i }).closest("form")!);
    expect(addUpdateMutation).not.toHaveBeenCalled();
    localStorage.removeItem(`stellargive_update_draft_${CAMPAIGN_ID}`);
  });

  it("hides the counter when the count is unknown", () => {
    renderForm();
    expect(screen.queryByTestId("update-count")).not.toBeInTheDocument();
  });
});
