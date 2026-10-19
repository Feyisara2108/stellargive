import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPanel } from "./AdminPanel";
import type { Campaign } from "@/lib/soroban";

const hooks = vi.hoisted(() => {
  const makeMutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    addToWhitelist: makeMutation(),
    cancelCampaign: makeMutation(),
    addUpdate: makeMutation(),
    pauseContract: makeMutation(),
    unpauseContract: makeMutation(),
    setOwner: makeMutation(),
    wallet: { address: null as string | null },
    platformConfig: {
      data: undefined as any,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    },
    toastError: vi.fn(),
  };
});

vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useAddToWhitelist: () => hooks.addToWhitelist,
    useCancelCampaign: () => hooks.cancelCampaign,
    useAddUpdate: () => hooks.addUpdate,
    usePauseContract: () => hooks.pauseContract,
    useUnpauseContract: () => hooks.unpauseContract,
    useSetOwner: () => hooks.setOwner,
    usePlatformConfig: () => hooks.platformConfig,
    useResolvedName: () => ({ data: undefined }),
  }),
);

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => hooks.wallet,
}));

vi.mock("sonner", () => ({
  toast: { error: hooks.toastError, success: vi.fn() },
}));

const VALID_ADDRESS = "G" + "A".repeat(55);

const activeCampaign: Campaign = {
  id: 1n,
  creator: VALID_ADDRESS,
  beneficiary: VALID_ADDRESS,
  beneficiaries: [],
  title: "Flood Relief",
  description: "Help flood victims",
  category: "Disaster",
  target_amount: 1000n,
  raised_amount: 100n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
  accepted_token: VALID_ADDRESS,
  status: "Active",
};

const claimedCampaign: Campaign = {
  ...activeCampaign,
  id: 2n,
  title: "School Fund",
  status: "Claimed",
};

function renderPanel(campaigns: Campaign[] = [activeCampaign, claimedCampaign]) {
  const user = userEvent.setup();
  const view = render(<AdminPanel ownedCampaigns={campaigns} />);
  const rerender = () => view.rerender(<AdminPanel ownedCampaigns={campaigns} />);
  return Object.assign(user, { rerender });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [
    hooks.addToWhitelist,
    hooks.cancelCampaign,
    hooks.addUpdate,
    hooks.pauseContract,
    hooks.unpauseContract,
    hooks.setOwner,
  ]) {
    m.isPending = false;
    m.mutateAsync.mockReset();
    m.mutateAsync.mockResolvedValue(undefined);
  }
  hooks.platformConfig.data = {
    owner: VALID_ADDRESS,
    totalCampaigns: 7n,
    feeBps: 250,
    feeDenominator: 10000,
  };
  hooks.wallet.address = VALID_ADDRESS;
  hooks.platformConfig.isLoading = false;
  hooks.platformConfig.isError = false;
  hooks.platformConfig.isFetching = false;
  try {
    localStorage.clear();
  } catch {}
});

