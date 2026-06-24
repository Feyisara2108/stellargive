import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { ClaimButton } from "./ClaimButton";
import { WalletContext } from "@/lib/WalletProvider";
import {
  mockFundedCampaign,
  mockExpiredCampaign,
  mockClaimedCampaign,
  mockCampaign,
} from "@/stories/mocks";

const CREATOR = mockFundedCampaign.creator;

const withWallet = (address: string | null) =>
  function WalletDecorator(Story: React.ComponentType) {
    return (
      <WalletContext.Provider
        value={{ address, isConnected: !!address, connect: async () => {}, disconnect: () => {} }}
      >
        <Story />
      </WalletContext.Provider>
    );
  };

const meta: Meta<typeof ClaimButton> = {
  title: "Components/ClaimButton",
  component: ClaimButton,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof ClaimButton>;

export const Claimable: Story = {
  decorators: [withWallet(CREATOR)],
  args: { campaign: mockFundedCampaign },
};

export const ClaimableExpired: Story = {
  decorators: [withWallet(CREATOR)],
  args: { campaign: mockExpiredCampaign },
};

export const Claimed: Story = {
  args: { campaign: mockClaimedCampaign },
};

// Wallet connected but address is not creator/beneficiary — button is hidden.
export const NotVisible: Story = {
  decorators: [withWallet("GDIFFERENTADDRESSNOTCREATORBENEFICIARY")],
  args: { campaign: mockCampaign },
};
