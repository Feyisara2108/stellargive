import type { Meta, StoryObj } from "@storybook/react";
import { GasWarning } from "./GasWarning";
import { MAX_SIMULATION_FEE_STROOPS } from "@/lib/soroban";

const meta: Meta<typeof GasWarning> = {
  title: "Components/GasWarning",
  component: GasWarning,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GasWarning>;

export const Default: Story = {
  args: {
    feeStroops: MAX_SIMULATION_FEE_STROOPS * 2,
    onDismiss: () => {},
  },
};

export const NoDismiss: Story = {
  args: {
    feeStroops: MAX_SIMULATION_FEE_STROOPS * 2,
  },
};

export const ExtremelyHighFee: Story = {
  args: {
    feeStroops: MAX_SIMULATION_FEE_STROOPS * 10,
    onDismiss: () => {},
  },
};
