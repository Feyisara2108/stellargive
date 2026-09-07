import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "./empty-state";

const meta: Meta<typeof EmptyState> = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const NoCampaigns: Story = {
  render: () => (
    <div className="max-w-sm">
      <EmptyState message="No campaigns found" />
    </div>
  ),
};

export const NoSearchResults: Story = {
  render: () => (
    <div className="max-w-sm">
      <EmptyState message="No results match your search" onClear={() => {}} />
    </div>
  ),
};

export const CustomMessage: Story = {
  render: () => (
    <div className="max-w-sm">
      <EmptyState message="You haven't made any donations yet" />
    </div>
  ),
};
