import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/render";

const { walletState, connectMock, formMock } = vi.hoisted(() => ({
  walletState: { isConnected: false },
  connectMock: vi.fn(),
  formMock: vi.fn(),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({ isConnected: walletState.isConnected, connect: connectMock }),
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/components/CreateCampaignForm", () => ({
  CreateCampaignForm: (props: { inline?: boolean }) => {
    formMock(props);
    return <div data-testid="create-form" />;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CreateClient from "./CreateClient";

describe("Create page", () => {
  beforeEach(() => {
    walletState.isConnected = false;
    connectMock.mockReset();
    formMock.mockReset();
  });

  it("renders the shell with an h1 and the inline campaign form", () => {
    render(<CreateClient />);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /create a campaign/i })).toBeInTheDocument();
    expect(screen.getByTestId("create-form")).toBeInTheDocument();
    expect(formMock).toHaveBeenCalledWith(expect.objectContaining({ inline: true }));
  });

  it("prompts to connect a wallet when none is connected", async () => {
    connectMock.mockResolvedValue(true);
    render(<CreateClient />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
  });

  it("hides the connect prompt once a wallet is connected", () => {
    walletState.isConnected = true;
    render(<CreateClient />);
    expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("create-form")).toBeInTheDocument();
  });
});
