import React from "react";
import { vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TokenSelector, PREDEFINED_TOKENS } from "./TokenSelector";
import { getTokenMetadata, type TokenMetadata } from "@/lib/soroban";
import { toast } from "sonner";
import "@testing-library/jest-dom";

// Give the picker a second, real token address. The test environment sets its
// network before modules load, so an env override here would be too late.
vi.mock("@/lib/tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tokens")>()),
  USDC_CONTRACT_ID: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
}));

// Mock external dependencies
vi.mock("lucide-react", () => ({
  Loader2: () => <div data-testid="loader2-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Check: () => <div data-testid="check-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  Coins: () => <div data-testid="coins-icon" />,
  ShieldCheck: () => <div data-testid="shield-check-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
}));

vi.mock("@/lib/soroban", () => ({
  getTokenMetadata: vi.fn(),
}));

// TokenSelector calls useTokenMetadata (react-query) for non-predefined tokens.
// Mock the hook so the component renders without a QueryClientProvider.
vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useTokenMetadata: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
  }),
);

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

describe("TokenSelector — custom token", () => {
  const onChange = vi.fn();
  // Each test uses its own id: the metadata cache lives at module level.
  const contractId = (c: string) => `C${c.repeat(55)}`;
  const meta = (symbol: string): TokenMetadata => ({ symbol, decimals: 7, name: symbol });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const openCustomForm = () => {
    render(<TokenSelector value="" onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Add Custom Token/i }));
    return screen.getByPlaceholderText(/Contract ID/);
  };

  const type = (input: HTMLElement, value: string) =>
    fireEvent.change(input, { target: { value } });

  test("rejects a malformed id and clears the error when the input is emptied", () => {
    const input = openCustomForm();
    type(input, "GABC");
    expect(
      screen.getByText("Invalid contract format. Must start with 'C' and be 56 characters."),
    ).toBeInTheDocument();

    type(input, "");
    expect(screen.queryByText(/Invalid contract format/)).not.toBeInTheDocument();
    expect(getTokenMetadata).not.toHaveBeenCalled();
  });

  test("validates after the 600 ms debounce and shows the symbol", async () => {
    let resolve!: (m: TokenMetadata) => void;
    vi.mocked(getTokenMetadata).mockReturnValue(new Promise((r) => (resolve = r)));
    const input = openCustomForm();
    type(input, contractId("A"));

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(getTokenMetadata).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(/Validating SAC interface compliance/)).toBeInTheDocument();
    await vi.waitFor(() => expect(getTokenMetadata).toHaveBeenCalledWith(contractId("A")));

    await act(async () => resolve(meta("TKA")));
    await vi.waitFor(() => expect(screen.getByText("TKA")).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Validated SAC compliant token: TKA");
    expect(screen.queryByText(/Validating SAC interface compliance/)).not.toBeInTheDocument();
  });

  test("shows the lookup error message", async () => {
    vi.mocked(getTokenMetadata).mockRejectedValue(new Error("not a token contract"));
    const input = openCustomForm();
    type(input, contractId("B"));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await vi.waitFor(() => expect(screen.getByText("not a token contract")).toBeInTheDocument());
  });

  test("shows a generic message for a non-Error rejection", async () => {
    vi.mocked(getTokenMetadata).mockRejectedValue("boom");
    const input = openCustomForm();
    type(input, contractId("E"));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await vi.waitFor(() =>
      expect(screen.getByText("Failed to validate SAC interface compliance")).toBeInTheDocument(),
    );
  });

  test("uses the cache for a repeated id and adds the token", async () => {
    vi.mocked(getTokenMetadata).mockResolvedValue(meta("TKD"));
    const input = openCustomForm();
    type(input, contractId("D"));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await vi.waitFor(() => expect(screen.getByText("TKD")).toBeInTheDocument());

    type(input, "");
    type(input, contractId("D"));
    expect(screen.getByText("TKD")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(getTokenMetadata).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Add & Select/i }));
    expect(onChange).toHaveBeenCalledWith(contractId("D"));
    expect(screen.queryByPlaceholderText(/Contract ID/)).not.toBeInTheDocument();
  });
});
