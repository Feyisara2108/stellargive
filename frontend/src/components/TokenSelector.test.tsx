import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenSelector, PREDEFINED_TOKENS } from "./TokenSelector";
import "@testing-library/jest-dom";

import { vi } from "vitest";

// Mock external dependencies
vi.mock("lucide-react", () => ({
  Loader2: () => <div data-testid="loader2-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Check: () => <div data-testid="check-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  Coins: () => <div data-testid="coins-icon" />,
  ShieldCheck: () => <div data-testid="shield-check-icon" />,
}));

vi.mock("@/lib/soroban", () => ({
  getTokenMetadata: vi.fn(),
}));

// TokenSelector calls useTokenMetadata (react-query) for non-predefined tokens.
// Mock the hook so the component renders without a QueryClientProvider.
vi.mock("@/hooks/useSoroban", () => ({
  useTokenMetadata: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TokenSelector", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("Default & Selected State Assertion", () => {
    // Render pre-selecting the first token (XLM)
    const selectedToken = PREDEFINED_TOKENS[0];
    render(<TokenSelector value={selectedToken.address} onChange={mockOnChange} />);

    // Assert that the component correctly displays the selected token symbol
    expect(screen.getByText(selectedToken.symbol)).toBeInTheDocument();

    // Check if the truncated address is also present
    const truncatedAddress = `${selectedToken.address.slice(0, 6)}...${selectedToken.address.slice(-6)}`;
    expect(screen.getByText(`(${truncatedAddress})`)).toBeInTheDocument();
  });

  test("Available Token List Rendering", () => {
    // Render with no token selected
    render(<TokenSelector value="" onChange={mockOnChange} />);

    // Assert the default placeholder is shown
    expect(screen.getByText(/Select a token/i)).toBeInTheDocument();

    // Open the dropdown
    const selectButton = screen.getByRole("button", { name: /Select a token/i });
    fireEvent.click(selectButton);

    // Assert that all predefined tokens are visibly rendered
    PREDEFINED_TOKENS.forEach((token) => {
      // Because the text is split across different spans inside the button,
      // we check for both symbol and name texts to exist.
      expect(screen.getByText(token.symbol)).toBeInTheDocument();
      expect(screen.getByText(token.name)).toBeInTheDocument();
    });
  });

  test("Change Handler Invocation", () => {
    // Render pre-selecting the first token
    const firstToken = PREDEFINED_TOKENS[0];
    render(<TokenSelector value={firstToken.address} onChange={mockOnChange} />);

    // Open the dropdown. Since a token is selected, the button contains the symbol text.
    const selectButton = screen.getByRole("button", { name: new RegExp(firstToken.symbol, "i") });
    fireEvent.click(selectButton);

    // Simulate clicking a different token (e.g., USDC)
    const secondToken = PREDEFINED_TOKENS[1];

    // Find the option button for the new token by looking for its name content
    const secondOption = screen.getByText(secondToken.name).closest("button");
    expect(secondOption).toBeInTheDocument();

    if (secondOption) {
      fireEvent.click(secondOption);
    }

    // Assert that onChange was called exactly once with the correct address
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith(secondToken.address);
  });
});

describe("TokenSelector — recent tokens", () => {
  const onChange = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const openMenu = () => fireEvent.click(screen.getAllByRole("button")[0]);

  test("records a selection and shows it as a quick-pick chip", () => {
    const { unmount } = render(<TokenSelector value="" onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByText(PREDEFINED_TOKENS[1].name).closest("button")!);
    expect(JSON.parse(window.localStorage.getItem("stellargive:recent-tokens")!)).toEqual([
      { address: PREDEFINED_TOKENS[1].address, symbol: PREDEFINED_TOKENS[1].symbol },
    ]);
    unmount();

    render(<TokenSelector value="" onChange={onChange} />);
    openMenu();
    const chip = screen.getByRole("button", {
      name: `Use recent token ${PREDEFINED_TOKENS[1].symbol}`,
    });
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(PREDEFINED_TOKENS[1].address);
  });

  test("clear button empties the recents list and storage", () => {
    window.localStorage.setItem(
      "stellargive:recent-tokens",
      JSON.stringify([{ address: PREDEFINED_TOKENS[0].address, symbol: "XLM" }]),
    );
    render(<TokenSelector value="" onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Clear recent tokens/i }));
    expect(screen.queryByTestId("recent-tokens")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("stellargive:recent-tokens")).toBeNull();
  });

  test("ignores corrupt storage without throwing", () => {
    window.localStorage.setItem("stellargive:recent-tokens", "{not json");
    render(<TokenSelector value="" onChange={onChange} />);
    openMenu();
    expect(screen.queryByTestId("recent-tokens")).not.toBeInTheDocument();
  });
});
