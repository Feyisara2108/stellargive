import type { Meta, StoryObj } from "@storybook/react";
import { StatCard } from "./stat-card";
import { TrendingUp, HandCoins, Megaphone, Users } from "lucide-react";

const meta: Meta<typeof StatCard> = {
  title: "UI/StatCard",
  component: StatCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof StatCard>;

export const TotalRaised: Story = {
  render: () => (
    <StatCard
      icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
      title="Total Raised"
      value="15,432.50 XLM"
    />
  ),
};

export const TotalDonated: Story = {
  render: () => (
    <StatCard
      icon={<HandCoins className="h-4 w-4 text-green-500" />}
      title="Total Donated"
      value="8,245.25 XLM"
    />
  ),
};

export const ActiveCampaigns: Story = {
  render: () => (
    <StatCard
      icon={<Megaphone className="h-4 w-4 text-purple-500" />}
      title="Active Campaigns"
      value="12"
    />
  ),
};

export const TotalCampaigns: Story = {
  render: () => (
    <StatCard
      icon={<Users className="h-4 w-4 text-primary" />}
      title="Total Campaigns"
      value="47"
    />
  ),
};

export const WithChangeIndicator: Story = {
  render: () => (
    <div className="flex gap-4">
      <StatCard title="Total Raised" value="15,432.50 XLM" change="+12.5%" />
      <StatCard title="Total Raised" value="15,432.50 XLM" change="-3.2%" />
    </div>
  ),
};

export const WithTooltip: Story = {
  render: () => (
    <StatCard title="Total Raised" value="15,432.50 XLM" tooltip="Sum of all donations on-chain" />
  ),
};

export const Loading: Story = {
  render: () => <StatCard title="Total Raised" value="15,432.50 XLM" loading />,
};

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
      <StatCard
        icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
        title="Total Raised"
        value="15,432.50 XLM"
      />
      <StatCard
        icon={<HandCoins className="h-4 w-4 text-green-500" />}
        title="Total Donated"
        value="8,245.25 XLM"
      />
      <StatCard
        icon={<Megaphone className="h-4 w-4 text-purple-500" />}
        title="Active Campaigns"
        value="12"
      />
    </div>
  ),
};