describe("AdminPanel – platform configuration", () => {
  it("renders total campaigns and the computed fee percentage", () => {
    renderPanel();
    expect(screen.getByText("Platform Configuration")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("2.50%")).toBeInTheDocument();
  });

  it("shows no config values while loading", () => {
    hooks.platformConfig.data = undefined;
    hooks.platformConfig.isLoading = true;
    renderPanel();
    expect(screen.queryByText("2.50%")).not.toBeInTheDocument();
    expect(screen.queryByText("Total Campaigns")).not.toBeInTheDocument();
  });

  it("shows an error state and retries via refetch", async () => {
    hooks.platformConfig.data = undefined;
    hooks.platformConfig.isError = true;
    const user = renderPanel();

    expect(screen.getByText("Failed to load platform configuration")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(hooks.platformConfig.refetch).toHaveBeenCalled();
  });

  it("disables the refresh button while fetching", () => {
    hooks.platformConfig.isFetching = true;
    renderPanel();
    expect(screen.getByRole("button", { name: "Refresh platform configuration" })).toBeDisabled();
  });

  it("refetches when the refresh button is clicked", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: "Refresh platform configuration" }));
    expect(hooks.platformConfig.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("AdminPanel – pause", () => {
  it("shows contract controls only to the configured owner", () => {
    hooks.wallet.address = "G" + "B".repeat(55);
    renderPanel();

    expect(screen.queryByText("Contract Controls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pause Contract$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Unpause Contract$/ })).not.toBeInTheDocument();
    expect(screen.getByText("Campaign Management")).toBeInTheDocument();
  });

  it("shows pause and unpause controls to the configured owner", () => {
    renderPanel();

    expect(screen.getByText("Contract Controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pause Contract$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Unpause Contract$/ })).toBeInTheDocument();
  });

  it("keeps the confirm button disabled until PAUSE is typed", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Pause Contract$/ }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Pause Contract" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByPlaceholderText("PAUSE"), "pause");
    expect(confirm).toBeDisabled();

    await user.clear(within(dialog).getByPlaceholderText("PAUSE"));
    await user.type(within(dialog).getByPlaceholderText("PAUSE"), "PAUSE");
    expect(confirm).toBeEnabled();
  });

  it("pauses the contract and closes the dialog on success", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Pause Contract$/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("PAUSE"), "PAUSE");
    await user.click(within(dialog).getByRole("button", { name: "Pause Contract" }));

    expect(hooks.pauseContract.mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("clears the typed text when the dialog is cancelled", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Pause Contract$/ }));

    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("PAUSE"), "PAUS");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^Pause Contract$/ }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByPlaceholderText("PAUSE")).toHaveValue("");
    expect(hooks.pauseContract.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when pausing fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.pauseContract.mutateAsync.mockRejectedValue(new Error("tx failed"));
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Pause Contract$/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("PAUSE"), "PAUSE");
    await user.click(within(dialog).getByRole("button", { name: "Pause Contract" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("disables the trigger while a pause is pending", () => {
    hooks.pauseContract.isPending = true;
    renderPanel();
    expect(screen.getByRole("button", { name: /^Pause Contract$/ })).toBeDisabled();
  });

  it("renders the Pausing... label inside the open dialog while pending", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Pause Contract$/ }));
    await screen.findByRole("dialog");

    hooks.pauseContract.isPending = true;
    user.rerender();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Pausing/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("AdminPanel – unpause", () => {
  it("unpauses the contract and closes the dialog on success", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Unpause Contract$/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Unpause Contract?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Unpause Contract" }));

    expect(hooks.unpauseContract.mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not unpause when the dialog is cancelled", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Unpause Contract$/ }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(hooks.unpauseContract.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when unpausing fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.unpauseContract.mutateAsync.mockRejectedValue(new Error("tx failed"));
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: /^Unpause Contract$/ }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Unpause Contract" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("disables the trigger while an unpause is pending", () => {
    hooks.unpauseContract.isPending = true;
    renderPanel();
    expect(screen.getByRole("button", { name: /^Unpause Contract$/ })).toBeDisabled();
  });
});

describe("AdminPanel – cancel campaign", () => {
  it("only enables Cancel for active campaigns", () => {
    renderPanel();
    const cancelButtons = screen.getAllByRole("button", { name: /Cancel$/ });
    expect(cancelButtons).toHaveLength(2);
    expect(cancelButtons[0]).toBeEnabled();
    expect(cancelButtons[1]).toBeDisabled();
  });

  it("cancels the selected campaign after confirmation", async () => {
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Cancel$/ })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cancel this campaign?")).toBeInTheDocument();
    expect(within(dialog).getByText("Flood Relief")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Yes, Cancel Campaign" }));

    expect(hooks.cancelCampaign.mutateAsync).toHaveBeenCalledWith(1n);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not cancel when the user goes back", async () => {
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Cancel$/ })[0]);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Go Back" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(hooks.cancelCampaign.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when cancelling fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.cancelCampaign.mutateAsync.mockRejectedValue(new Error("tx failed"));
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Cancel$/ })[0]);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Yes, Cancel Campaign" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("shows the Cancelling... state and disables the dialog buttons while pending", async () => {
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Cancel$/ })[0]);
    await screen.findByRole("dialog");

    hooks.cancelCampaign.isPending = true;
    user.rerender();

    expect(screen.getByRole("button", { name: /Cancelling/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go Back" })).toBeDisabled();
  });
});

