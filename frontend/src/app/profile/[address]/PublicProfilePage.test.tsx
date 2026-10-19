import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicProfilePage, { generateMetadata } from "./page";

vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/AddressLink", () => ({
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}));

const VALID_ADDRESS = "G" + "B".repeat(55);
const INVALID_ADDRESS = "not-a-stellar-address";

describe("PublicProfilePage", () => {
  it("renders for a valid address", async () => {
    const jsx = await PublicProfilePage({ params: Promise.resolve({ address: VALID_ADDRESS }) });
    render(jsx);

    expect(screen.getByText("Public Profile")).toBeInTheDocument();
    expect(screen.getByText(VALID_ADDRESS)).toBeInTheDocument();
    expect(
      screen.getByText(/Public profile data will be loaded from on-chain events/i),
    ).toBeInTheDocument();
  });

  it("handles an invalid address without crashing", async () => {
    const jsx = await PublicProfilePage({
      params: Promise.resolve({ address: INVALID_ADDRESS }),
    });
    render(jsx);

    expect(screen.getByText("Public Profile")).toBeInTheDocument();
    expect(screen.getByText(INVALID_ADDRESS)).toBeInTheDocument();
  });
});

describe("PublicProfilePage - generateMetadata", () => {
  it("builds a title with the truncated address for a valid address", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ address: VALID_ADDRESS }),
    });

    const truncated = `${VALID_ADDRESS.slice(0, 6)}...${VALID_ADDRESS.slice(-4)}`;
    expect(metadata.title).toBe(`Profile ${truncated} - StellarGive`);
    expect(metadata.description).toContain(truncated);
  });

  it("builds a title for a short/invalid address without throwing", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ address: INVALID_ADDRESS }),
    });

    const truncated = `${INVALID_ADDRESS.slice(0, 6)}...${INVALID_ADDRESS.slice(-4)}`;
    expect(metadata.title).toBe(`Profile ${truncated} - StellarGive`);
  });
});