describe("AdminPanel – post update", () => {
  it("opens the update dialog for the chosen campaign", async () => {
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Post Update/ })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Post Update for Flood Relief")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Campaign update content")).toBeInTheDocument();
  });

  it("submits the update content and closes the dialog on success", async () => {
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Post Update/ })[0]);

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Campaign update content"), "We hit 50%!");
    await user.click(within(dialog).getByRole("button", { name: "Post Update" }));

    await waitFor(() =>
      expect(hooks.addUpdate.mutateAsync).toHaveBeenCalledWith({
        campaignId: 1n,
        content: "We hit 50%!",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows an error and keeps the dialog open when posting fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.addUpdate.mutateAsync.mockRejectedValue(new Error("Update rejected"));
    const user = renderPanel();
    await user.click(screen.getAllByRole("button", { name: /Post Update/ })[0]);

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Campaign update content"), "Hello");
    await user.click(within(dialog).getByRole("button", { name: "Post Update" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Update rejected");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("disables the Post Update triggers while an update is pending", () => {
    hooks.addUpdate.isPending = true;
    renderPanel();
    for (const btn of screen.getAllByRole("button", { name: /Post Update/ })) {
      expect(btn).toBeDisabled();
    }
  });
});

describe("AdminPanel – whitelist", () => {
  async function selectCampaign(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Flood Relief/ }));
  }

  it("disables submit until a campaign and address are provided", async () => {
    const user = renderPanel();
    const submit = screen.getByRole("button", { name: "Whitelist Address" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Stellar Address to Whitelist"), VALID_ADDRESS);
    expect(submit).toBeDisabled();

    await selectCampaign(user);
    expect(submit).toBeEnabled();
  });

  it("shows a validation error for a malformed address", async () => {
    const user = renderPanel();
    await selectCampaign(user);
    await user.type(screen.getByLabelText("Stellar Address to Whitelist"), "not-an-address");

    expect(screen.getByText(/Invalid Stellar address format/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whitelist Address" })).toBeDisabled();
  });

  it("whitelists the address, shows success, and lists it as recent", async () => {
    const user = renderPanel();
    await selectCampaign(user);
    await user.type(screen.getByLabelText("Stellar Address to Whitelist"), VALID_ADDRESS);
    await user.click(screen.getByRole("button", { name: "Whitelist Address" }));

    await waitFor(() =>
      expect(hooks.addToWhitelist.mutateAsync).toHaveBeenCalledWith({
        campaignId: 1n,
        addressToWhitelist: VALID_ADDRESS,
      }),
    );
    expect(
      await screen.findByText(`Successfully whitelisted ${VALID_ADDRESS} for campaign #1`),
    ).toBeInTheDocument();
    expect(screen.getByText("Recently Whitelisted")).toBeInTheDocument();
    expect(screen.getByLabelText("Stellar Address to Whitelist")).toHaveValue("");
  });

  it("shows a toast with the error message when whitelisting fails", async () => {
    hooks.addToWhitelist.mutateAsync.mockRejectedValue(new Error("Not the owner"));
    const user = renderPanel();
    await selectCampaign(user);
    await user.type(screen.getByLabelText("Stellar Address to Whitelist"), VALID_ADDRESS);
    await user.click(screen.getByRole("button", { name: "Whitelist Address" }));

    await waitFor(() => expect(hooks.toastError).toHaveBeenCalledWith("Not the owner"));
    expect(screen.queryByText(/Successfully whitelisted/)).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Whitelisted")).not.toBeInTheDocument();
  });

  it("shows the pending state and disables the form while whitelisting", () => {
    hooks.addToWhitelist.isPending = true;
    renderPanel();
    expect(screen.getByRole("button", { name: /Whitelisting Address/ })).toBeDisabled();
    expect(screen.getByLabelText("Stellar Address to Whitelist")).toBeDisabled();
  });
});

describe("AdminPanel – ownership transfer", () => {
  // A real, checksum-valid account address (VALID_ADDRESS is the current owner).
  const NEW_OWNER = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

  it("is hidden from wallets that are not the contract owner", () => {
    hooks.wallet.address = NEW_OWNER;
    renderPanel();
    expect(screen.queryByRole("heading", { name: /Transfer Ownership/i })).not.toBeInTheDocument();
  });

  it("is hidden while the owner is unknown", () => {
    hooks.wallet.address = VALID_ADDRESS;
    hooks.platformConfig.data = undefined;
    renderPanel();
    expect(screen.queryByRole("heading", { name: /Transfer Ownership/i })).not.toBeInTheDocument();
  });

  it("is shown to the contract owner, even without campaigns", () => {
    hooks.wallet.address = VALID_ADDRESS;
    renderPanel([]);
    expect(screen.getByRole("heading", { name: /Transfer Ownership/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Campaign Management/i })).not.toBeInTheDocument();
  });

  it.each([
    ["a malformed address", "not-an-address", /Invalid Stellar address/],
    ["a bad checksum", NEW_OWNER.slice(0, 55) + "A", /Invalid Stellar address/],
    [
      "a contract address",
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      /Invalid Stellar address/,
    ],
    ["the current owner", "", /already the owner/],
  ])("rejects %s before signing", async (_label, input, message) => {
    // Use a checksum-valid owner so "already the owner" is reachable.
    hooks.platformConfig.data.owner = NEW_OWNER;
    hooks.wallet.address = NEW_OWNER;
    const user = renderPanel();

    await user.type(screen.getByLabelText(/New owner address/i), input || NEW_OWNER);
    await user.click(screen.getByRole("button", { name: /Review Transfer/i }));

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hooks.setOwner.mutateAsync).not.toHaveBeenCalled();
  });

  it("requires typing TRANSFER, then signs set_owner with the new address", async () => {
    hooks.wallet.address = VALID_ADDRESS;
    const user = renderPanel();

    await user.type(screen.getByLabelText(/New owner address/i), `  ${NEW_OWNER} `);
    await user.click(screen.getByRole("button", { name: /Review Transfer/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("transfer-new-owner")).toHaveTextContent(NEW_OWNER);
    const confirm = within(dialog).getByRole("button", { name: /^Transfer Ownership$/i });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/to confirm/i), "transfer");
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByLabelText(/to confirm/i));
    await user.type(within(dialog).getByLabelText(/to confirm/i), "TRANSFER");
    await user.click(confirm);

    expect(hooks.setOwner.mutateAsync).toHaveBeenCalledWith(NEW_OWNER);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText(/New owner address/i)).toHaveValue("");
  });

  it("keeps the dialog open when the transfer fails", async () => {
    hooks.wallet.address = VALID_ADDRESS;
    hooks.setOwner.mutateAsync.mockRejectedValue(new Error("rejected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = renderPanel();

    await user.type(screen.getByLabelText(/New owner address/i), NEW_OWNER);
    await user.click(screen.getByRole("button", { name: /Review Transfer/i }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/to confirm/i), "TRANSFER");
    await user.click(within(dialog).getByRole("button", { name: /^Transfer Ownership$/i }));

    await waitFor(() => expect(hooks.setOwner.mutateAsync).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
